import type {
  ChangeUserPasswordPayload,
  CreateUserPayload,
  UpdateUserPayload,
  User,
} from "@restify/shared";
import type { FastifyPluginAsync } from "fastify";
import { sanitizeAuthUser } from "../db/bootstrap.js";
import {
  createId,
  isoNow,
  toObjectId,
  usersCollection,
  workspaceMetaCollection,
} from "../db/collections.js";
import { hashPassword } from "../lib/password.js";
import { getRequiredUser } from "../lib/permissions.js";

async function syncWorkspaceMemberships(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  workspaceIds: string[],
  role: "admin" | "member",
) {
  await workspaceMetaCollection(app.mongo).updateMany(
    { "members.userId": userId },
    { $pull: { members: { userId } } },
  );

  if (workspaceIds.length === 0) {
    return;
  }

  await Promise.all(
    workspaceIds.map((workspaceId) =>
      workspaceMetaCollection(app.mongo).updateOne(
        { _id: toObjectId(workspaceId), ownerId: { $ne: userId } },
        { $addToSet: { members: { userId, role } } },
      ),
    ),
  );
}

function getTrimmedRequiredValue(
  value: string | undefined,
  fieldName: string,
  app: Parameters<FastifyPluginAsync>[0],
): string {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    throw app.httpErrors.badRequest(`${fieldName} is required`);
  }

  return trimmedValue;
}

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/users", { preHandler: app.authenticate }, async (request) => {
    if (getRequiredUser(request).role !== "superadmin") {
      throw app.httpErrors.forbidden(
        "Only the superadmin can access user management",
      );
    }

    const users = await usersCollection(app.mongo)
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return {
      users: users.map((user) => sanitizeAuthUser(user) as User),
    };
  });

  app.post<{ Body: CreateUserPayload }>(
    "/admin/users",
    { preHandler: app.authenticate },
    async (request) => {
      const currentUser = getRequiredUser(request);
      if (currentUser.role !== "superadmin") {
        throw app.httpErrors.forbidden("Only the superadmin can create users");
      }

      const name = getTrimmedRequiredValue(request.body.name, "Name", app);
      const username = getTrimmedRequiredValue(
        request.body.username,
        "Username",
        app,
      );
      if (!request.body.password) {
        throw app.httpErrors.badRequest("Password is required");
      }

      const now = isoNow();
      const userId = createId();
      const userRecord = {
        _id: userId,
        name,
        username,
        passwordHash: await hashPassword(request.body.password),
        role: request.body.role,
        createdBy: currentUser._id,
        workspaceIds: request.body.workspaceIds ?? [],
        createdAt: now,
        updatedAt: now,
      };

      await usersCollection(app.mongo).insertOne(userRecord as never);
      await syncWorkspaceMemberships(
        app,
        userId.toHexString(),
        userRecord.workspaceIds,
        userRecord.role,
      );
      app.publishRealtimeEvent({
        kind: "workspace.access.changed",
        actorUserId: currentUser._id,
        workspaceIds: userRecord.workspaceIds,
        visibleToUserIds: [userId.toHexString()],
      });

      return {
        user: sanitizeAuthUser(userRecord) as User,
      };
    },
  );

  app.patch<{
    Params: { userId: string };
    Body: UpdateUserPayload;
  }>(
    "/admin/users/:userId",
    { preHandler: app.authenticate },
    async (request) => {
      if (getRequiredUser(request).role !== "superadmin") {
        throw app.httpErrors.forbidden("Only the superadmin can update users");
      }

      const existingUser = await usersCollection(app.mongo).findOne({
        _id: toObjectId(request.params.userId),
      });
      if (!existingUser) {
        throw app.httpErrors.notFound("User not found");
      }

      const patch: Record<string, unknown> = { updatedAt: isoNow() };
      if (request.body.role) {
        patch.role = request.body.role;
      }
      if (request.body.workspaceIds) {
        patch.workspaceIds = request.body.workspaceIds;
      }

      await usersCollection(app.mongo).updateOne(
        { _id: existingUser._id },
        { $set: patch },
      );
      await syncWorkspaceMemberships(
        app,
        request.params.userId,
        request.body.workspaceIds ?? existingUser.workspaceIds,
        request.body.role ?? existingUser.role,
      );
      app.publishRealtimeEvent({
        kind: "workspace.access.changed",
        actorUserId: getRequiredUser(request)._id,
        workspaceIds: [
          ...new Set([
            ...existingUser.workspaceIds,
            ...(request.body.workspaceIds ?? existingUser.workspaceIds),
          ]),
        ],
        visibleToUserIds: [request.params.userId],
      });

      const updatedUser = await usersCollection(app.mongo).findOne({
        _id: existingUser._id,
      });
      return {
        user: sanitizeAuthUser(updatedUser!) as User,
      };
    },
  );

  app.patch<{
    Params: { userId: string };
    Body: ChangeUserPasswordPayload;
  }>(
    "/admin/users/:userId/password",
    { preHandler: app.authenticate },
    async (request) => {
      if (getRequiredUser(request).role !== "superadmin") {
        throw app.httpErrors.forbidden(
          "Only the superadmin can change user passwords",
        );
      }

      const { newPassword, confirmPassword } = request.body;
      if (!newPassword) {
        throw app.httpErrors.badRequest("New password is required");
      }
      if (newPassword !== confirmPassword) {
        throw app.httpErrors.badRequest("Passwords do not match");
      }

      const existingUser = await usersCollection(app.mongo).findOne({
        _id: toObjectId(request.params.userId),
      });
      if (!existingUser) {
        throw app.httpErrors.notFound("User not found");
      }

      await usersCollection(app.mongo).updateOne(
        { _id: existingUser._id },
        {
          $set: {
            passwordHash: await hashPassword(newPassword),
            updatedAt: isoNow(),
          },
        },
      );

      return { success: true };
    },
  );

  app.delete<{ Params: { userId: string } }>(
    "/admin/users/:userId",
    { preHandler: app.authenticate },
    async (request) => {
      if (getRequiredUser(request).role !== "superadmin") {
        throw app.httpErrors.forbidden("Only the superadmin can delete users");
      }

      const existingUser = await usersCollection(app.mongo).findOne({
        _id: toObjectId(request.params.userId),
      });
      if (!existingUser) {
        throw app.httpErrors.notFound("User not found");
      }

      await usersCollection(app.mongo).deleteOne({
        _id: existingUser._id,
      });
      await workspaceMetaCollection(app.mongo).updateMany(
        { "members.userId": request.params.userId },
        { $pull: { members: { userId: request.params.userId } } },
      );
      app.publishRealtimeEvent({
        kind: "workspace.access.changed",
        actorUserId: getRequiredUser(request)._id,
        workspaceIds: existingUser.workspaceIds,
        visibleToUserIds: [request.params.userId],
      });

      return { success: true };
    },
  );
};

export default adminRoutes;
