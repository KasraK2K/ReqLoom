export type UserRole = "superadmin" | "admin" | "member";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type WorkspaceEntityType = "project" | "folder" | "request" | "history";
export type AuthType = "none" | "bearer" | "basic";
export type BodyType =
  | "none"
  | "json"
  | "text"
  | "form-data"
  | "x-www-form-urlencoded";
export type ContentKind = "json" | "html" | "xml" | "image" | "text" | "binary";

export interface Timestamped {
  createdAt: string;
  updatedAt?: string;
}

export interface WorkspaceMember {
  userId: string;
  role: Exclude<UserRole, "superadmin">;
}

export interface BaseUser extends Timestamped {
  _id: string;
  name: string;
  username: string;
  role: UserRole;
  passwordHash?: string;
}

export interface AdminUser extends BaseUser {
  role: "superadmin";
}

export interface User extends BaseUser {
  role: "admin" | "member";
  createdBy: string;
  workspaceIds: string[];
}

export interface WorkspaceMeta extends Timestamped {
  _id: string;
  name: string;
  ownerId: string;
  members: WorkspaceMember[];
  order: number;
  passwordHash?: string | null;
  isPasswordProtected: boolean;
}

export interface ProjectEnvVar {
  key: string;
  value: string;
}

export interface ProjectDoc extends Timestamped {
  _id: string;
  entityType: "project";
  workspaceId: string;
  name: string;
  envVars: ProjectEnvVar[];
  order: number;
  ownerId: string;
  createdBy: string;
  passwordHash?: string | null;
  isPasswordProtected: boolean;
  isPrivate: boolean;
}

export interface FolderDoc extends Timestamped {
  _id: string;
  entityType: "folder";
  workspaceId: string;
  projectId: string;
  parentFolderId?: string | null;
  name: string;
  order: number;
  isPrivate: boolean;
}

export interface HeaderRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface QueryParamRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type FormValueKind = "text" | "file";

export interface FormValueRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  valueKind?: FormValueKind;
  fileName?: string;
  fileContentBase64?: string;
  fileContentType?: string;
  fileSizeBytes?: number;
}

export interface RequestAuthConfig {
  type: AuthType;
  token?: string;
  username?: string;
  password?: string;
}

export interface RequestBodyConfig {
  type: BodyType;
  content?: string;
  values?: FormValueRow[];
}

export interface RequestHistorySummary {
  requestId?: string;
  method: HttpMethod;
  url: string;
  status: number;
  durationMs: number;
  createdAt: string;
}

export interface HistoryRequestSnapshot {
  headers: HeaderRow[];
  params: QueryParamRow[];
  body: RequestBodyConfig;
  auth: RequestAuthConfig;
  computedHeaders: Record<string, string>;
  secretsRedacted?: boolean;
}

export interface HistoryResponseSnapshot {
  statusText?: string;
  headers?: Record<string, string>;
  cookies?: ExecuteResponseCookie[];
  contentType: string;
  contentKind: ContentKind;
  textBody?: string;
}

export interface RequestDoc extends Timestamped {
  _id: string;
  entityType: "request";
  workspaceId: string;
  projectId: string;
  folderId?: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  headers: HeaderRow[];
  params: QueryParamRow[];
  body: RequestBodyConfig;
  auth: RequestAuthConfig;
  responseHistory: RequestHistorySummary[];
  order: number;
  isPrivate: boolean;
}

export interface HistoryDoc extends Timestamped {
  _id: string;
  entityType: "history";
  workspaceId: string;
  projectId: string;
  requestId?: string;
  method: HttpMethod;
  url: string;
  status: number;
  durationMs: number;
  sizeBytes: number;
  requestSnapshot?: HistoryRequestSnapshot;
  responseSnapshot?: HistoryResponseSnapshot;
}

export interface FolderTree extends FolderDoc {
  folders: FolderTree[];
  requests: RequestDoc[];
}

export interface ProjectTree extends ProjectDoc {
  folders: FolderTree[];
  requests: RequestDoc[];
}

export interface WorkspaceTree {
  workspace: WorkspaceMeta;
  projects: ProjectTree[];
}

export interface BootstrapStatusResponse {
  needsSuperuser: boolean;
  requiresSetupSecret: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface CreateSuperuserPayload extends LoginPayload {
  name: string;
  confirmPassword: string;
  setupSecret?: string;
}

export interface UpdateProfilePayload {
  name: string;
}

export interface ChangeMyPasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface CreateUserPayload {
  name: string;
  username: string;
  password: string;
  role: "admin" | "member";
  workspaceIds?: string[];
}

export interface UpdateUserPayload {
  role?: "admin" | "member";
  workspaceIds?: string[];
}

export interface ChangeUserPasswordPayload {
  newPassword: string;
  confirmPassword: string;
}

export interface MeResponse {
  user: AdminUser | User | null;
}

export interface UserSessionToken {
  sub: string;
  username: string;
  role: UserRole;
}

export interface UnlockTokenPayload {
  scope: "workspace" | "project";
  resourceId: string;
  workspaceId?: string;
  projectId?: string;
  exp: number;
}

export interface UnlockRequestPayload {
  password: string;
}

export interface UnlockResponse {
  token: string;
  scope: "workspace" | "project";
  resourceId: string;
  expiresAt: string;
}

export interface ExecuteRequestPayload {
  workspaceId: string;
  projectId: string;
  requestId?: string;
  method: HttpMethod;
  url: string;
  headers: HeaderRow[];
  params: QueryParamRow[];
  body: RequestBodyConfig;
  auth: RequestAuthConfig;
}

export interface ExecuteResponseCookie {
  name: string;
  value: string;
  raw: string;
}

export interface ExecuteRequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cookies: ExecuteResponseCookie[];
  durationMs: number;
  sizeBytes: number;
  contentType: string;
  contentKind: ContentKind;
  textBody?: string;
  base64Body?: string;
}

export interface WorkspaceTreeResponse {
  tree: WorkspaceTree;
}

export interface ImportPostmanCollectionPayload {
  workspaceId: string;
  collectionJson: string;
  projectName?: string;
}

export interface ImportPostmanCollectionResponse {
  project: ProjectDoc;
  importedFolders: number;
  importedRequests: number;
}

export interface ListWorkspacesResponse {
  workspaces: WorkspaceMeta[];
}

export interface ListUsersResponse {
  users: User[];
}

export interface HistoryResponse {
  history: HistoryDoc[];
}
