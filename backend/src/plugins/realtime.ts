import { randomUUID } from "node:crypto";
import websocket from "@fastify/websocket";
import type { AdminUser, RealtimeEvent, User } from "@restify/shared";
import fp from "fastify-plugin";
import WebSocket from "ws";
import { listAccessibleWorkspaces } from "../db/bootstrap.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const UNAUTHORIZED_CLOSE_CODE = 1008;

type SessionUser = AdminUser | User;

interface RealtimeClient {
  socket: WebSocket;
  user: SessionUser;
  workspaceIds: Set<string>;
  isAlive: boolean;
}

type RealtimePublishInput = Omit<RealtimeEvent, "id" | "occurredAt"> &
  Partial<Pick<RealtimeEvent, "id" | "occurredAt">> & {
    visibleToUserIds?: string[];
  };

function unique(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  return [...new Set(values)];
}

function canReceiveEvent(
  client: RealtimeClient,
  event: RealtimeEvent,
  visibleToUserIds: Set<string>,
): boolean {
  if (client.user.role === "superadmin") {
    return true;
  }

  if (visibleToUserIds.has(client.user._id)) {
    return true;
  }

  return event.workspaceIds.some((workspaceId) =>
    client.workspaceIds.has(workspaceId),
  );
}

export default fp(async function realtimePlugin(app) {
  const clients = new Set<RealtimeClient>();

  await app.register(websocket, {
    options: {
      maxPayload: 1024,
    },
  });

  app.decorate("publishRealtimeEvent", (input: RealtimePublishInput) => {
    const visibleToUserIds = new Set(input.visibleToUserIds ?? []);
    const event: RealtimeEvent = {
      id: input.id ?? randomUUID(),
      kind: input.kind,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      actorUserId: input.actorUserId,
      workspaceIds: unique(input.workspaceIds) ?? [],
      projectIds: unique(input.projectIds),
      folderIds: unique(input.folderIds),
      requestIds: unique(input.requestIds),
    };
    const payload = JSON.stringify(event);

    for (const client of clients) {
      if (
        client.socket.readyState !== WebSocket.OPEN ||
        !canReceiveEvent(client, event, visibleToUserIds)
      ) {
        continue;
      }

      client.socket.send(payload, (error) => {
        if (error) {
          app.log.debug({ error }, "Failed to send realtime event");
        }
      });
    }
  });

  app.get(
    "/api/realtime",
    { websocket: true },
    (socket, request) => {
      let client: RealtimeClient | undefined;
      socket.on("error", (error) => {
        app.log.debug({ error }, "Realtime socket error");
      });
      socket.on("close", () => {
        if (client) {
          clients.delete(client);
        }
      });

      void (async () => {
        try {
          await app.authenticate(request);
          const user = request.currentUser;
          if (!user) {
            socket.close(UNAUTHORIZED_CLOSE_CODE, "Unauthorized");
            return;
          }

          const workspaceIds = new Set(
            (await listAccessibleWorkspaces(app.mongo, user)).map(
              (workspace) => workspace._id,
            ),
          );
          if (socket.readyState !== WebSocket.OPEN) {
            return;
          }

          client = {
            socket,
            user,
            workspaceIds,
            isAlive: true,
          };
          socket.on("pong", () => {
            if (client) {
              client.isAlive = true;
            }
          });
          clients.add(client);
        } catch (error) {
          app.log.debug({ error }, "Rejected realtime socket");
          socket.close(UNAUTHORIZED_CLOSE_CODE, "Unauthorized");
        }
      })();
    },
  );

  const heartbeatTimer = setInterval(() => {
    for (const client of clients) {
      if (client.socket.readyState !== WebSocket.OPEN) {
        clients.delete(client);
        continue;
      }

      if (!client.isAlive) {
        clients.delete(client);
        client.socket.terminate();
        continue;
      }

      client.isAlive = false;
      client.socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  app.addHook("onClose", async () => {
    clearInterval(heartbeatTimer);
    for (const client of clients) {
      client.socket.close();
    }
    clients.clear();
  });
});
