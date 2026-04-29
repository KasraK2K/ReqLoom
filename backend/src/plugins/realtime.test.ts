import Fastify from "fastify";
import type { AppConfig } from "../config.js";
import type { AdminRecord, UserRecord, WorkspaceMetaRecord } from "../db/collections.js";
import jwtPlugin from "./jwt.js";
import realtimePlugin from "./realtime.js";
import { afterEach, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type WebSocket from "ws";

type TestDoc = Record<string, unknown> & { _id: ObjectId };
type Filter = Record<string, unknown>;

function getFieldValue(record: Record<string, unknown>, path: string): unknown {
  const [head, ...tail] = path.split(".");
  const value = record[head];
  if (tail.length === 0) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      getFieldValue(entry as Record<string, unknown>, tail.join(".")),
    );
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  return getFieldValue(value as Record<string, unknown>, tail.join("."));
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (actual instanceof ObjectId && expected instanceof ObjectId) {
    return actual.equals(expected);
  }

  if (Array.isArray(actual)) {
    return actual.some((entry) => valuesEqual(entry, expected));
  }

  return actual === expected;
}

function matchesFilter(record: Record<string, unknown>, filter: Filter): boolean {
  const orConditions = filter.$or;
  if (Array.isArray(orConditions)) {
    return orConditions.some((condition) =>
      matchesFilter(record, condition as Filter),
    );
  }

  return Object.entries(filter).every(([field, expected]) => {
    if (field === "$or") {
      return true;
    }
    return valuesEqual(getFieldValue(record, field), expected);
  });
}

class FakeCursor<T extends TestDoc> {
  constructor(private readonly records: T[]) {}

  sort() {
    return this;
  }

  async toArray() {
    return this.records;
  }
}

class FakeCollection<T extends TestDoc> {
  constructor(private readonly records: T[]) {}

  async findOne(filter: Filter) {
    return this.records.find((record) => matchesFilter(record, filter)) ?? null;
  }

  find(filter: Filter = {}) {
    return new FakeCursor(this.records.filter((record) => matchesFilter(record, filter)));
  }
}

class FakeDb {
  admins: AdminRecord[] = [];
  users: UserRecord[] = [];
  workspaces: WorkspaceMetaRecord[] = [];

  collection(name: string) {
    if (name === "admins") {
      return new FakeCollection(this.admins);
    }
    if (name === "users") {
      return new FakeCollection(this.users);
    }
    if (name === "workspace_meta") {
      return new FakeCollection(this.workspaces);
    }

    throw new Error(`Unknown collection: ${name}`);
  }
}

function createTestConfig(): AppConfig {
  return {
    port: 0,
    mongoUri: "mongodb://localhost:27017/restify-test",
    mongoServerSelectionTimeoutMs: 100,
    jwtSecret: "test-jwt-secret-that-is-long-enough-123456",
    dataEncryptionKey: "test-data-secret-that-is-long-enough-123456",
    cookieName: "restify_session",
    cookieDomain: undefined,
    cookieSecure: false,
    frontendOrigin: "http://localhost:3030",
    frontendOrigins: ["http://localhost:3030"],
    nodeEnv: "test",
    unlockTtlMinutes: 15,
    frontendDistDir: "",
    superuserBootstrapSecret: undefined,
    allowPrivateNetworkTargets: true,
    allowedOutboundHosts: [],
    historyLimit: 250,
  };
}

function createAdminRecord(): AdminRecord {
  return {
    _id: new ObjectId(),
    name: "Super Admin",
    username: "superadmin",
    passwordHash: "hash",
    role: "superadmin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createUserRecord(workspaceId: string): UserRecord {
  return {
    _id: new ObjectId(),
    name: "Member",
    username: "member",
    passwordHash: "hash",
    role: "member",
    createdBy: new ObjectId().toHexString(),
    workspaceIds: [workspaceId],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createWorkspaceRecord(
  workspaceId: ObjectId,
  memberId?: string,
): WorkspaceMetaRecord {
  return {
    _id: workspaceId,
    name: "Workspace",
    ownerId: new ObjectId().toHexString(),
    members: memberId ? [{ userId: memberId, role: "member" }] : [],
    order: 0,
    passwordHash: null,
    isPasswordProtected: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function buildTestApp(db: FakeDb) {
  const app = Fastify();
  app.decorate("config", createTestConfig());
  app.decorate("mongo", db as never);
  await app.register(jwtPlugin);
  await app.register(realtimePlugin);
  await app.ready();
  return app;
}

function nextMessage(socket: WebSocket) {
  return new Promise<string>((resolve) => {
    socket.once("message", (data) => resolve(data.toString()));
  });
}

function settleSocketHandler() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let app: Awaited<ReturnType<typeof buildTestApp>> | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

describe("realtime plugin", () => {
  it("broadcasts sanitized events to authorized websocket clients", async () => {
    const db = new FakeDb();
    const admin = createAdminRecord();
    db.admins.push(admin);
    app = await buildTestApp(db);
    const token = await app.jwt.sign({
      sub: admin._id.toHexString(),
      username: admin.username,
      role: admin.role,
    });
    const socket = await app.injectWS("/api/realtime", {
      headers: { cookie: `restify_session=${token}` },
    });
    await settleSocketHandler();
    const message = nextMessage(socket);

    app.publishRealtimeEvent({
      kind: "project.updated",
      actorUserId: "actor-1",
      workspaceIds: ["workspace-1"],
      projectIds: ["project-1"],
      visibleToUserIds: ["hidden-user"],
    });

    const parsedMessage = JSON.parse(await message);
    expect(parsedMessage).toMatchObject({
      kind: "project.updated",
      actorUserId: "actor-1",
      workspaceIds: ["workspace-1"],
      projectIds: ["project-1"],
    });
    expect(parsedMessage).not.toHaveProperty("visibleToUserIds");
  });

  it("does not send workspace events to clients without access", async () => {
    const db = new FakeDb();
    const allowedWorkspaceId = new ObjectId();
    const blockedWorkspaceId = new ObjectId();
    const user = createUserRecord(allowedWorkspaceId.toHexString());
    db.users.push(user);
    db.workspaces.push(createWorkspaceRecord(allowedWorkspaceId, user._id.toHexString()));
    db.workspaces.push(createWorkspaceRecord(blockedWorkspaceId));
    app = await buildTestApp(db);
    const token = await app.jwt.sign({
      sub: user._id.toHexString(),
      username: user.username,
      role: user.role,
    });
    const socket = await app.injectWS("/api/realtime", {
      headers: { cookie: `restify_session=${token}` },
    });
    await settleSocketHandler();
    let received = false;
    socket.once("message", () => {
      received = true;
    });

    app.publishRealtimeEvent({
      kind: "project.updated",
      workspaceIds: [blockedWorkspaceId.toHexString()],
      projectIds: ["project-1"],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toBe(false);
  });
});
