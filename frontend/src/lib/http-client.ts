import type {
  BootstrapStatusResponse,
  ChangeMyPasswordPayload,
  ChangeUserPasswordPayload,
  CreateSuperuserPayload,
  CreateUserPayload,
  ExecuteRequestPayload,
  ExecuteRequestResult,
  FolderDoc,
  HistoryResponse,
  ImportPostmanCollectionPayload,
  ImportPostmanCollectionResponse,
  ListUsersResponse,
  ListWorkspacesResponse,
  LoginPayload,
  MeResponse,
  ProjectDoc,
  ProjectEnvVar,
  RequestDoc,
  UpdateProfilePayload,
  UpdateUserPayload,
  User,
  WorkspaceMeta,
  WorkspaceTreeResponse,
} from "@restify/shared";
import { extractApiErrorMessage } from "./errors";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      extractApiErrorMessage(text) ?? `Request failed with ${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrapStatus: () =>
    requestJson<BootstrapStatusResponse>("/auth/bootstrap-status"),
  me: () => requestJson<MeResponse>("/auth/me"),
  login: (body: LoginPayload) =>
    requestJson<MeResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createSuperuser: (body: CreateSuperuserPayload) =>
    requestJson<MeResponse>("/auth/bootstrap-superuser", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateMyProfile: (body: UpdateProfilePayload) =>
    requestJson<MeResponse>("/auth/me/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  changeMyPassword: (body: ChangeMyPasswordPayload) =>
    requestJson<{ success: boolean }>("/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  logout: () =>
    requestJson<{ success: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listWorkspaces: () => requestJson<ListWorkspacesResponse>("/workspaces"),
  getWorkspaceTree: (workspaceId: string) =>
    requestJson<WorkspaceTreeResponse>(`/workspaces/${workspaceId}/tree`),
  createWorkspace: (name: string) =>
    requestJson<{ workspace: WorkspaceMeta }>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  renameWorkspace: (
    workspaceId: string,
    name: string,
    expectedUpdatedAt?: string,
  ) =>
    requestJson<{ workspace: WorkspaceMeta }>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, expectedUpdatedAt }),
    }),
  duplicateWorkspace: (workspaceId: string) =>
    requestJson<{ workspace: WorkspaceMeta }>(
      `/workspaces/${workspaceId}/duplicate`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  reorderWorkspaces: (orderedIds: string[]) =>
    requestJson<{ success: boolean }>("/workspaces/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    }),
  deleteWorkspace: (workspaceId: string) =>
    requestJson<{ success: boolean }>(`/workspaces/${workspaceId}`, {
      method: "DELETE",
    }),
  createProject: (workspaceId: string, name: string) =>
    requestJson<{ project: ProjectDoc }>("/projects", {
      method: "POST",
      body: JSON.stringify({ workspaceId, name }),
    }),
  updateProject: (
    projectId: string,
    workspaceId: string,
    values: {
      name?: string;
      envVars?: ProjectEnvVar[];
      isPrivate?: boolean;
      expectedUpdatedAt?: string;
    },
  ) =>
    requestJson<{ project: ProjectDoc }>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ workspaceId, ...values }),
    }),
  moveProject: (
    projectId: string,
    payload: {
      sourceWorkspaceId: string;
      targetWorkspaceId: string;
      targetOrder?: number;
    },
  ) =>
    requestJson<{ project: ProjectDoc }>(`/projects/${projectId}/move`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  duplicateProject: (projectId: string, workspaceId: string) =>
    requestJson<{ project: ProjectDoc }>(`/projects/${projectId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    }),
  reorderProjects: (workspaceId: string, orderedIds: string[]) =>
    requestJson<{ success: boolean }>("/projects/reorder", {
      method: "POST",
      body: JSON.stringify({ workspaceId, orderedIds }),
    }),
  deleteProject: (projectId: string, workspaceId: string) =>
    requestJson<{ success: boolean }>(
      `/projects/${projectId}?workspaceId=${workspaceId}`,
      { method: "DELETE" },
    ),
  importPostmanCollection: (payload: ImportPostmanCollectionPayload) =>
    requestJson<ImportPostmanCollectionResponse>("/projects/import-postman", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createFolder: (
    workspaceId: string,
    projectId: string,
    name: string,
    parentFolderId?: string | null,
  ) =>
    requestJson<{ folder: FolderDoc }>("/folders", {
      method: "POST",
      body: JSON.stringify({ workspaceId, projectId, parentFolderId, name }),
    }),
  updateFolder: (
    folderId: string,
    workspaceId: string,
    values: { name?: string; isPrivate?: boolean; expectedUpdatedAt?: string },
  ) =>
    requestJson<{ folder: FolderDoc }>(`/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify({ workspaceId, ...values }),
    }),
  duplicateFolder: (folderId: string, workspaceId: string) =>
    requestJson<{ folder: FolderDoc }>(`/folders/${folderId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    }),
  reorderFolders: (
    workspaceId: string,
    projectId: string,
    orderedIds: string[],
    parentFolderId?: string | null,
  ) =>
    requestJson<{ success: boolean }>("/folders/reorder", {
      method: "POST",
      body: JSON.stringify({ workspaceId, projectId, parentFolderId, orderedIds }),
    }),
  moveFolder: (
    folderId: string,
    payload: {
      workspaceId: string;
      targetProjectId: string;
      targetParentFolderId?: string | null;
      targetOrder?: number;
    },
  ) =>
    requestJson<{ folder: FolderDoc }>(`/folders/${folderId}/move`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFolder: (folderId: string, workspaceId: string) =>
    requestJson<{ success: boolean }>(
      `/folders/${folderId}?workspaceId=${workspaceId}`,
      { method: "DELETE" },
    ),
  createRequest: (
    payload: Omit<
      RequestDoc,
      "_id" | "entityType" | "responseHistory" | "createdAt" | "updatedAt"
    >,
  ) =>
    requestJson<{ request: RequestDoc }>("/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRequest: (
    requestId: string,
    payload: Partial<RequestDoc> & {
      workspaceId: string;
      expectedContentUpdatedAt?: string;
    },
  ) =>
    requestJson<{ request: RequestDoc }>(`/requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  moveRequest: (
    requestId: string,
    payload: {
      workspaceId: string;
      targetProjectId: string;
      targetFolderId?: string | null;
      targetOrder?: number;
    },
  ) =>
    requestJson<{ request: RequestDoc }>(`/requests/${requestId}/move`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  duplicateRequest: (requestId: string, workspaceId: string) =>
    requestJson<{ request: RequestDoc }>(`/requests/${requestId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    }),
  reorderRequests: (workspaceId: string, orderedIds: string[]) =>
    requestJson<{ success: boolean }>("/requests/reorder", {
      method: "POST",
      body: JSON.stringify({ workspaceId, orderedIds }),
    }),
  deleteRequest: (requestId: string, workspaceId: string) =>
    requestJson<{ success: boolean }>(
      `/requests/${requestId}?workspaceId=${workspaceId}`,
      { method: "DELETE" },
    ),
  execute: (payload: ExecuteRequestPayload, signal?: AbortSignal) =>
    requestJson<ExecuteRequestResult>("/execute", {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    }),
  getProjectHistory: (projectId: string, workspaceId: string) =>
    requestJson<HistoryResponse>(
      `/projects/${projectId}/history?workspaceId=${workspaceId}`,
    ),
  listUsers: () => requestJson<ListUsersResponse>("/admin/users"),
  createUser: (payload: CreateUserPayload) =>
    requestJson<{ user: User }>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateUser: (userId: string, payload: UpdateUserPayload) =>
    requestJson<{ user: User }>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  changeUserPassword: (
    userId: string,
    payload: ChangeUserPasswordPayload,
  ) =>
    requestJson<{ success: boolean }>(`/admin/users/${userId}/password`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteUser: (userId: string) =>
    requestJson<{ success: boolean }>(`/admin/users/${userId}`, {
      method: "DELETE",
    }),
};
