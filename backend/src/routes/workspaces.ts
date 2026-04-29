import type { FastifyPluginAsync } from "fastify";
import type { WorkspaceMeta } from "@restify/shared";
import {
  buildWorkspaceTree,
  getWorkspaceById,
  listAccessibleWorkspaces,
} from "../db/bootstrap.js";
import {
  createId,
  isoNow,
  serializeDoc,
  toObjectId,
  workspaceDataCollection,
  workspaceMetaCollection,
} from "../db/collections.js";
import {
  canAccessWorkspace,
  canManageWorkspace,
  getRequiredUser,
} from "../lib/permissions.js";

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

function workspaceRevision(workspace: WorkspaceMeta): string {
  return workspace.updatedAt ?? workspace.createdAt;
}

function assertExpectedWorkspaceRevision(
  app: Parameters<FastifyPluginAsync>[0],
  workspace: WorkspaceMeta,
  expectedUpdatedAt?: string,
) {
  if (expectedUpdatedAt && expectedUpdatedAt !== workspaceRevision(workspace)) {
    throw app.httpErrors.conflict(
      "Workspace was updated by another client. Refresh and try again.",
    );
  }
}

const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces", { preHandler: app.authenticate }, async (request) => ({
    workspaces: await listAccessibleWorkspaces(
      app.mongo,
      getRequiredUser(request),
    ),
  }));

  app.post<{ Body: { name: string } }>(
    "/workspaces",
    { preHandler: app.authenticate },
    async (request) => {
      const user = getRequiredUser(request);
      if (user.role === "member") {
        throw app.httpErrors.forbidden("Members cannot create workspaces");
      }

      const name = request.body.name?.trim();
      if (!name) {
        throw app.httpErrors.badRequest("Workspace name is required");
      }

      const now = isoNow();
      const workspaceId = createId();
      const currentCount = await workspaceMetaCollection(
        app.mongo,
      ).countDocuments();
      const workspace = {
        _id: workspaceId,
        name,
        ownerId: user._id,
        members: [],
        order: currentCount,
        passwordHash: null,
        isPasswordProtected: false,
        createdAt: now,
        updatedAt: now,
      };

      await workspaceMetaCollection(app.mongo).insertOne(workspace as never);
      await workspaceDataCollection(
        app.mongo,
        workspaceId.toHexString(),
      ).createIndex({ entityType: 1, order: 1 });

      app.publishRealtimeEvent({
        kind: "workspace.created",
        actorUserId: user._id,
        workspaceIds: [workspaceId.toHexString()],
        visibleToUserIds: [user._id],
      });

      return { workspace: serializeDoc(workspace) };
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/tree",
    { preHandler: app.authenticate },
    async (request) => {
      const user = getRequiredUser(request);
      const workspace = await requireWorkspace(app, request.params.workspaceId);
      if (!canAccessWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "You do not have access to this workspace",
        );
      }

      await app.assertWorkspaceUnlocked(request, workspace);
      return {
        tree: await buildWorkspaceTree(app.mongo, workspace, user),
      };
    },
  );

  app.patch<{
    Params: { workspaceId: string };
    Body: { name: string; expectedUpdatedAt?: string };
  }>(
    "/workspaces/:workspaceId",
    { preHandler: app.authenticate },
    async (request) => {
      const user = getRequiredUser(request);
      const workspace = await requireWorkspace(app, request.params.workspaceId);
      if (!canManageWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "Only the workspace owner or superadmin can rename this workspace",
        );
      }

      const name = request.body.name?.trim();
      if (!name) {
        throw app.httpErrors.badRequest("Workspace name is required");
      }
      assertExpectedWorkspaceRevision(
        app,
        workspace,
        request.body.expectedUpdatedAt,
      );

      const updateResult = await workspaceMetaCollection(app.mongo).updateOne(
        request.body.expectedUpdatedAt
          ? { _id: toObjectId(workspace._id), updatedAt: request.body.expectedUpdatedAt }
          : { _id: toObjectId(workspace._id) },
        { $set: { name, updatedAt: isoNow() } },
      );
      if (request.body.expectedUpdatedAt && updateResult.matchedCount === 0) {
        throw app.httpErrors.conflict(
          "Workspace was updated by another client. Refresh and try again.",
        );
      }

      const updatedWorkspace = await requireWorkspace(app, workspace._id);
      app.publishRealtimeEvent({
        kind: "workspace.updated",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
      });

      return {
        workspace: updatedWorkspace,
      };
    },
  );

  app.post<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/duplicate",
    { preHandler: app.authenticate },
    async (request) => {
      const user = getRequiredUser(request);
      const sourceWorkspace = await requireWorkspace(
        app,
        request.params.workspaceId,
      );
      if (!canManageWorkspace(user, sourceWorkspace)) {
        throw app.httpErrors.forbidden(
          "Only the workspace owner or superadmin can duplicate this workspace",
        );
      }

      const now = isoNow();
      const duplicatedWorkspaceId = createId();
      const allRecords = await workspaceDataCollection(
        app.mongo,
        sourceWorkspace._id,
      )
        .find({})
        .toArray();
      const idMap = new Map<string, string>();

      allRecords.forEach((record) =>
        idMap.set(record._id.toHexString(), createId().toHexString()),
      );

      const duplicatedWorkspace = {
        _id: duplicatedWorkspaceId,
        name: `${sourceWorkspace.name} Copy`,
        ownerId: user._id,
        members: [],
        order: await workspaceMetaCollection(app.mongo).countDocuments(),
        passwordHash: null,
        isPasswordProtected: false,
        createdAt: now,
        updatedAt: now,
      };

      await workspaceMetaCollection(app.mongo).insertOne(
        duplicatedWorkspace as never,
      );

      if (allRecords.length > 0) {
        const duplicatedRecords = allRecords.map((record) => {
          const nextId = idMap.get(record._id.toHexString())!;
          const cloned = {
            ...record,
            _id: toObjectId(nextId),
            workspaceId: duplicatedWorkspaceId.toHexString(),
            createdAt: now,
            updatedAt: now,
          } as Record<string, unknown>;

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

        await workspaceDataCollection(
          app.mongo,
          duplicatedWorkspaceId.toHexString(),
        ).insertMany(duplicatedRecords as never[]);
      }

      app.publishRealtimeEvent({
        kind: "workspace.duplicated",
        actorUserId: user._id,
        workspaceIds: [duplicatedWorkspaceId.toHexString()],
        visibleToUserIds: [user._id],
      });

      return {
        workspace: serializeDoc(duplicatedWorkspace),
      };
    },
  );

  app.post<{ Body: { orderedIds: string[] } }>(
    "/workspaces/reorder",
    { preHandler: app.authenticate },
    async (request) => {
      const user = getRequiredUser(request);
      const workspaces = await listAccessibleWorkspaces(app.mongo, user);
      const allowedIds = new Set(
        workspaces
          .filter((workspace) => canManageWorkspace(user, workspace))
          .map((workspace) => workspace._id),
      );
      const orderedIds = request.body.orderedIds.filter((id) =>
        allowedIds.has(id),
      );

      await Promise.all(
        orderedIds.map((workspaceId, index) =>
          workspaceMetaCollection(app.mongo).updateOne(
            { _id: toObjectId(workspaceId) },
            { $set: { order: index, updatedAt: isoNow() } },
          ),
        ),
      );

      app.publishRealtimeEvent({
        kind: "workspace.reordered",
        actorUserId: user._id,
        workspaceIds: orderedIds,
      });

      return { success: true };
    },
  );

  app.delete<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId",
    { preHandler: app.authenticate },
    async (request) => {
      const user = getRequiredUser(request);
      const workspace = await requireWorkspace(app, request.params.workspaceId);
      if (!canManageWorkspace(user, workspace)) {
        throw app.httpErrors.forbidden(
          "Only the workspace owner or superadmin can delete this workspace",
        );
      }

      await workspaceMetaCollection(app.mongo).deleteOne({
        _id: toObjectId(workspace._id),
      });
      await app.mongo
        .dropCollection(`workspaces_${workspace._id}`)
        .catch(() => undefined);

      app.publishRealtimeEvent({
        kind: "workspace.deleted",
        actorUserId: user._id,
        workspaceIds: [workspace._id],
        visibleToUserIds: [
          workspace.ownerId,
          ...workspace.members.map((member) => member.userId),
        ],
      });

      return { success: true };
    },
  );
};

export default workspaceRoutes;
