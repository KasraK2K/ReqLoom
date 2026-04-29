import type {
  AdminUser,
  ProjectDoc,
  RealtimeEvent,
  UnlockTokenPayload,
  User,
  WorkspaceMeta,
} from "@restify/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import type { AppConfig } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    mongo: Db;
    authenticate: (
      request: FastifyRequest,
      reply?: FastifyReply,
    ) => Promise<void>;
    issueUnlockToken: (
      payload: Omit<UnlockTokenPayload, "exp">,
    ) => Promise<string>;
    readUnlockToken: (
      request: FastifyRequest,
    ) => Promise<UnlockTokenPayload | null>;
    assertWorkspaceUnlocked: (
      request: FastifyRequest,
      workspace: WorkspaceMeta,
    ) => Promise<void>;
    assertProjectUnlocked: (
      request: FastifyRequest,
      project: ProjectDoc,
      workspace?: WorkspaceMeta,
    ) => Promise<void>;
    publishRealtimeEvent: (
      event: Omit<RealtimeEvent, "id" | "occurredAt"> &
        Partial<Pick<RealtimeEvent, "id" | "occurredAt">> & {
          visibleToUserIds?: string[];
        },
    ) => void;
  }

  interface FastifyRequest {
    currentUser?: AdminUser | User | null;
  }
}
