import type {
  CreateSuperuserPayload,
  ExecuteRequestPayload,
  ExecuteRequestResult,
  FolderDoc,
  HistoryResponse,
  ListUsersResponse,
  ListWorkspacesResponse,
  LoginPayload,
  MeResponse,
  ProjectDoc,
  ProjectEnvVar,
  RequestDoc,
  User,
  WorkspaceMeta,
  WorkspaceTreeResponse,
} from "@restify/shared";

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
    throw new Error(text || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrapStatus: () =>
    requestJson<{ needsSuperuser: boolean }>("/auth/bootstrap-status"),
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
  renameWorkspace: (workspaceId: string, name: string) =>
    requestJson<{ workspace: WorkspaceMeta }>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
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
    values: { name?: string; envVars?: ProjectEnvVar[] },
  ) =>
    requestJson<{ project: ProjectDoc }>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ workspaceId, ...values }),
    }),
  moveProject: (
    projectId: string,
    payload: { sourceWorkspaceId: string; targetWorkspaceId: string },
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
  createFolder: (workspaceId: string, projectId: string, name: string) =>
    requestJson<{ folder: FolderDoc }>("/folders", {
      method: "POST",
      body: JSON.stringify({ workspaceId, projectId, name }),
    }),
  updateFolder: (folderId: string, workspaceId: string, name: string) =>
    requestJson<{ folder: FolderDoc }>(`/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify({ workspaceId, name }),
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
  ) =>
    requestJson<{ success: boolean }>("/folders/reorder", {
      method: "POST",
      body: JSON.stringify({ workspaceId, projectId, orderedIds }),
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
    payload: Partial<RequestDoc> & { workspaceId: string },
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
  execute: (payload: ExecuteRequestPayload) =>
    requestJson<ExecuteRequestResult>("/execute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getProjectHistory: (projectId: string, workspaceId: string) =>
    requestJson<HistoryResponse>(
      `/projects/${projectId}/history?workspaceId=${workspaceId}`,
    ),
  listUsers: () => requestJson<ListUsersResponse>("/admin/users"),
  createUser: (payload: {
    username: string;
    password: string;
    role: "admin" | "member";
    workspaceIds?: string[];
  }) =>
    requestJson<{ user: User }>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateUser: (
    userId: string,
    payload: {
      username?: string;
      password?: string;
      role?: "admin" | "member";
      workspaceIds?: string[];
    },
  ) =>
    requestJson<{ user: User }>(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteUser: (userId: string) =>
    requestJson<{ success: boolean }>(`/admin/users/${userId}`, {
      method: "DELETE",
    }),
};