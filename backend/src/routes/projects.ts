import type { FastifyPluginAsync } from "fastify";
import type { ProjectDoc, ProjectEnvVar, WorkspaceMeta } from "@restify/shared";
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
  canManageProject,
  getRequiredUser,
} from "../lib/permissions.js";

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
  return serializeDoc(project) as ProjectDoc;
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
        createdAt: now,
        updatedAt: now,
      };

      await workspaceDataCollection(app.mongo, workspace._id).insertOne(
        project as never,
      );
      return { project: serializeDoc(project) };
    },
  );

  app.patch<{
    Params: { projectId: string };
    Body: { workspaceId: string; name?: string; envVars?: ProjectEnvVar[] };
  }>(
    "/projects/:projectId",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const project = await requireProject(
        app,
        workspace._id,
        request.params.projectId,
      );
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      await app.assertProjectUnlocked(request, project, workspace);

      await workspaceDataCollection(app.mongo, workspace._id).updateOne(
        { _id: toObjectId(project._id) },
        {
          $set: {
            ...(request.body.name ? { name: request.body.name.trim() } : {}),
            ...(request.body.envVars ? { envVars: request.body.envVars } : {}),
            updatedAt: isoNow(),
          },
        },
      );

      return {
        project: await requireProject(app, workspace._id, project._id),
      };
    },
  );

  app.post<{ Params: { projectId: string }; Body: { workspaceId: string } }>(
    "/projects/:projectId/duplicate",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const project = await requireProject(
        app,
        workspace._id,
        request.params.projectId,
      );
      const user = getRequiredUser(request);
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
        if (typeof cloned.folderId === "string") {
          cloned.folderId =
            idMap.get(cloned.folderId as string) ?? cloned.folderId;
        }
        return cloned;
      });

      await workspaceDataCollection(app.mongo, workspace._id).insertMany(
        duplicates as never[],
      );
      return {
        project: await requireProject(
          app,
          workspace._id,
          idMap.get(project._id)!,
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
      const project = await requireProject(
        app,
        workspace._id,
        request.params.projectId,
      );
      const user = getRequiredUser(request);
      if (!canManageProject(user, project, workspace)) {
        throw app.httpErrors.forbidden(
          "Only the project owner, workspace owner, or superadmin can delete this project",
        );
      }

      await workspaceDataCollection(app.mongo, workspace._id).deleteMany({
        $or: [{ _id: toObjectId(project._id) }, { projectId: project._id }],
      });

      return { success: true };
    },
  );
};

export default projectRoutes;