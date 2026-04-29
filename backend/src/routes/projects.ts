import type {
  AdminUser,
  ImportPostmanCollectionPayload,
  ImportPostmanCollectionResponse,
  ProjectDoc,
  ProjectEnvVar,
  User,
  WorkspaceMeta,
} from "@restify/shared";
import type { FastifyPluginAsync } from "fastify";
import { getWorkspaceById } from "../db/bootstrap.js";
import {
  createId,
  isoNow,
  serializeDoc,
  toObjectId,
  workspaceDataCollection,
} from "../db/collections.js";
import {
  canAccessWorkspace,
  canManagePrivateEntities,
  canManageProject,
  canViewEntity,
  getRequiredUser,
} from "../lib/permissions.js";
import { parsePostmanCollection } from "../lib/postman-import.js";
import {
  protectProjectEnvVarsForStorage,
  protectRequestAuthForStorage,
  protectRequestHeadersForStorage,
  revealProjectEnvVarsFromStorage,
} from "../lib/secure-storage.js";

type SessionUser = AdminUser | User;

function normalizeProject(
  project: ProjectDoc,
  dataEncryptionKey: string,
): ProjectDoc {
  return {
    ...project,
    envVars: revealProjectEnvVarsFromStorage(project.envVars, dataEncryptionKey),
    passwordHash: null,
    isPasswordProtected: false,
    isPrivate: Boolean(project.isPrivate),
  };
}

async function requireWorkspace(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId?: string,
): Promise<WorkspaceMeta> {
  const normalizedWorkspaceId = workspaceId?.trim();
  if (!normalizedWorkspaceId) {
    throw app.httpErrors.badRequest("Workspace ID is required");
  }

  let workspace: WorkspaceMeta | null;
  try {
    workspace = await getWorkspaceById(app.mongo, normalizedWorkspaceId);
  } catch {
    throw app.httpErrors.badRequest("Invalid workspace ID");
  }

  if (!workspace) {
    throw app.httpErrors.notFound("Workspace not found");
  }
  return workspace;
}

async function requireProject(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  projectId?: string,
  user?: SessionUser,
): Promise<ProjectDoc> {
  const normalizedProjectId = projectId?.trim();
  if (!normalizedProjectId) {
    throw app.httpErrors.badRequest("Project ID is required");
  }

  let objectId;
  try {
    objectId = toObjectId(normalizedProjectId);
  } catch {
    throw app.httpErrors.badRequest("Invalid project ID");
  }

  const project = await workspaceDataCollection(app.mongo, workspaceId).findOne(
    { _id: objectId, entityType: "project" },
  );
  if (!project) {
    throw app.httpErrors.notFound("Project not found");
  }

  const normalizedProject = normalizeProject(
    serializeDoc(project) as ProjectDoc,
    app.config.dataEncryptionKey,
  );
  if (user && !canViewEntity(user, normalizedProject)) {
    throw app.httpErrors.notFound("Project not found");
  }

  return normalizedProject;
}

function clampOrder(value: number | undefined, max: number) {
  return Math.max(0, Math.min(value ?? max, max));
}

function projectRevision(project: ProjectDoc): string {
  return project.updatedAt ?? project.createdAt;
}

function assertExpectedProjectRevision(
  app: Parameters<FastifyPluginAsync>[0],
  project: ProjectDoc,
  expectedUpdatedAt?: string,
) {
  if (expectedUpdatedAt && expectedUpdatedAt !== projectRevision(project)) {
    throw app.httpErrors.conflict(
      "Project was updated by another client. Refresh and try again.",
    );
  }
}

const projectRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { workspaceId: string; name: string } }>(
    "/projects",
    { preHandler: app.authenticate },
    async (request) => {
      const user = getRequiredUser(request);
      const name = request.body.name?.trim();
      if (!name) {
        throw app.httpErrors.badRequest("Project name is required");
      }

      const workspace = await requireWorkspace(app, request.body.workspaceId);
      if (!canAccessWorkspace(user, workspace) || user.role === "member") {
        throw app.httpErrors.forbidden(
          "You cannot create projects in this workspace",
        );
      }

      const now = isoNow();
      const projectId = createId();
      const maxOrderRecord = await workspaceDataCollection(
        app.mongo,
        workspace._id,
      )
        .find({ entityType: "project" })
        .sort({ order: -1 })
        .limit(1)
        .toArray();

      const project = {
        _id: projectId,
        entityType: "project",
        workspaceId: workspace._id,
        name,
        envVars: [] as ProjectEnvVar[],
        order:
          ((maxOrderRecord[0] as { order?: number } | undefined)?.order ?? -1) +
          1,
        ownerId: user._id,
        createdBy: user._id,
        passwordHash: null,
        isPasswordProtected: false,
        isPrivate: false,
        createdAt: now,
        updatedAt: now,
      };

      await workspaceDataCollection(app.mongo, workspace._id).insertOne(
        project as never,
      );
      app.publishRealtimeEvent({
        kind: "project.created",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
        projectIds: [projectId.toHexString()],
      });
      return {
        project: normalizeProject(
          serializeDoc(project) as ProjectDoc,
          app.config.dataEncryptionKey,
        ),
      };
    },
  );

  app.post<{ Body: ImportPostmanCollectionPayload }>(
    "/projects/import-postman",
    { preHandler: app.authenticate, bodyLimit: 10 * 1024 * 1024 },
    async (request): Promise<ImportPostmanCollectionResponse> => {
      const user = getRequiredUser(request);
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      if (!canAccessWorkspace(user, workspace) || user.role === "member") {
        throw app.httpErrors.forbidden(
          "You cannot import projects into this workspace",
        );
      }

      const importedCollection = parsePostmanCollection(request.body.collectionJson);
      const projectName = request.body.projectName?.trim() || importedCollection.projectName;
      const now = isoNow();
      const projectObjectId = createId();
      const projectId = projectObjectId.toHexString();
      const maxOrderRecord = await workspaceDataCollection(
        app.mongo,
        workspace._id,
      )
        .find({ entityType: "project" })
        .sort({ order: -1 })
        .limit(1)
        .toArray();

      const projectRecord = {
        _id: projectObjectId,
        entityType: "project",
        workspaceId: workspace._id,
        name: projectName,
        envVars: protectProjectEnvVarsForStorage(
          importedCollection.envVars,
          app.config.dataEncryptionKey,
        ),
        order:
          ((maxOrderRecord[0] as { order?: number } | undefined)?.order ?? -1) +
          1,
        ownerId: user._id,
        createdBy: user._id,
        passwordHash: null,
        isPasswordProtected: false,
        isPrivate: false,
        createdAt: now,
        updatedAt: now,
      };

      const records: Record<string, unknown>[] = [projectRecord];
      let importedFolders = 0;
      let importedRequests = 0;

      const appendRequests = (
        requests: typeof importedCollection.requests,
        folderId: string | null,
      ) => {
        requests.forEach((importedRequest, index) => {
          importedRequests += 1;
          records.push({
            _id: createId(),
            entityType: "request",
            workspaceId: workspace._id,
            projectId,
            folderId,
            name: importedRequest.name,
            method: importedRequest.method,
            url: importedRequest.url,
            headers: protectRequestHeadersForStorage(
              importedRequest.headers,
              app.config.dataEncryptionKey,
            ),
            params: importedRequest.params,
            body: importedRequest.body,
            auth: protectRequestAuthForStorage(
              importedRequest.auth,
              app.config.dataEncryptionKey,
            ),
            responseHistory: [],
            order: index,
            isPrivate: false,
            createdAt: now,
            updatedAt: now,
            contentUpdatedAt: now,
          });
        });
      };

      const appendFolders = (
        folders: typeof importedCollection.folders,
        parentFolderId: string | null,
      ) => {
        folders.forEach((importedFolder, index) => {
          importedFolders += 1;
          const folderObjectId = createId();
          const folderId = folderObjectId.toHexString();

          records.push({
            _id: folderObjectId,
            entityType: "folder",
            workspaceId: workspace._id,
            projectId,
            parentFolderId,
            name: importedFolder.name,
            order: index,
            isPrivate: false,
            createdAt: now,
            updatedAt: now,
          });

          appendRequests(importedFolder.requests, folderId);
          appendFolders(importedFolder.folders, folderId);
        });
      };

      appendRequests(importedCollection.requests, null);
      appendFolders(importedCollection.folders, null);

      await workspaceDataCollection(app.mongo, workspace._id).insertMany(
        records as never[],
      );

      app.publishRealtimeEvent({
        kind: "project.imported",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
        projectIds: [projectId],
      });

      return {
        project: await requireProject(app, workspace._id, projectId, user),
        importedFolders,
        importedRequests,
      };
    },
  );
  app.patch<{
    Params: { projectId: string };
    Body: {
      workspaceId: string;
      name?: string;
      envVars?: ProjectEnvVar[];
      isPrivate?: boolean;
      expectedUpdatedAt?: string;
    };
  }>(
    "/projects/:projectId",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const project = await requireProject(
        app,
        workspace._id,
        request.params.projectId,
        user,
      );

      if (
        "isPrivate" in request.body &&
        !canManagePrivateEntities(user)
      ) {
        throw app.httpErrors.forbidden(
          "Members cannot change private visibility",
        );
      }

      const patch: Record<string, unknown> = {
        updatedAt: isoNow(),
      };

      if ("name" in request.body) {
        const name = request.body.name?.trim();
        if (!name) {
          throw app.httpErrors.badRequest("Project name is required");
        }
        patch.name = name;
      }

      if ("envVars" in request.body) {
        patch.envVars = protectProjectEnvVarsForStorage(
          request.body.envVars ?? [],
          app.config.dataEncryptionKey,
        );
      }

      if ("isPrivate" in request.body) {
        patch.isPrivate = Boolean(request.body.isPrivate);
      }

      await app.assertProjectUnlocked(request, project, workspace);
      assertExpectedProjectRevision(
        app,
        project,
        request.body.expectedUpdatedAt,
      );

      const updateResult = await workspaceDataCollection(app.mongo, workspace._id).updateOne(
        request.body.expectedUpdatedAt
          ? { _id: toObjectId(project._id), updatedAt: request.body.expectedUpdatedAt }
          : { _id: toObjectId(project._id) },
        {
          $set: patch,
        },
      );
      if (request.body.expectedUpdatedAt && updateResult.matchedCount === 0) {
        throw app.httpErrors.conflict(
          "Project was updated by another client. Refresh and try again.",
        );
      }

      const updatedProject = await requireProject(
        app,
        workspace._id,
        project._id,
        user,
      );
      app.publishRealtimeEvent({
        kind: "project.updated",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
        projectIds: [project._id],
      });

      return {
        project: updatedProject,
      };
    },
  );

  app.post<{
    Params: { projectId: string };
    Body: {
      sourceWorkspaceId: string;
      targetWorkspaceId: string;
      targetOrder?: number;
    };
  }>(
    "/projects/:projectId/move",
    { preHandler: app.authenticate },
    async (request) => {
      const sourceWorkspace = await requireWorkspace(
        app,
        request.body.sourceWorkspaceId,
      );
      const targetWorkspace = await requireWorkspace(
        app,
        request.body.targetWorkspaceId,
      );
      const user = getRequiredUser(request);
      const project = await requireProject(
        app,
        sourceWorkspace._id,
        request.params.projectId,
        user,
      );

      if (sourceWorkspace._id === targetWorkspace._id) {
        return { project };
      }

      if (
        !canManageProject(user, project, sourceWorkspace) ||
        !canAccessWorkspace(user, targetWorkspace) ||
        user.role === "member"
      ) {
        throw app.httpErrors.forbidden(
          "You cannot move this project to the target workspace",
        );
      }

      await app.assertProjectUnlocked(request, project, sourceWorkspace);

      const projectFilter = {
        $or: [{ _id: toObjectId(project._id) }, { projectId: project._id }],
      };
      const sourceCollection = workspaceDataCollection(app.mongo, sourceWorkspace._id);
      const targetCollection = workspaceDataCollection(app.mongo, targetWorkspace._id);
      const records = await sourceCollection.find(projectFilter).toArray();
      const now = isoNow();
      const targetProjects = await targetCollection
        .find({ entityType: "project" })
        .sort({ order: 1, createdAt: 1 })
        .toArray();
      const targetProjectIds = targetProjects
        .map((record) => record._id.toHexString())
        .filter((projectId) => projectId !== project._id);
      const insertIndex = clampOrder(
        request.body.targetOrder,
        targetProjectIds.length,
      );

      targetProjectIds.splice(insertIndex, 0, project._id);

      const movedRecords = records.map((record) => ({
        ...record,
        workspaceId: targetWorkspace._id,
        updatedAt: now,
      }));

      await targetCollection.insertMany(movedRecords as never[]);
      await sourceCollection.deleteMany(projectFilter);

      const remainingProjects = await sourceCollection
        .find({ entityType: "project" })
        .sort({ order: 1, createdAt: 1 })
        .toArray();

      await Promise.all(
        remainingProjects.map((record, index) =>
          sourceCollection.updateOne(
            { _id: record._id, entityType: "project" },
            { $set: { order: index, updatedAt: now } },
          ),
        ),
      );

      await Promise.all(
        targetProjectIds.map((projectId, index) =>
          targetCollection.updateOne(
            { _id: toObjectId(projectId), entityType: "project" },
            { $set: { order: index, updatedAt: now } },
          ),
        ),
      );

      app.publishRealtimeEvent({
        kind: "project.moved",
        actorUserId: user._id,
        workspaceIds: [sourceWorkspace._id, targetWorkspace._id],
        projectIds: [project._id],
      });

      return {
        project: await requireProject(
          app,
          targetWorkspace._id,
          project._id,
          user,
        ),
      };
    },
  );

  app.post<{ Params: { projectId: string }; Body: { workspaceId: string } }>(
    "/projects/:projectId/duplicate",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      const project = await requireProject(
        app,
        workspace._id,
        request.params.projectId,
        user,
      );
      if (!canManageProject(user, project, workspace)) {
        throw app.httpErrors.forbidden(
          "Only the project owner, workspace owner, or superadmin can duplicate this project",
        );
      }

      await app.assertProjectUnlocked(request, project, workspace);

      const records = await workspaceDataCollection(app.mongo, workspace._id)
        .find({
          $or: [{ _id: toObjectId(project._id) }, { projectId: project._id }],
        })
        .toArray();
      const now = isoNow();
      const idMap = new Map<string, string>();
      records.forEach((record) =>
        idMap.set(record._id.toHexString(), createId().toHexString()),
      );

      const duplicates = records.map((record) => {
        const nextId = idMap.get(record._id.toHexString())!;
        const cloned = {
          ...record,
          _id: toObjectId(nextId),
          createdAt: now,
          updatedAt: now,
        } as Record<string, unknown>;

        if (record.entityType === "request") {
          cloned.contentUpdatedAt = now;
        }

        if (record._id.toHexString() === project._id) {
          cloned.name = `${project.name} Copy`;
          cloned.ownerId = user._id;
          cloned.createdBy = user._id;
          cloned.passwordHash = null;
          cloned.isPasswordProtected = false;
        }

        if (typeof cloned.projectId === "string") {
          cloned.projectId =
            idMap.get(cloned.projectId as string) ?? cloned.projectId;
        }
        if (typeof cloned.parentFolderId === "string") {
          cloned.parentFolderId =
            idMap.get(cloned.parentFolderId as string) ?? cloned.parentFolderId;
        }
        if (typeof cloned.folderId === "string") {
          cloned.folderId =
            idMap.get(cloned.folderId as string) ?? cloned.folderId;
        }
        return cloned;
      });

      await workspaceDataCollection(app.mongo, workspace._id).insertMany(
        duplicates as never[],
      );
      app.publishRealtimeEvent({
        kind: "project.duplicated",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
        projectIds: [idMap.get(project._id)!],
      });
      return {
        project: await requireProject(
          app,
          workspace._id,
          idMap.get(project._id)!,
          user,
        ),
      };
    },
  );

  app.post<{ Body: { workspaceId: string; orderedIds: string[] } }>(
    "/projects/reorder",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      await Promise.all(
        request.body.orderedIds.map((projectId, index) =>
          workspaceDataCollection(app.mongo, workspace._id).updateOne(
            { _id: toObjectId(projectId), entityType: "project" },
            { $set: { order: index, updatedAt: isoNow() } },
          ),
        ),
      );

      app.publishRealtimeEvent({
        kind: "project.reordered",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
        projectIds: request.body.orderedIds,
      });

      return { success: true };
    },
  );

  app.delete<{
    Params: { projectId: string };
    Querystring: { workspaceId: string };
  }>(
    "/projects/:projectId",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.query.workspaceId);
      const user = getRequiredUser(request);
      const project = await requireProject(
        app,
        workspace._id,
        request.params.projectId,
        user,
      );
      if (!canManageProject(user, project, workspace)) {
        throw app.httpErrors.forbidden(
          "Only the project owner, workspace owner, or superadmin can delete this project",
        );
      }

      await workspaceDataCollection(app.mongo, workspace._id).deleteMany({
        $or: [{ _id: toObjectId(project._id) }, { projectId: project._id }],
      });

      app.publishRealtimeEvent({
        kind: "project.deleted",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
        projectIds: [project._id],
      });

      return { success: true };
    },
  );
};

export default projectRoutes;






