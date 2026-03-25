import type {
  AdminUser,
  FolderDoc,
  HistoryDoc,
  ProjectDoc,
  RequestDoc,
  User,
  WorkspaceTree,
  WorkspaceMeta,
} from "@restify/shared";
import {
  toObjectId,
  adminsCollection,
  serializeDoc,
  serializeDocs,
  usersCollection,
  workspaceDataCollection,
  workspaceMetaCollection,
  withoutPassword,
} from "./collections.js";
import type { Db } from "mongodb";

function sanitizeWorkspace(workspace: WorkspaceMeta): WorkspaceMeta {
  return {
    ...workspace,
    passwordHash: null,
    isPasswordProtected: false,
  };
}

function sanitizeProject<T extends ProjectDoc>(project: T): T {
  return {
    ...project,
    passwordHash: null,
    isPasswordProtected: false,
  };
}

export async function hasAnyAdmins(db: Db): Promise<boolean> {
  const count = await adminsCollection(db).countDocuments({}, { limit: 1 });
  return count > 0;
}

export async function findUserByUsername(db: Db, username: string) {
  const admin = await adminsCollection(db).findOne({ username });
  if (admin) {
    return admin;
  }

  return usersCollection(db).findOne({ username });
}

export async function findSessionUserById(
  db: Db,
  userId: string,
): Promise<AdminUser | User | null> {
  const adminById = await adminsCollection(db)
    .findOne({ _id: toObjectId(userId) })
    .catch(() => null);
  if (adminById) {
    return withoutPassword(serializeDoc(adminById)!) as AdminUser;
  }

  const userById = await usersCollection(db)
    .findOne({ _id: toObjectId(userId) })
    .catch(() => null);
  if (!userById) {
    return null;
  }

  return withoutPassword(serializeDoc(userById)!) as User;
}

export async function listAccessibleWorkspaces(
  db: Db,
  user: AdminUser | User,
): Promise<WorkspaceMeta[]> {
  if (user.role === "superadmin") {
    return (serializeDocs(
      await workspaceMetaCollection(db)
        .find({})
        .sort({ order: 1, createdAt: 1 })
        .toArray(),
    ) as WorkspaceMeta[]).map(sanitizeWorkspace);
  }

  const workspaces = await workspaceMetaCollection(db)
    .find({
      $or: [{ ownerId: user._id }, { "members.userId": user._id }],
    })
    .sort({ order: 1, createdAt: 1 })
    .toArray();

  return (serializeDocs(workspaces) as WorkspaceMeta[]).map(sanitizeWorkspace);
}

export async function getWorkspaceById(
  db: Db,
  workspaceId: string,
): Promise<WorkspaceMeta | null> {
  const workspace = await workspaceMetaCollection(db)
    .findOne({ _id: toObjectId(workspaceId) })
    .catch(() => null);

  if (!workspace) {
    return null;
  }

  return sanitizeWorkspace(serializeDoc(workspace) as WorkspaceMeta);
}

export async function buildWorkspaceTree(
  db: Db,
  workspace: WorkspaceMeta,
): Promise<WorkspaceTree> {
  const records = serializeDocs(
    await workspaceDataCollection(db, workspace._id)
      .find({})
      .sort({ order: 1, createdAt: 1 })
      .toArray(),
  ) as Array<ProjectDoc | FolderDoc | RequestDoc | HistoryDoc>;

  const projects = records.filter(
    (record): record is ProjectDoc => record.entityType === "project",
  );
  const folders = records.filter(
    (record): record is FolderDoc => record.entityType === "folder",
  );
  const requests = records.filter(
    (record): record is RequestDoc => record.entityType === "request",
  );

  const projectTree = projects.map((project) => {
    const projectFolders = folders
      .filter((folder) => folder.projectId === project._id)
      .sort((a, b) => a.order - b.order)
      .map((folder) => ({
        ...folder,
        requests: requests
          .filter(
            (request) =>
              request.projectId === project._id &&
              request.folderId === folder._id,
          )
          .sort((a, b) => a.order - b.order),
      }));

    return {
      ...sanitizeProject(project),
      folders: projectFolders,
      requests: requests
        .filter(
          (request) => request.projectId === project._id && !request.folderId,
        )
        .sort((a, b) => a.order - b.order),
    };
  });

  return {
    workspace: sanitizeWorkspace(workspace),
    projects: projectTree.sort((a, b) => a.order - b.order),
  };
}