import type {
  AdminUser,
  ExecuteRequestPayload,
  ExecuteRequestResult,
  FolderDoc,
  HistoryDoc,
  ProjectDoc,
  RequestDoc,
  User,
  WorkspaceMeta,
} from "@restify/shared";
import type { FastifyPluginAsync } from "fastify";
import { getWorkspaceById } from "../db/bootstrap.js";
import {
  createId,
  isoNow,
  serializeDoc,
  serializeDocs,
  toObjectId,
  workspaceDataCollection,
} from "../db/collections.js";
import { executeHttpRequest } from "../lib/http-executor.js";
import {
  canAccessWorkspace,
  canManagePrivateEntities,
  canViewEntity,
  getRequiredUser,
} from "../lib/permissions.js";
import {
  protectRequestAuthForStorage,
  protectRequestHeadersForStorage,
  redactComputedHeadersForHistory,
  revealProjectEnvVarsFromStorage,
  revealRequestAuthFromStorage,
  revealRequestHeadersFromStorage,
  sanitizeHistorySnapshot,
} from "../lib/secure-storage.js";

async function requireWorkspace(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
): Promise<WorkspaceMeta> {
  const workspace = await getWorkspaceById(app.mongo, workspaceId);
  if (!workspace) {
    throw app.httpErrors.notFound("Workspace not found");
  }
  return workspace;
}

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

function normalizeFolder(folder: FolderDoc): FolderDoc {
  return {
    ...folder,
    parentFolderId: folder.parentFolderId ?? null,
    isPrivate: Boolean(folder.isPrivate),
  };
}

function normalizeRequest(
  request: RequestDoc,
  dataEncryptionKey: string,
): RequestDoc {
  return {
    ...request,
    headers: revealRequestHeadersFromStorage(request.headers, dataEncryptionKey),
    auth: revealRequestAuthFromStorage(request.auth, dataEncryptionKey),
    isPrivate: Boolean(request.isPrivate),
  };
}

function toStoredRequestFields(
  request: Pick<RequestDoc, "headers" | "auth">,
  dataEncryptionKey: string,
) {
  return {
    headers: protectRequestHeadersForStorage(request.headers, dataEncryptionKey),
    auth: protectRequestAuthForStorage(request.auth, dataEncryptionKey),
  };
}

async function requireProject(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  projectId: string,
  user?: SessionUser,
): Promise<ProjectDoc> {
  const project = await workspaceDataCollection(app.mongo, workspaceId).findOne(
    { _id: toObjectId(projectId), entityType: "project" },
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

async function requireFolder(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  folderId: string,
  user?: SessionUser,
  visitedFolderIds = new Set<string>(),
): Promise<FolderDoc> {
  const normalizedFolderId = folderId?.trim();
  if (!normalizedFolderId) {
    throw app.httpErrors.badRequest("Folder ID is required");
  }

  if (visitedFolderIds.has(normalizedFolderId)) {
    throw app.httpErrors.notFound("Folder not found");
  }
  visitedFolderIds.add(normalizedFolderId);

  const folder = await workspaceDataCollection(app.mongo, workspaceId).findOne({
    _id: toObjectId(normalizedFolderId),
    entityType: "folder",
  });
  if (!folder) {
    throw app.httpErrors.notFound("Folder not found");
  }

  const normalizedFolder = normalizeFolder(serializeDoc(folder) as FolderDoc);
  if (user && !canViewEntity(user, normalizedFolder)) {
    throw app.httpErrors.notFound("Folder not found");
  }

  if (user && normalizedFolder.parentFolderId) {
    const parentFolder = await requireFolder(
      app,
      workspaceId,
      normalizedFolder.parentFolderId,
      user,
      visitedFolderIds,
    );
    if (parentFolder.projectId !== normalizedFolder.projectId) {
      throw app.httpErrors.notFound("Folder not found");
    }
  }

  return normalizedFolder;
}

async function requireRequestDoc(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  requestId: string,
  user?: SessionUser,
): Promise<RequestDoc> {
  const requestDoc = await workspaceDataCollection(
    app.mongo,
    workspaceId,
  ).findOne({ _id: toObjectId(requestId), entityType: "request" });
  if (!requestDoc) {
    throw app.httpErrors.notFound("Request not found");
  }

  const normalizedRequest = normalizeRequest(
    serializeDoc(requestDoc) as RequestDoc,
    app.config.dataEncryptionKey,
  );
  if (user && !canViewEntity(user, normalizedRequest)) {
    throw app.httpErrors.notFound("Request not found");
  }

  if (user && normalizedRequest.folderId) {
    await requireFolder(app, workspaceId, normalizedRequest.folderId, user);
  }

  return normalizedRequest;
}
function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function normalizeFolderId(folderId?: string | null) {
  return folderId ?? null;
}

function clampOrder(value: number | undefined, max: number) {
  return Math.max(0, Math.min(value ?? max, max));
}

async function listProjectFolders(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  projectId: string,
): Promise<FolderDoc[]> {
  return (serializeDocs(
    await workspaceDataCollection(app.mongo, workspaceId)
      .find({ entityType: "folder", projectId })
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
  ) as FolderDoc[]).map(normalizeFolder);
}

function collectFolderSubtreeIds(folders: FolderDoc[], rootFolderId: string): string[] {
  const childrenByParent = new Map<string | null, FolderDoc[]>();
  folders.forEach((folder) => {
    const parentFolderId = normalizeFolderId(folder.parentFolderId);
    const bucket = childrenByParent.get(parentFolderId) ?? [];
    bucket.push(folder);
    childrenByParent.set(parentFolderId, bucket);
  });

  const collectedIds: string[] = [];
  const stack = [rootFolderId];

  while (stack.length > 0) {
    const currentFolderId = stack.pop()!;
    collectedIds.push(currentFolderId);
    const children = childrenByParent.get(currentFolderId) ?? [];
    children.forEach((childFolder) => stack.push(childFolder._id));
  }

  return collectedIds;
}

function getSiblingFolders(
  folders: FolderDoc[],
  projectId: string,
  parentFolderId: string | null,
) {
  return sortByOrder(
    folders.filter(
      (folder) =>
        folder.projectId === projectId &&
        normalizeFolderId(folder.parentFolderId) === parentFolderId,
    ),
  );
}

async function listRequestsInFolders(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  folderIds: string[],
): Promise<RequestDoc[]> {
  if (folderIds.length === 0) {
    return [];
  }

  return (serializeDocs(
    await workspaceDataCollection(app.mongo, workspaceId)
      .find({ entityType: "request", folderId: { $in: folderIds } })
      .toArray(),
  ) as RequestDoc[]).map((request) =>
    normalizeRequest(request, app.config.dataEncryptionKey),
  );
}

async function trimHistory(
  app: Parameters<FastifyPluginAsync>[0],
  workspaceId: string,
  projectId: string,
) {
  const staleRecords = await workspaceDataCollection(app.mongo, workspaceId)
    .find({ entityType: "history", projectId })
    .sort({ createdAt: -1 })
    .skip(50)
    .project({ _id: 1 })
    .toArray();

  if (staleRecords.length > 0) {
    await workspaceDataCollection(app.mongo, workspaceId).deleteMany({
      _id: { $in: staleRecords.map((record) => record._id) },
    });
  }
}

function buildHistoryRequestSnapshot(
  payload: ExecuteRequestPayload,
): NonNullable<HistoryDoc["requestSnapshot"]> {
  const computedHeaders = new Headers();

  payload.headers
    .filter((header) => header.enabled && header.key.trim())
    .forEach((header) => computedHeaders.set(header.key, header.value));

  if (payload.auth.type === "bearer" && payload.auth.token) {
    computedHeaders.set("authorization", `Bearer ${payload.auth.token}`);
  }

  if (payload.auth.type === "basic" && payload.auth.username) {
    const token = Buffer.from(
      `${payload.auth.username}:${payload.auth.password ?? ""}`,
    ).toString("base64");
    computedHeaders.set("authorization", `Basic ${token}`);
  }

  if (!computedHeaders.has("content-type")) {
    if (payload.body.type === "json") {
      computedHeaders.set("content-type", "application/json");
    }

    if (payload.body.type === "x-www-form-urlencoded") {
      computedHeaders.set(
        "content-type",
        "application/x-www-form-urlencoded;charset=UTF-8",
      );
    }
  }

  return sanitizeHistorySnapshot({
    headers: payload.headers,
    params: payload.params,
    body: payload.body,
    auth: payload.auth,
    computedHeaders: Object.fromEntries(computedHeaders.entries()),
    secretsRedacted: true,
  });
}

function buildHistoryResponseSnapshot(
  result: ExecuteRequestResult,
): NonNullable<HistoryDoc["responseSnapshot"]> {
  const snapshot: NonNullable<HistoryDoc["responseSnapshot"]> = {
    statusText: result.statusText,
    headers: redactComputedHeadersForHistory(result.headers),
    contentType: result.contentType,
    contentKind: result.contentKind,
  };

  if (result.textBody !== undefined) {
    snapshot.textBody = result.textBody;
  }

  return snapshot;
}

const requestRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      workspaceId: string;
      projectId: string;
      parentFolderId?: string | null;
      name: string;
    };
  }>(
    "/folders",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      const name = request.body.name?.trim();
      if (!name) {
        throw app.httpErrors.badRequest("Folder name is required");
      }

      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const project = await requireProject(
        app,
        workspace._id,
        request.body.projectId,
        user,
      );
      const parentFolderId = normalizeFolderId(request.body.parentFolderId);

      if (parentFolderId) {
        const parentFolder = await requireFolder(
          app,
          workspace._id,
          parentFolderId,
          user,
        );
        if (parentFolder.projectId !== project._id) {
          throw app.httpErrors.badRequest(
            "Parent folder does not belong to the selected project",
          );
        }
      }

      await app.assertProjectUnlocked(request, project, workspace);

      const maxOrder = await workspaceDataCollection(app.mongo, workspace._id)
        .find({
          entityType: "folder",
          projectId: project._id,
          parentFolderId,
        })
        .sort({ order: -1 })
        .limit(1)
        .toArray();

      const now = isoNow();
      const folder = {
        _id: createId(),
        entityType: "folder",
        workspaceId: workspace._id,
        projectId: project._id,
        parentFolderId,
        name,
        order:
          ((maxOrder[0] as { order?: number } | undefined)?.order ?? -1) + 1,
        isPrivate: false,
        createdAt: now,
        updatedAt: now,
      };

      await workspaceDataCollection(app.mongo, workspace._id).insertOne(
        folder as never,
      );
      return { folder: normalizeFolder(serializeDoc(folder) as FolderDoc) };
    },
  );
  app.patch<{
    Params: { folderId: string };
    Body: { workspaceId: string; name?: string; isPrivate?: boolean };
  }>(
    "/folders/:folderId",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const folder = await requireFolder(
        app,
        workspace._id,
        request.params.folderId,
        user,
      );
      const project = await requireProject(
        app,
        workspace._id,
        folder.projectId,
        user,
      );

      if ("isPrivate" in request.body && !canManagePrivateEntities(user)) {
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
          throw app.httpErrors.badRequest("Folder name is required");
        }
        patch.name = name;
      }

      if ("isPrivate" in request.body) {
        patch.isPrivate = Boolean(request.body.isPrivate);
      }

      await app.assertProjectUnlocked(request, project, workspace);
      await workspaceDataCollection(app.mongo, workspace._id).updateOne(
        { _id: toObjectId(folder._id) },
        { $set: patch },
      );

      return {
        folder: await requireFolder(
          app,
          workspace._id,
          request.params.folderId,
          user,
        ),
      };
    },
  );
  app.post<{ Params: { folderId: string }; Body: { workspaceId: string } }>(
    "/folders/:folderId/duplicate",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const folder = await requireFolder(
        app,
        workspace._id,
        request.params.folderId,
        user,
      );
      const project = await requireProject(
        app,
        workspace._id,
        folder.projectId,
        user,
      );

      await app.assertProjectUnlocked(request, project, workspace);

      const projectFolders = await listProjectFolders(app, workspace._id, folder.projectId);
      const subtreeFolderIds = collectFolderSubtreeIds(projectFolders, folder._id);
      const subtreeFolderIdSet = new Set(subtreeFolderIds);
      const subtreeFolders = projectFolders.filter((item) => subtreeFolderIdSet.has(item._id));
      const requestDocs = await listRequestsInFolders(
        app,
        workspace._id,
        subtreeFolderIds,
      );
      const siblingFolders = getSiblingFolders(
        projectFolders,
        folder.projectId,
        normalizeFolderId(folder.parentFolderId),
      );
      const now = isoNow();
      const idMap = new Map<string, string>();
      subtreeFolders.forEach((item) => idMap.set(item._id, createId().toHexString()));

      const duplicatedFolders = subtreeFolders.map((item) => ({
        ...item,
        _id: toObjectId(idMap.get(item._id)!),
        parentFolderId: item.parentFolderId
          ? idMap.get(item.parentFolderId) ?? item.parentFolderId
          : null,
        name: item._id === folder._id ? `${item.name} Copy` : item.name,
        order:
          item._id === folder._id
            ? siblingFolders.length
            : item.order,
        createdAt: now,
        updatedAt: now,
      }));

      if (duplicatedFolders.length > 0) {
        await workspaceDataCollection(app.mongo, workspace._id).insertMany(
          duplicatedFolders as never[],
        );
      }

      if (requestDocs.length > 0) {
        const clonedRequests = requestDocs.map((requestDoc) => ({
          ...requestDoc,
          ...toStoredRequestFields(requestDoc, app.config.dataEncryptionKey),
          _id: createId(),
          folderId: requestDoc.folderId
            ? idMap.get(requestDoc.folderId) ?? requestDoc.folderId
            : null,
          responseHistory: [],
          createdAt: now,
          updatedAt: now,
        }));
        await workspaceDataCollection(app.mongo, workspace._id).insertMany(
          clonedRequests as never[],
        );
      }

      return {
        folder: await requireFolder(
          app,
          workspace._id,
          idMap.get(folder._id)!,
          user,
        ),
      };
    },
  );
  app.post<{
    Body: {
      workspaceId: string;
      projectId: string;
      parentFolderId?: string | null;
      orderedIds: string[];
    };
  }>("/folders/reorder", { preHandler: app.authenticate }, async (request) => {
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
      request.body.projectId,
      user,
    );
    const parentFolderId = normalizeFolderId(request.body.parentFolderId);

    if (parentFolderId) {
      const parentFolder = await requireFolder(
        app,
        workspace._id,
        parentFolderId,
        user,
      );
      if (parentFolder.projectId !== project._id) {
        throw app.httpErrors.badRequest(
          "Parent folder does not belong to the selected project",
        );
      }
    }

    await app.assertProjectUnlocked(request, project, workspace);
    await Promise.all(
      request.body.orderedIds.map((folderId, index) =>
        workspaceDataCollection(app.mongo, workspace._id).updateOne(
          { _id: toObjectId(folderId), entityType: "folder" },
          { $set: { order: index, parentFolderId, updatedAt: isoNow() } },
        ),
      ),
    );
    return { success: true };
  });
  app.post<{
    Params: { folderId: string };
    Body: {
      workspaceId: string;
      targetProjectId: string;
      targetParentFolderId?: string | null;
      targetOrder?: number;
    };
  }>(
    "/folders/:folderId/move",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const folder = await requireFolder(
        app,
        workspace._id,
        request.params.folderId,
        user,
      );
      const sourceProject = await requireProject(
        app,
        workspace._id,
        folder.projectId,
        user,
      );
      const targetProject = await requireProject(
        app,
        workspace._id,
        request.body.targetProjectId,
        user,
      );

      await app.assertProjectUnlocked(request, sourceProject, workspace);
      await app.assertProjectUnlocked(request, targetProject, workspace);

      const targetParentFolderId = normalizeFolderId(request.body.targetParentFolderId);
      if (targetParentFolderId) {
        const targetParentFolder = await requireFolder(
          app,
          workspace._id,
          targetParentFolderId,
          user,
        );
        if (targetParentFolder.projectId !== targetProject._id) {
          throw app.httpErrors.badRequest(
            "Target parent folder does not belong to the target project",
          );
        }
      }

      const collection = workspaceDataCollection(app.mongo, workspace._id);
      const now = isoNow();
      const relevantProjectIds = Array.from(
        new Set([sourceProject._id, targetProject._id]),
      );
      const relevantFolders = (serializeDocs(
        await collection
          .find({ entityType: "folder", projectId: { $in: relevantProjectIds } })
          .sort({ order: 1, createdAt: 1 })
          .toArray(),
      ) as FolderDoc[]).map(normalizeFolder);
      const sourceProjectFolders = relevantFolders.filter(
        (item) => item.projectId === sourceProject._id,
      );
      const movedSubtreeIds = collectFolderSubtreeIds(sourceProjectFolders, folder._id);
      const movedSubtreeIdSet = new Set(movedSubtreeIds);
      if (targetParentFolderId && movedSubtreeIdSet.has(targetParentFolderId)) {
        throw app.httpErrors.badRequest(
          "A folder cannot be moved inside itself or one of its descendants",
        );
      }

      const sourceParentFolderId = normalizeFolderId(folder.parentFolderId);
      const sourceSiblings = getSiblingFolders(
        relevantFolders,
        sourceProject._id,
        sourceParentFolderId,
      );
      const sourceIndex = sourceSiblings.findIndex((item) => item._id === folder._id);
      if (sourceIndex === -1) {
        throw app.httpErrors.notFound("Folder not found in source container");
      }

      const isSameContainer =
        sourceProject._id === targetProject._id &&
        sourceParentFolderId === targetParentFolderId;

      if (isSameContainer) {
        const orderedIds = sourceSiblings.map((item) => item._id);
        orderedIds.splice(sourceIndex, 1);
        const targetOrder = clampOrder(request.body.targetOrder, orderedIds.length);
        orderedIds.splice(targetOrder, 0, folder._id);

        if (sourceIndex !== targetOrder) {
          await Promise.all(
            orderedIds.map((folderId, index) =>
              collection.updateOne(
                { _id: toObjectId(folderId), entityType: "folder" },
                { $set: { order: index, updatedAt: now } },
              ),
            ),
          );
        }

        return {
          folder: await requireFolder(app, workspace._id, folder._id, user),
        };
      }

      const targetSiblings = getSiblingFolders(
        relevantFolders,
        targetProject._id,
        targetParentFolderId,
      ).filter((item) => item._id !== folder._id);
      const targetOrderedIds = targetSiblings.map((item) => item._id);
      const targetOrder = clampOrder(request.body.targetOrder, targetOrderedIds.length);
      targetOrderedIds.splice(targetOrder, 0, folder._id);

      const sourceRemainingIds = sourceSiblings
        .filter((item) => item._id !== folder._id)
        .map((item) => item._id);

      await Promise.all(
        sourceRemainingIds.map((folderId, index) =>
          collection.updateOne(
            { _id: toObjectId(folderId), entityType: "folder" },
            { $set: { order: index, updatedAt: now } },
          ),
        ),
      );

      await Promise.all(
        targetOrderedIds.map((folderId, index) =>
          collection.updateOne(
            { _id: toObjectId(folderId), entityType: "folder" },
            {
              $set:
                folderId === folder._id
                  ? {
                      projectId: targetProject._id,
                      parentFolderId: targetParentFolderId,
                      order: index,
                      updatedAt: now,
                    }
                  : { order: index, updatedAt: now },
            },
          ),
        ),
      );

      if (sourceProject._id !== targetProject._id) {
        const descendantFolderIds = movedSubtreeIds.filter((folderId) => folderId !== folder._id);
        if (descendantFolderIds.length > 0) {
          await collection.updateMany(
            {
              _id: { $in: descendantFolderIds.map((folderId) => toObjectId(folderId)) },
              entityType: "folder",
            },
            { $set: { projectId: targetProject._id, updatedAt: now } },
          );
        }

        const movedRequests = await listRequestsInFolders(
          app,
          workspace._id,
          movedSubtreeIds,
        );
        if (movedRequests.length > 0) {
          await collection.updateMany(
            { entityType: "request", folderId: { $in: movedSubtreeIds } },
            { $set: { projectId: targetProject._id, updatedAt: now } },
          );
          await collection.updateMany(
            {
              entityType: "history",
              requestId: { $in: movedRequests.map((item) => item._id) },
            },
            { $set: { projectId: targetProject._id, updatedAt: now } },
          );
        }
      }

      return {
        folder: await requireFolder(app, workspace._id, folder._id, user),
      };
    },
  );
  app.delete<{
    Params: { folderId: string };
    Querystring: { workspaceId: string };
  }>(
    "/folders/:folderId",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.query.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const folder = await requireFolder(
        app,
        workspace._id,
        request.params.folderId,
        user,
      );
      const project = await requireProject(
        app,
        workspace._id,
        folder.projectId,
        user,
      );
      const projectFolders = await listProjectFolders(app, workspace._id, folder.projectId);
      const subtreeFolderIds = collectFolderSubtreeIds(projectFolders, folder._id);

      await app.assertProjectUnlocked(request, project, workspace);
      await workspaceDataCollection(app.mongo, workspace._id).deleteMany({
        $or: [
          {
            _id: { $in: subtreeFolderIds.map((folderId) => toObjectId(folderId)) },
            entityType: "folder",
          },
          { entityType: "request", folderId: { $in: subtreeFolderIds } },
        ],
      });
      return { success: true };
    },
  );
  app.post<{
    Body: Omit<
      RequestDoc,
      "_id" | "entityType" | "createdAt" | "updatedAt" | "responseHistory"
    >;
  }>("/requests", { preHandler: app.authenticate }, async (request) => {
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
      request.body.projectId,
      user,
    );

    if (request.body.folderId) {
      const folder = await requireFolder(
        app,
        workspace._id,
        request.body.folderId,
        user,
      );
      if (folder.projectId !== project._id) {
        throw app.httpErrors.badRequest(
          "Folder does not belong to the selected project",
        );
      }
    }

    await app.assertProjectUnlocked(request, project, workspace);

    const requestId = createId();
    const now = isoNow();
    const requestDoc = {
      _id: requestId,
      entityType: "request",
      workspaceId: workspace._id,
      projectId: project._id,
      folderId: request.body.folderId ?? null,
      name: request.body.name,
      method: request.body.method,
      url: request.body.url,
      ...toStoredRequestFields(request.body, app.config.dataEncryptionKey),
      params: request.body.params,
      body: request.body.body,
      responseHistory: [],
      order: request.body.order,
      isPrivate: false,
      createdAt: now,
      updatedAt: now,
    };

    await workspaceDataCollection(app.mongo, workspace._id).insertOne(
      requestDoc as never,
    );
    return {
      request: normalizeRequest(
        serializeDoc(requestDoc) as RequestDoc,
        app.config.dataEncryptionKey,
      ),
    };
  });
  app.patch<{
    Params: { requestId: string };
    Body: Partial<RequestDoc> & { workspaceId: string };
  }>(
    "/requests/:requestId",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const requestDoc = await requireRequestDoc(
        app,
        workspace._id,
        request.params.requestId,
        user,
      );
      const project = await requireProject(
        app,
        workspace._id,
        requestDoc.projectId,
        user,
      );

      if ("isPrivate" in request.body && !canManagePrivateEntities(user)) {
        throw app.httpErrors.forbidden(
          "Members cannot change private visibility",
        );
      }

      if ("folderId" in request.body && request.body.folderId) {
        const folder = await requireFolder(
          app,
          workspace._id,
          request.body.folderId,
          user,
        );
        if (folder.projectId !== project._id) {
          throw app.httpErrors.badRequest(
            "Folder does not belong to the selected project",
          );
        }
      }

      await app.assertProjectUnlocked(request, project, workspace);

      const patch: Record<string, unknown> = {
        updatedAt: isoNow(),
      };

      [
        "name",
        "method",
        "url",
        "headers",
        "params",
        "body",
        "auth",
        "folderId",
        "order",
        "isPrivate",
      ].forEach((key) => {
        if (key in request.body) {
          patch[key] = request.body[key as keyof typeof request.body];
        }
      });

      if ("isPrivate" in patch) {
        patch.isPrivate = Boolean(patch.isPrivate);
      }

      if ("headers" in patch && Array.isArray(patch.headers)) {
        patch.headers = protectRequestHeadersForStorage(
          patch.headers,
          app.config.dataEncryptionKey,
        );
      }

      if ("auth" in patch && patch.auth) {
        patch.auth = protectRequestAuthForStorage(
          patch.auth as RequestDoc["auth"],
          app.config.dataEncryptionKey,
        );
      }

      await workspaceDataCollection(app.mongo, workspace._id).updateOne(
        { _id: toObjectId(requestDoc._id) },
        { $set: patch },
      );

      return {
        request: await requireRequestDoc(
          app,
          workspace._id,
          requestDoc._id,
          user,
        ),
      };
    },
  );

  app.post<{
    Params: { requestId: string };
    Body: {
      workspaceId: string;
      targetProjectId: string;
      targetFolderId?: string | null;
      targetOrder?: number;
    };
  }>(
    "/requests/:requestId/move",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const requestDoc = await requireRequestDoc(
        app,
        workspace._id,
        request.params.requestId,
        user,
      );
      const sourceProject = await requireProject(
        app,
        workspace._id,
        requestDoc.projectId,
        user,
      );
      const targetProject = await requireProject(
        app,
        workspace._id,
        request.body.targetProjectId,
        user,
      );

      await app.assertProjectUnlocked(request, sourceProject, workspace);
      await app.assertProjectUnlocked(request, targetProject, workspace);

      const sourceFolderId = normalizeFolderId(requestDoc.folderId);
      const targetFolderId = normalizeFolderId(request.body.targetFolderId);

      if (targetFolderId) {
        const targetFolder = await requireFolder(
          app,
          workspace._id,
          targetFolderId,
          user,
        );
        if (targetFolder.projectId !== targetProject._id) {
          throw app.httpErrors.badRequest(
            "Target folder does not belong to the target project",
          );
        }
      }

      const relatedRequests = serializeDocs(
        await workspaceDataCollection(app.mongo, workspace._id)
          .find({
            entityType: "request",
            projectId: {
              $in: Array.from(new Set([requestDoc.projectId, targetProject._id])),
            },
          })
          .toArray(),
      ) as RequestDoc[];

      const sourceRequests = sortByOrder(
        relatedRequests.filter(
          (item) =>
            item.projectId === requestDoc.projectId &&
            normalizeFolderId(item.folderId) === sourceFolderId,
        ),
      );
      const targetRequests =
        requestDoc.projectId === targetProject._id && sourceFolderId === targetFolderId
          ? sourceRequests
          : sortByOrder(
              relatedRequests.filter(
                (item) =>
                  item.projectId === targetProject._id &&
                  normalizeFolderId(item.folderId) === targetFolderId,
              ),
            );

      const sourceIndex = sourceRequests.findIndex(
        (item) => item._id === requestDoc._id,
      );
      if (sourceIndex === -1) {
        throw app.httpErrors.notFound("Request not found in source container");
      }

      const isSameContainer =
        requestDoc.projectId === targetProject._id && sourceFolderId === targetFolderId;
      const targetOrder = clampOrder(
        request.body.targetOrder,
        isSameContainer ? sourceRequests.length - 1 : targetRequests.length,
      );

      if (isSameContainer && sourceIndex === targetOrder) {
        return { request: requestDoc };
      }

      const now = isoNow();
      const operations = [] as Array<Record<string, unknown>>;

      if (isSameContainer) {
        const reorderedIds = sourceRequests.map((item) => item._id);
        reorderedIds.splice(sourceIndex, 1);
        reorderedIds.splice(targetOrder, 0, requestDoc._id);

        reorderedIds.forEach((requestId, index) => {
          operations.push({
            updateOne: {
              filter: { _id: toObjectId(requestId), entityType: "request" },
              update: { $set: { order: index, updatedAt: now } },
            },
          });
        });
      } else {
        const sourceIds = sourceRequests
          .filter((item) => item._id !== requestDoc._id)
          .map((item) => item._id);
        const targetIds = targetRequests
          .filter((item) => item._id !== requestDoc._id)
          .map((item) => item._id);
        targetIds.splice(targetOrder, 0, requestDoc._id);

        sourceIds.forEach((requestId, index) => {
          operations.push({
            updateOne: {
              filter: { _id: toObjectId(requestId), entityType: "request" },
              update: { $set: { order: index, updatedAt: now } },
            },
          });
        });

        targetIds.forEach((requestId, index) => {
          operations.push({
            updateOne: {
              filter: { _id: toObjectId(requestId), entityType: "request" },
              update: {
                $set:
                  requestId === requestDoc._id
                    ? {
                        projectId: targetProject._id,
                        folderId: targetFolderId,
                        order: index,
                        updatedAt: now,
                      }
                    : { order: index, updatedAt: now },
              },
            },
          });
        });
      }

      if (operations.length > 0) {
        await workspaceDataCollection(app.mongo, workspace._id).bulkWrite(
          operations as never,
        );
      }

      if (requestDoc.projectId !== targetProject._id) {
        await workspaceDataCollection(app.mongo, workspace._id).updateMany(
          { entityType: "history", requestId: requestDoc._id },
          { $set: { projectId: targetProject._id, updatedAt: now } },
        );
      }

      return {
        request: await requireRequestDoc(app, workspace._id, requestDoc._id, user),
      };
    },
  );

  app.post<{ Params: { requestId: string }; Body: { workspaceId: string } }>(
    "/requests/:requestId/duplicate",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.body.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const requestDoc = await requireRequestDoc(
        app,
        workspace._id,
        request.params.requestId,
        user,
      );
      const project = await requireProject(
        app,
        workspace._id,
        requestDoc.projectId,
        user,
      );

      await app.assertProjectUnlocked(request, project, workspace);

      const duplicateId = createId();
      const now = isoNow();
      await workspaceDataCollection(app.mongo, workspace._id).insertOne({
        ...requestDoc,
        ...toStoredRequestFields(requestDoc, app.config.dataEncryptionKey),
        _id: duplicateId,
        name: `${requestDoc.name} Copy`,
        responseHistory: [],
        createdAt: now,
        updatedAt: now,
      } as never);
      return {
        request: await requireRequestDoc(
          app,
          workspace._id,
          duplicateId.toHexString(),
          user,
        ),
      };
    },
  );

  app.post<{ Body: { workspaceId: string; orderedIds: string[] } }>(
    "/requests/reorder",
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
        request.body.orderedIds.map((requestId, index) =>
          workspaceDataCollection(app.mongo, workspace._id).updateOne(
            { _id: toObjectId(requestId), entityType: "request" },
            { $set: { order: index, updatedAt: isoNow() } },
          ),
        ),
      );
      return { success: true };
    },
  );

  app.delete<{
    Params: { requestId: string };
    Querystring: { workspaceId: string };
  }>(
    "/requests/:requestId",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.query.workspaceId);
      const user = getRequiredUser(request);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      const requestDoc = await requireRequestDoc(
        app,
        workspace._id,
        request.params.requestId,
        user,
      );
      const project = await requireProject(
        app,
        workspace._id,
        requestDoc.projectId,
        user,
      );

      await app.assertProjectUnlocked(request, project, workspace);
      await workspaceDataCollection(app.mongo, workspace._id).deleteOne({
        _id: toObjectId(requestDoc._id),
      });
      return { success: true };
    },
  );

  app.get<{
    Params: { projectId: string };
    Querystring: { workspaceId: string };
  }>(
    "/projects/:projectId/history",
    { preHandler: app.authenticate },
    async (request) => {
      const workspace = await requireWorkspace(app, request.query.workspaceId);
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

      await app.assertProjectUnlocked(request, project, workspace);
      const history = serializeDocs(
        await workspaceDataCollection(app.mongo, workspace._id)
          .find({ entityType: "history", projectId: project._id })
          .sort({ createdAt: -1 })
          .toArray(),
      ) as HistoryDoc[];

      return { history };
    },
  );

  app.post<{ Body: ExecuteRequestPayload }>(
    "/execute",
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
        request.body.projectId,
        user,
      );

      if (request.body.requestId) {
        const savedRequest = await requireRequestDoc(
          app,
          workspace._id,
          request.body.requestId,
          user,
        );
        if (savedRequest.projectId !== project._id) {
          throw app.httpErrors.badRequest(
            "Request does not belong to the selected project",
          );
        }
      }

      await app.assertProjectUnlocked(request, project, workspace);
      const result = await executeHttpRequest(
        request.body,
        {
          allowPrivateNetworkTargets: app.config.allowPrivateNetworkTargets,
          allowedOutboundHosts: app.config.allowedOutboundHosts,
        },
        request.signal,
      );
      const now = isoNow();

      const historyRecord = {
        _id: createId(),
        entityType: "history",
        workspaceId: workspace._id,
        projectId: project._id,
        requestId: request.body.requestId,
        method: request.body.method,
        url: request.body.url,
        status: result.status,
        durationMs: result.durationMs,
        sizeBytes: result.sizeBytes,
        requestSnapshot: buildHistoryRequestSnapshot(request.body),
        responseSnapshot: buildHistoryResponseSnapshot(result),
        createdAt: now,
        updatedAt: now,
      };

      await workspaceDataCollection(app.mongo, workspace._id).insertOne(
        historyRecord as never,
      );
      await trimHistory(app, workspace._id, project._id);

      if (request.body.requestId) {
        await workspaceDataCollection(app.mongo, workspace._id).updateOne(
          { _id: toObjectId(request.body.requestId), entityType: "request" },
          {
            $set: { updatedAt: now },
            $push: {
              responseHistory: {
                $each: [
                  {
                    requestId: request.body.requestId,
                    method: request.body.method,
                    url: request.body.url,
                    status: result.status,
                    durationMs: result.durationMs,
                    createdAt: now,
                  },
                ],
                $slice: -10,
              },
            },
          },
        );
      }

      return result;
    },
  );
};

export default requestRoutes;

