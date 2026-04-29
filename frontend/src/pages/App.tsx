import type { HistoryDoc, RequestDoc, User } from "@restify/shared";
import type { ExecuteRequestResult } from "@restify/shared";
import { Activity, CircleUserRound, FileText, Settings2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreateSuperuserPage } from "../components/auth/CreateSuperuserPage";
import { LoginPage } from "../components/auth/LoginPage";
import { AccountSettings } from "../components/account/AccountSettings";
import { UserManagement } from "../components/admin/UserManagement";
import { EnvVarEditor } from "../components/environment/EnvVarEditor";
import { HistoryDetailsDialog } from "../components/history/HistoryDetailsDialog";
import { AppShell } from "../components/layout/AppShell";
import { RequestBuilder } from "../components/request-builder/RequestBuilder";
import { ResponseViewer } from "../components/response-viewer/ResponseViewer";
import { CreateEntityDialog } from "../components/sidebar/CreateEntityDialog";
import { ImportPostmanDialog } from "../components/sidebar/ImportPostmanDialog";
import { WorkspaceTree } from "../components/sidebar/WorkspaceTree";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useRealtimeSync } from "../hooks/use-realtime-sync";
import { api, isApiConflictError } from "../lib/http-client";
import {
  applyTheme,
  getStoredThemeId,
  persistThemeId,
  type ThemeId,
} from "../lib/themes";
import { METHOD_TEXT_STYLES } from "../lib/methods";
import { createEmptyRequest } from "../lib/request-helpers";
import {
  findFolderInProject,
  findFolderInTree,
  findRequestInTree,
  getFirstProjectRequestId,
} from "../lib/workspace-tree";
import type { InspectorTab } from "../types";
import { useActiveRequestStore } from "../store/activeRequest";
import { showErrorToast, showSuccessToast } from "../store/toasts";
import { useAuthStore } from "../store/auth";
import { useEnvironmentStore } from "../store/environment";
import {
  isCurrentHistoryRequestSequence,
  nextHistoryRequestSequence,
  useHistoryStore,
} from "../store/history";
import { useWorkspaceStore } from "../store/workspaces";

const INSPECTOR_TAB_STORAGE_KEY = "httpclient.inspector-tab";
const INSPECTOR_TABS: InspectorTab[] = [
  "environment",
  "history",
  "account",
  "admin",
];

function getStoredInspectorTab(): InspectorTab {
  if (typeof window === "undefined") {
    return "environment";
  }

  try {
    const storedTab = window.localStorage.getItem(INSPECTOR_TAB_STORAGE_KEY);
    if (storedTab && INSPECTOR_TABS.includes(storedTab as InspectorTab)) {
      return storedTab as InspectorTab;
    }
  } catch {
    return "environment";
  }

  return "environment";
}

function reportError(error: unknown) {
  showErrorToast(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function buildResponseFromHistory(
  entry: HistoryDoc,
): ExecuteRequestResult | null {
  const snapshot = entry.responseSnapshot;
  if (!snapshot) {
    return null;
  }

  const response: ExecuteRequestResult = {
    status: entry.status,
    statusText: snapshot.statusText ?? "",
    headers: snapshot.headers ?? {},
    cookies: snapshot.cookies ?? [],
    durationMs: entry.durationMs,
    sizeBytes: entry.sizeBytes,
    contentType: snapshot.contentType,
    contentKind: snapshot.contentKind,
  };

  if (snapshot.textBody !== undefined) {
    response.textBody = snapshot.textBody;
  }

  return response;
}

function getRequestContentRevision(
  request: RequestDoc | null | undefined,
): string | undefined {
  return request?.contentUpdatedAt ?? request?.updatedAt ?? request?.createdAt;
}

type CreateDialogState =
  | { kind: "workspace" }
  | { kind: "project"; workspaceId: string; workspaceName?: string }
  | {
      kind: "folder";
      workspaceId: string;
      projectId: string;
      parentFolderId?: string | null;
      projectName?: string;
      folderName?: string;
    }
  | {
      kind: "request";
      workspaceId: string;
      projectId: string;
      folderId?: string | null;
      projectName?: string;
      folderName?: string;
    }
  | null;

type RenameDialogState =
  | { kind: "workspace"; workspaceId: string; currentName: string }
  | {
      kind: "project";
      workspaceId: string;
      projectId: string;
      currentName: string;
    }
  | {
      kind: "folder";
      workspaceId: string;
      projectId: string;
      folderId: string;
      currentName: string;
    }
  | {
      kind: "request";
      workspaceId: string;
      projectId: string;
      requestId: string;
      currentName: string;
    }
  | null;

type ImportDialogState =
  | { workspaceId: string; workspaceName?: string }
  | null;

export default function App() {
  const {
    user,
    needsSuperuser,
    requiresSetupSecret,
    historyLimit,
    isInitializing,
    initialize,
    login,
    createSuperuser,
    logout,
    setUser,
  } = useAuthStore();
  const {
    workspaces,
    trees,
    activeWorkspaceId,
    activeProjectId,
    activeRequestId,
    loadWorkspaces,
    loadWorkspaceTree,
    selectWorkspace,
    selectProject,
    selectRequest,
  } = useWorkspaceStore();
  const {
    draft,
    draftBaseContentUpdatedAt,
    isDraftDirty,
    response,
    responseRequestId,
    isSending,
    activeTab,
    setDraft,
    setResponse,
    setSending,
    setActiveTab,
  } = useActiveRequestStore();
  const { envVars, setEnvVars, getEnvVars } = useEnvironmentStore();
  const { historyByProject, setHistory, setHistoryLimit } = useHistoryStore();

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(
    getStoredInspectorTab,
  );
  const [users, setUsers] = useState<User[]>([]);
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(null);
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>(null);
  const [importDialog, setImportDialog] = useState<ImportDialogState>(null);
  const [historyDetailsEntry, setHistoryDetailsEntry] = useState<HistoryDoc | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>(getStoredThemeId);
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId | null>(null);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  useRealtimeSync(Boolean(user));

  const canCreateWorkspace = user?.role !== "member";
  const canCreateProject = user?.role !== "member";
  const canManagePrivacy = user?.role !== "member";
  const normalizedInspectorTab =
    user?.role === "superadmin" || inspectorTab !== "admin"
      ? inspectorTab
      : "environment";
  const activeThemeId = previewThemeId ?? selectedThemeId;
  useEffect(() => {
    applyTheme(activeThemeId);
  }, [activeThemeId]);

  useEffect(() => {
    persistThemeId(selectedThemeId);
  }, [selectedThemeId]);

  useEffect(() => {
    if (!user) {
      setPreviewThemeId(null);
    }
  }, [user]);

  useEffect(() => {
    if (normalizedInspectorTab !== inspectorTab) {
      setInspectorTab(normalizedInspectorTab);
    }
  }, [inspectorTab, normalizedInspectorTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        INSPECTOR_TAB_STORAGE_KEY,
        normalizedInspectorTab,
      );
    } catch {
      return;
    }
  }, [normalizedInspectorTab]);

  useEffect(() => {
    return () => {
      sendAbortControllerRef.current?.abort();
    };
  }, []);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace._id === activeWorkspaceId),
    [workspaces, activeWorkspaceId],
  );
  const activeTree = activeWorkspaceId ? trees[activeWorkspaceId] : undefined;
  const activeProject = useMemo(
    () =>
      activeTree?.projects.find((project) => project._id === activeProjectId),
    [activeTree, activeProjectId],
  );
  const activeRequest = useMemo<RequestDoc | undefined>(() => {
    if (!activeProject || !activeRequestId) {
      return undefined;
    }

    return findRequestInTree(activeTree, activeRequestId)?.request;
  }, [activeProject, activeRequestId, activeTree]);
  const activeHistory = activeProject
    ? historyByProject[activeProject._id] ?? []
    : [];
  const latestActiveRequestResponse = useMemo(() => {
    if (!activeRequestId) {
      return null;
    }

    const latestEntry = activeHistory.find(
      (entry) => entry.requestId === activeRequestId && entry.responseSnapshot,
    );
    return latestEntry ? buildResponseFromHistory(latestEntry) : null;
  }, [activeHistory, activeRequestId]);
  const visibleResponse =
    activeRequestId && responseRequestId === activeRequestId ? response : null;
  const activeProjectEnvVars = activeProject
    ? getEnvVars(activeProject._id)
    : [];

  const findProjectInTree = (workspaceId: string, projectId: string) =>
    trees[workspaceId]?.projects.find((project) => project._id === projectId);

  const findFolderTarget = (workspaceId: string, folderId: string) =>
    findFolderInTree(trees[workspaceId], folderId);

  const findRequestTarget = (workspaceId: string, requestId: string) =>
    findRequestInTree(trees[workspaceId], requestId);

  useEffect(() => {
    initialize().catch(reportError);
  }, [initialize]);

  useEffect(() => {
    setHistoryLimit(historyLimit);
  }, [historyLimit, setHistoryLimit]);

  useEffect(() => {
    if (!user) {
      setDraft(null, { dirty: false });
      setResponse(null);
      return;
    }

    loadWorkspaces().catch(reportError);
  }, [user, loadWorkspaces, setDraft, setResponse]);

  useEffect(() => {
    if (!user || !activeWorkspaceId) {
      return;
    }

    if (trees[activeWorkspaceId]) {
      return;
    }

    loadWorkspaceTree(activeWorkspaceId).catch(() => undefined);
  }, [user, activeWorkspaceId, trees, loadWorkspaceTree]);

  useEffect(() => {
    if (!activeProject) {
      return;
    }

    setEnvVars(activeProject._id, activeProject.envVars);
    const historyRequestSequence = nextHistoryRequestSequence(activeProject._id);
    api
      .getProjectHistory(activeProject._id, activeProject.workspaceId)
      .then(({ history }) => {
        if (
          isCurrentHistoryRequestSequence(
            activeProject._id,
            historyRequestSequence,
          )
        ) {
          setHistory(activeProject._id, history);
        }
      })
      .catch(() => undefined);
  }, [activeProject, setEnvVars, setHistory]);

  useEffect(() => {
    if (!activeRequestId) {
      setResponse(null);
      return;
    }

    if (responseRequestId === activeRequestId && response) {
      return;
    }

    setResponse(latestActiveRequestResponse, activeRequestId);
  }, [
    activeRequestId,
    latestActiveRequestResponse,
    response,
    responseRequestId,
    setResponse,
  ]);

  useEffect(() => {
    if (!activeRequest) {
      setDraft(null, { dirty: false });
      return;
    }

    if (isDraftDirty && draft?._id === activeRequest._id) {
      return;
    }

    setDraft(structuredClone(activeRequest), {
      dirty: false,
      baseContentUpdatedAt: getRequestContentRevision(activeRequest),
    });
  }, [activeRequest, draft?._id, isDraftDirty, setDraft]);

  useEffect(() => {
    if (user?.role !== "superadmin") {
      return;
    }

    api
      .listUsers()
      .then(({ users: listedUsers }) => setUsers(listedUsers))
      .catch(() => undefined);
  }, [user]);

  const refreshWorkspaces = async () => {
    await loadWorkspaces();
    if (activeWorkspaceId) {
      await loadWorkspaceTree(activeWorkspaceId).catch(() => undefined);
    }
  };

  const refreshTree = async (workspaceId = activeWorkspaceId) => {
    if (!workspaceId) {
      return;
    }
    await loadWorkspaceTree(workspaceId);
  };

  const handleSelectWorkspace = async (workspaceId: string) => {
    selectWorkspace(workspaceId);
    try {
      await loadWorkspaceTree(workspaceId);
    } catch {
      return;
    }
  };

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
    const project = activeTree?.projects.find((item) => item._id === projectId);
    selectRequest(getFirstProjectRequestId(project));
  };

  const handleSelectRequest = (requestId: string) => {
    if (activeWorkspaceId) {
      const match = findRequestTarget(activeWorkspaceId, requestId);
      if (match && match.project._id !== activeProjectId) {
        selectProject(match.project._id);
      }
    }

    selectRequest(requestId);
  };

  const openCreateWorkspaceDialog = () => {
    if (!canCreateWorkspace) {
      reportError(new Error("Members cannot create workspaces."));
      return;
    }

    setRenameDialog(null);
    setCreateDialog({ kind: "workspace" });
  };

  const openCreateProjectDialog = (workspaceId?: string) => {
    if (!canCreateProject) {
      reportError(new Error("Members cannot create projects."));
      return;
    }

    const targetWorkspace = workspaceId
      ? workspaces.find((workspace) => workspace._id === workspaceId)
      : activeWorkspace;
    if (!targetWorkspace) {
      reportError(new Error("Select a workspace before creating a project."));
      return;
    }

    setRenameDialog(null);
    setCreateDialog({
      kind: "project",
      workspaceId: targetWorkspace._id,
      workspaceName: targetWorkspace.name,
    });
  };

  const openCreateFolderDialog = (
    projectId: string,
    parentFolderId?: string | null,
  ) => {
    if (!activeWorkspace || !activeTree) {
      reportError(new Error("Open a workspace before creating a folder."));
      return;
    }

    const project = activeTree.projects.find((item) => item._id === projectId);
    if (!project) {
      reportError(new Error("Project not found."));
      return;
    }

    const parentFolder = parentFolderId
      ? findFolderInProject(project, parentFolderId)
      : undefined;
    if (parentFolderId && !parentFolder) {
      reportError(new Error("Folder not found."));
      return;
    }

    setRenameDialog(null);
    setCreateDialog({
      kind: "folder",
      workspaceId: activeWorkspace._id,
      projectId,
      parentFolderId: parentFolderId ?? null,
      projectName: project.name,
      folderName: parentFolder?.name,
    });
  };

  const openCreateRequestDialog = (
    projectId: string,
    folderId?: string | null,
  ) => {
    if (!activeWorkspace || !activeTree) {
      reportError(new Error("Open a workspace before creating a request."));
      return;
    }

    const project = activeTree.projects.find((item) => item._id === projectId);
    if (!project) {
      reportError(new Error("Project not found."));
      return;
    }

    const folder = folderId
      ? findFolderInProject(project, folderId)
      : undefined;
    if (folderId && !folder) {
      reportError(new Error("Folder not found."));
      return;
    }

    setRenameDialog(null);
    setCreateDialog({
      kind: "request",
      workspaceId: activeWorkspace._id,
      projectId,
      folderId: folderId ?? null,
      projectName: project.name,
      folderName: folder?.name,
    });
  };

  const openImportPostmanDialog = (workspaceId: string) => {
    if (!canCreateProject) {
      reportError(new Error("Members cannot import projects."));
      return;
    }

    const workspace = workspaces.find((item) => item._id === workspaceId);
    if (!workspace) {
      reportError(new Error("Workspace not found."));
      return;
    }

    setCreateDialog(null);
    setRenameDialog(null);
    setImportDialog({
      workspaceId,
      workspaceName: workspace.name,
    });
  };
  const openRenameWorkspaceDialog = (workspaceId: string) => {
    const workspace = workspaces.find((item) => item._id === workspaceId);
    if (!workspace) {
      reportError(new Error("Workspace not found."));
      return;
    }

    setCreateDialog(null);
    setRenameDialog({
      kind: "workspace",
      workspaceId,
      currentName: workspace.name,
    });
  };

  const openRenameProjectDialog = (projectId: string) => {
    if (!activeWorkspace) {
      reportError(new Error("Open a workspace before renaming a project."));
      return;
    }

    const project = findProjectInTree(activeWorkspace._id, projectId);
    if (!project) {
      reportError(new Error("Project not found."));
      return;
    }

    setCreateDialog(null);
    setRenameDialog({
      kind: "project",
      workspaceId: activeWorkspace._id,
      projectId,
      currentName: project.name,
    });
  };

  const openRenameFolderDialog = (folderId: string) => {
    if (!activeWorkspace) {
      reportError(new Error("Open a workspace before renaming a folder."));
      return;
    }

    const target = findFolderTarget(activeWorkspace._id, folderId);
    if (!target) {
      reportError(new Error("Folder not found."));
      return;
    }

    setCreateDialog(null);
    setRenameDialog({
      kind: "folder",
      workspaceId: activeWorkspace._id,
      projectId: target.project._id,
      folderId,
      currentName: target.folder.name,
    });
  };

  const openRenameRequestDialog = (requestId: string) => {
    if (!activeWorkspace) {
      reportError(new Error("Open a workspace before renaming a request."));
      return;
    }

    const target = findRequestTarget(activeWorkspace._id, requestId);
    if (!target) {
      reportError(new Error("Request not found."));
      return;
    }

    setCreateDialog(null);
    setRenameDialog({
      kind: "request",
      workspaceId: activeWorkspace._id,
      projectId: target.project._id,
      requestId,
      currentName: target.request.name,
    });
  };

  const handleCreateEntity = async (name: string) => {
    if (!createDialog) {
      return;
    }

    if (createDialog.kind === "workspace") {
      if (!canCreateWorkspace) {
        throw new Error("Members cannot create workspaces.");
      }

      const { workspace } = await api.createWorkspace(name);
      await loadWorkspaces();
      selectWorkspace(workspace._id);
      await loadWorkspaceTree(workspace._id);
      return;
    }

    if (createDialog.kind === "project") {
      if (!canCreateProject) {
        throw new Error("Members cannot create projects.");
      }

      const { project } = await api.createProject(
        createDialog.workspaceId,
        name,
      );
      selectWorkspace(createDialog.workspaceId);
      selectProject(project._id);
      selectRequest(undefined);
      await loadWorkspaceTree(createDialog.workspaceId);
      return;
    }

    if (createDialog.kind === "folder") {
      await api.createFolder(
        createDialog.workspaceId,
        createDialog.projectId,
        name,
        createDialog.parentFolderId,
      );
      selectWorkspace(createDialog.workspaceId);
      selectProject(createDialog.projectId);
      await loadWorkspaceTree(createDialog.workspaceId);
      return;
    }

    await createRequest(
      createDialog.workspaceId,
      createDialog.projectId,
      name,
      createDialog.folderId,
    );
  };

  const handleRenameEntity = async (name: string) => {
    if (!renameDialog) {
      return;
    }

    if (renameDialog.kind === "workspace") {
      const workspace = workspaces.find(
        (item) => item._id === renameDialog.workspaceId,
      );
      await api.renameWorkspace(
        renameDialog.workspaceId,
        name,
        workspace?.updatedAt ?? workspace?.createdAt,
      );
      await refreshWorkspaces();
      showSuccessToast(`Saved workspace name as ${name}.`, "Workspace Saved");
      return;
    }

    if (renameDialog.kind === "project") {
      const project = findProjectInTree(
        renameDialog.workspaceId,
        renameDialog.projectId,
      );
      if (!project) {
        throw new Error("Project not found.");
      }

      await api.updateProject(
        renameDialog.projectId,
        renameDialog.workspaceId,
        { name, expectedUpdatedAt: project.updatedAt ?? project.createdAt },
      );
      await refreshTree(renameDialog.workspaceId);
      showSuccessToast(`Saved project name as ${name}.`, "Project Saved");
      return;
    }

    if (renameDialog.kind === "folder") {
      const project = findProjectInTree(
        renameDialog.workspaceId,
        renameDialog.projectId,
      );
      if (!project) {
        throw new Error("Project not found.");
      }

      await api.updateFolder(
        renameDialog.folderId,
        renameDialog.workspaceId,
        {
          name,
          expectedUpdatedAt:
            findFolderTarget(renameDialog.workspaceId, renameDialog.folderId)
              ?.folder.updatedAt ??
            findFolderTarget(renameDialog.workspaceId, renameDialog.folderId)
              ?.folder.createdAt,
        },
      );
      await refreshTree(renameDialog.workspaceId);
      showSuccessToast(`Saved folder name as ${name}.`, "Folder Saved");
      return;
    }

    const project = findProjectInTree(
      renameDialog.workspaceId,
      renameDialog.projectId,
    );
    if (!project) {
      throw new Error("Project not found.");
    }

    const target = findRequestTarget(
      renameDialog.workspaceId,
      renameDialog.requestId,
    );
    await api.updateRequest(renameDialog.requestId, {
      workspaceId: renameDialog.workspaceId,
      name,
      expectedContentUpdatedAt: getRequestContentRevision(target?.request),
    });
    await refreshTree(renameDialog.workspaceId);
    showSuccessToast(`Saved request name as ${name}.`, "Request Saved");
  };

  const handleToggleProjectPrivacy = async (
    workspaceId: string,
    projectId: string,
    isPrivate: boolean,
  ) => {
    const project = findProjectInTree(workspaceId, projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    await api.updateProject(projectId, workspaceId, {
      isPrivate,
      expectedUpdatedAt: project.updatedAt ?? project.createdAt,
    });
    await refreshTree(workspaceId);
    showSuccessToast(
      isPrivate
        ? `${project.name} is now private.`
        : `${project.name} is now visible to members.`,
      "Project Visibility",
    );
  };
  const handleToggleFolderPrivacy = async (
    workspaceId: string,
    folderId: string,
    isPrivate: boolean,
  ) => {
    const target = findFolderTarget(workspaceId, folderId);
    if (!target) {
      throw new Error("Folder not found.");
    }

    await api.updateFolder(folderId, workspaceId, {
      isPrivate,
      expectedUpdatedAt: target.folder.updatedAt ?? target.folder.createdAt,
    });
    await refreshTree(workspaceId);
    showSuccessToast(
      isPrivate
        ? `${target.folder.name} is now private.`
        : `${target.folder.name} is now visible to members.`,
      "Folder Visibility",
    );
  };
  const handleToggleRequestPrivacy = async (
    workspaceId: string,
    requestId: string,
    isPrivate: boolean,
  ) => {
    const target = findRequestTarget(workspaceId, requestId);
    if (!target) {
      throw new Error("Request not found.");
    }

    await api.updateRequest(requestId, {
      workspaceId,
      isPrivate,
      expectedContentUpdatedAt: getRequestContentRevision(target.request),
    });
    await refreshTree(workspaceId);
    showSuccessToast(
      isPrivate
        ? `${target.request.name} is now private.`
        : `${target.request.name} is now visible to members.`,
      "Request Visibility",
    );
  };
  const createRequest = async (
    workspaceId: string,
    projectId: string,
    name: string,
    folderId?: string | null,
  ) => {
    const workspaceTree = trees[workspaceId];
    if (!workspaceTree) {
      return;
    }

    const project = workspaceTree.projects.find((item) => item._id === projectId);
    if (!project) {
      return;
    }

    const requestDraft = createEmptyRequest(project, folderId);
    const targetFolder = folderId ? findFolderInProject(project, folderId) : undefined;
    const { request } = await api.createRequest({
      workspaceId: requestDraft.workspaceId,
      projectId: requestDraft.projectId,
      folderId: requestDraft.folderId,
      name,
      method: requestDraft.method,
      url: requestDraft.url,
      headers: requestDraft.headers,
      params: requestDraft.params,
      body: requestDraft.body,
      auth: requestDraft.auth,
      isPrivate: requestDraft.isPrivate,
      order: targetFolder ? targetFolder.requests.length : project.requests.length,
    });

    selectWorkspace(workspaceId);
    await refreshTree(workspaceId);
    selectProject(projectId);
    selectRequest(request._id);
  };

  const handleMoveRequest = async ({
    requestId,
    workspaceId,
    targetProjectId,
    targetFolderId,
    targetOrder,
  }: {
    requestId: string;
    workspaceId: string;
    targetProjectId: string;
    targetFolderId?: string | null;
    targetOrder: number;
  }) => {
    const { request } = await api.moveRequest(requestId, {
      workspaceId,
      targetProjectId,
      targetFolderId,
      targetOrder,
    });

    selectWorkspace(workspaceId);
    await refreshTree(workspaceId);
    selectProject(targetProjectId);
    selectRequest(request._id);
  };

  const handleMoveProject = async ({
    projectId,
    sourceWorkspaceId,
    targetWorkspaceId,
    targetOrder,
  }: {
    projectId: string;
    sourceWorkspaceId: string;
    targetWorkspaceId: string;
    targetOrder?: number;
  }) => {
    const { project } = await api.moveProject(projectId, {
      sourceWorkspaceId,
      targetWorkspaceId,
      targetOrder,
    });

    await loadWorkspaces();
    selectWorkspace(targetWorkspaceId);
    await loadWorkspaceTree(targetWorkspaceId);

    const movedProject = useWorkspaceStore
      .getState()
      .trees[targetWorkspaceId]?.projects.find((item) => item._id === project._id);

    selectProject(project._id);
    selectRequest(getFirstProjectRequestId(movedProject));
  };

  const handleMoveFolder = async ({
    folderId,
    workspaceId,
    targetProjectId,
    targetParentFolderId,
    targetOrder,
  }: {
    folderId: string;
    workspaceId: string;
    targetProjectId: string;
    targetParentFolderId?: string | null;
    targetOrder: number;
  }) => {
    const preservedRequestId = activeRequestId;
    const { folder } = await api.moveFolder(folderId, {
      workspaceId,
      targetProjectId,
      targetParentFolderId,
      targetOrder,
    });

    selectWorkspace(workspaceId);
    await refreshTree(workspaceId);

    const targetProject = useWorkspaceStore
      .getState()
      .trees[workspaceId]?.projects.find((item) => item._id === targetProjectId);
    const movedFolder = targetProject
      ? findFolderInProject(targetProject, folder._id)
      : undefined;
    const nextRequestId =
      movedFolder?.requests.find((item) => item._id === preservedRequestId)?._id ??
      movedFolder?.requests[0]?._id ??
      getFirstProjectRequestId(targetProject);

    selectProject(targetProjectId);
    selectRequest(nextRequestId);
  };

  const handleImportPostman = async ({
    collectionJson,
    projectName,
  }: {
    collectionJson: string;
    projectName?: string;
  }) => {
    if (!importDialog) {
      return;
    }

    const { project, importedFolders, importedRequests } =
      await api.importPostmanCollection({
        workspaceId: importDialog.workspaceId,
        collectionJson,
        projectName,
      });

    selectWorkspace(importDialog.workspaceId);
    await loadWorkspaceTree(importDialog.workspaceId);

    const importedProject = useWorkspaceStore
      .getState()
      .trees[importDialog.workspaceId]?.projects.find(
        (item) => item._id === project._id,
      );

    selectProject(project._id);
    selectRequest(getFirstProjectRequestId(importedProject));

    const folderLabel =
      importedFolders === 1 ? "1 folder" : `${importedFolders} folders`;
    const requestLabel =
      importedRequests === 1 ? "1 request" : `${importedRequests} requests`;
    showSuccessToast(
      importedFolders > 0
        ? `Imported ${project.name} with ${requestLabel} and ${folderLabel}.`
        : `Imported ${project.name} with ${requestLabel}.`,
      "Postman Imported",
    );
  };
  const saveRequest = async () => {
    if (!draft) {
      return;
    }
    try {
      const { request } = await api.updateRequest(draft._id, {
        ...draft,
        workspaceId: draft.workspaceId,
        expectedContentUpdatedAt:
          draftBaseContentUpdatedAt ??
          getRequestContentRevision(activeRequest) ??
          getRequestContentRevision(draft),
      });
      setDraft(structuredClone(request), {
        dirty: false,
        baseContentUpdatedAt: getRequestContentRevision(request),
      });
      await refreshTree(draft.workspaceId);
      showSuccessToast(`Saved ${draft.name}.`, "Request Saved");
    } catch (error) {
      if (isApiConflictError(error)) {
        await refreshTree(draft.workspaceId).catch(() => undefined);
        showErrorToast(error, {
          title: "Request Changed Elsewhere",
          fallbackMessage:
            "This request changed in another tab or browser. Review the latest version before saving again.",
        });
        return;
      }

      throw error;
    }
  };

  const sendRequest = async (payload: Parameters<typeof api.execute>[0]) => {
    if (isSending) {
      return;
    }

    const abortController = new AbortController();
    sendAbortControllerRef.current = abortController;
    setSending(true);
    try {
      const result = await api.execute(payload, abortController.signal);
      setResponse(result, payload.requestId);
      if (activeProject) {
        const historyRequestSequence = nextHistoryRequestSequence(activeProject._id);
        const { history } = await api.getProjectHistory(
          activeProject._id,
          activeProject.workspaceId,
        );
        if (
          isCurrentHistoryRequestSequence(
            activeProject._id,
            historyRequestSequence,
          )
        ) {
          setHistory(activeProject._id, history);
        }
      }
    } catch (error) {
      if (!isAbortError(error)) {
        reportError(error);
      }
    } finally {
      if (sendAbortControllerRef.current === abortController) {
        sendAbortControllerRef.current = null;
      }
      setSending(false);
    }
  };

  const cancelRequest = () => {
    sendAbortControllerRef.current?.abort();
  };

  const updateEnvironment = async () => {
    if (!activeProject || !activeWorkspace) {
      return;
    }
    await api.updateProject(activeProject._id, activeWorkspace._id, {
      envVars: envVars[activeProject._id] ?? [],
      expectedUpdatedAt: activeProject.updatedAt ?? activeProject.createdAt,
    });
    await refreshTree(activeWorkspace._id);
    showSuccessToast(
      `Saved environment variables for ${activeProject.name}.`,
      "Environment Saved",
    );
  };

  const refreshUsers = async () => {
    if (user?.role !== "superadmin") {
      return;
    }
    const response = await api.listUsers();
    setUsers(response.users);
  };

  const handleUpdateProfile = async (payload: { name: string }) => {
    const response = await api.updateMyProfile(payload);
    setUser(response.user);
  };

  const handleChangeMyPassword = async (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    await api.changeMyPassword(payload);
  };

  const deleteEntity = async (label: string, action: () => Promise<void>) => {
    if (!window.confirm(`Delete ${label}?`)) {
      return;
    }
    await action();
  };

  const createDialogConfig = useMemo(() => {
    if (!createDialog) {
      return null;
    }

    if (
      (createDialog.kind === "workspace" && !canCreateWorkspace) ||
      (createDialog.kind === "project" && !canCreateProject)
    ) {
      return null;
    }

    if (createDialog.kind === "workspace") {
      return {
        title: "Create Workspace",
        description:
          "Add a new workspace to organize projects, folders, and requests.",
        label: "Workspace",
        placeholder: "Workspace name",
        submitLabel: "Create Workspace",
      };
    }

    if (createDialog.kind === "project") {
      return {
        title: "Create Project",
        description: createDialog.workspaceName
          ? `Create a project inside ${createDialog.workspaceName}.`
          : "Create a project inside the selected workspace.",
        label: "Project",
        placeholder: "Project name",
        submitLabel: "Create Project",
      };
    }

    if (createDialog.kind === "folder") {
      return {
        title: "Create Folder",
        description: createDialog.folderName
          ? `Create a nested folder inside ${createDialog.folderName}.`
          : createDialog.projectName
            ? `Group requests inside ${createDialog.projectName}.`
            : "Create a folder inside the selected project.",
        label: "Folder",
        placeholder: "Folder name",
        submitLabel: "Create Folder",
      };
    }

    return {
      title: "Create Request",
      description: createDialog.folderName
        ? `Create a request inside ${createDialog.folderName}.`
        : createDialog.projectName
          ? `Create a request inside ${createDialog.projectName}.`
          : "Create a request inside the selected project.",
      label: "Request",
      placeholder: "Request name",
      submitLabel: "Create Request",
    };
  }, [canCreateProject, canCreateWorkspace, createDialog]);

  const renameDialogConfig = useMemo(() => {
    if (!renameDialog) {
      return null;
    }

    if (renameDialog.kind === "workspace") {
      return {
        title: "Rename Workspace",
        description: "Update the workspace name shown in the sidebar.",
        label: "Workspace",
        placeholder: "Workspace name",
        submitLabel: "Save Name",
      };
    }

    if (renameDialog.kind === "project") {
      return {
        title: "Rename Project",
        description: "Update the project name shown in the sidebar.",
        label: "Project",
        placeholder: "Project name",
        submitLabel: "Save Name",
      };
    }

    if (renameDialog.kind === "folder") {
      return {
        title: "Rename Folder",
        description: "Update the folder name shown in the sidebar.",
        label: "Folder",
        placeholder: "Folder name",
        submitLabel: "Save Name",
      };
    }

    return {
      title: "Rename Request",
      description: "Update the request name shown in the sidebar.",
      label: "Request",
      placeholder: "Request name",
      submitLabel: "Save Name",
    };
  }, [renameDialog]);

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Starting HttpClient...
      </div>
    );
  }

  if (needsSuperuser && !user) {
    return (
      <CreateSuperuserPage
        requiresSetupSecret={requiresSetupSecret}
        onSubmit={createSuperuser}
      />
    );
  }

  if (!user) {
    return <LoginPage onSubmit={login} />;
  }

  const currentUser = user;

  function InspectorPanel() {
    return (
      <Tabs
        value={normalizedInspectorTab}
        onValueChange={(value) => setInspectorTab(value as InspectorTab)}
      >
        <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger
            value="environment"
            className="inline-flex h-9 w-9 items-center justify-center p-0 shadow-none"
            aria-label="Environment"
            title="Environment"
          >
            <Settings2 className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="inline-flex h-9 w-9 items-center justify-center p-0 shadow-none"
            aria-label="History"
            title="History"
          >
            <Activity className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="inline-flex h-9 w-9 items-center justify-center p-0 shadow-none"
            aria-label="Account"
            title="Account"
          >
            <CircleUserRound className="h-4 w-4" />
          </TabsTrigger>
          {currentUser.role === "superadmin" ? (
            <TabsTrigger
              value="admin"
              className="inline-flex h-9 w-9 items-center justify-center p-0 shadow-none"
              aria-label="Admin"
              title="Admin"
            >
              <Users className="h-4 w-4" />
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="environment">
          <EnvVarEditor
            projectName={activeProject?.name}
            envVars={activeProjectEnvVars}
            onChange={(rows) =>
              activeProject && setEnvVars(activeProject._id, rows)
            }
            onSave={() => updateEnvironment().catch(reportError)}
          />
        </TabsContent>
        <TabsContent value="history">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Request History</CardTitle>
              <p className="text-xs text-muted">
                Keeping the latest {historyLimit} project executions.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeHistory.length === 0 ? (
                <p className="text-sm text-muted">
                  The latest project executions will appear here.
                </p>
              ) : null}
              {activeHistory.map((entry: HistoryDoc) => (
                <div
                  key={entry._id}
                  className="rounded-2xl border border-border/45 bg-[rgb(var(--surface-2)/0.48)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 text-sm">
                        <span className={`font-medium ${METHOD_TEXT_STYLES[entry.method]}`}>
                          {entry.method}
                        </span>
                        <span className="text-muted">{entry.status}</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted">
                        {entry.url}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      className="h-8 shrink-0 rounded-lg px-2 text-xs text-foreground"
                      onClick={() => setHistoryDetailsEntry(entry)}
                      title="Show history details"
                      aria-label="Show history details"
                    >
                      <FileText className="h-4 w-4" />
                      Details
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    <span>{entry.durationMs} ms</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="account">
          <AccountSettings
            user={currentUser}
            onUpdateProfile={handleUpdateProfile}
            onChangePassword={handleChangeMyPassword}
          />
        </TabsContent>
        {currentUser.role === "superadmin" ? (
          <TabsContent value="admin">
            <UserManagement
              users={users}
              workspaces={workspaces}
              onCreate={(payload) => api.createUser(payload).then(refreshUsers)}
              onUpdate={(userId, payload) =>
                api.updateUser(userId, payload).then(refreshUsers)
              }
              onChangePassword={(userId, payload) =>
                api.changeUserPassword(userId, payload).then(refreshUsers)
              }
              onDelete={(userId) =>
                deleteEntity("user", () =>
                  api.deleteUser(userId).then(refreshUsers),
                )
              }
            />
          </TabsContent>
        ) : null}
      </Tabs>
    );
  }

  return (
    <>
      <AppShell
        user={currentUser}
        activeWorkspaceName={activeWorkspace?.name}
        activeProjectName={activeProject?.name}
        activeRequestName={activeRequest?.name}
        themeId={selectedThemeId}
        onThemeChange={setSelectedThemeId}
        onThemePreview={setPreviewThemeId}
        onThemePreviewEnd={() => setPreviewThemeId(null)}
        onLogout={logout}
        sidebar={
          <WorkspaceTree
            workspaces={workspaces}
            workspaceTrees={trees}
            tree={activeTree}
            activeWorkspaceId={activeWorkspaceId}
            activeProjectId={activeProjectId}
            activeRequestId={activeRequestId}
            onSelectWorkspace={(workspaceId) =>
              handleSelectWorkspace(workspaceId).catch(reportError)
            }
            onSelectProject={handleSelectProject}
            onSelectRequest={handleSelectRequest}
            canCreateWorkspace={canCreateWorkspace}
            canCreateProject={canCreateProject}
            canManagePrivacy={canManagePrivacy}
            onCreateWorkspace={openCreateWorkspaceDialog}
            onCreateProject={openCreateProjectDialog}
            onImportPostman={openImportPostmanDialog}
            onCreateFolder={openCreateFolderDialog}
            onCreateRequest={openCreateRequestDialog}
            onRenameWorkspace={openRenameWorkspaceDialog}
            onRenameProject={openRenameProjectDialog}
            onRenameFolder={openRenameFolderDialog}
            onRenameRequest={openRenameRequestDialog}
            onDuplicateWorkspace={(workspaceId) =>
              api.duplicateWorkspace(workspaceId).then(refreshWorkspaces).catch(reportError)
            }
            onDeleteWorkspace={(workspaceId) =>
              deleteEntity("workspace", () =>
                api.deleteWorkspace(workspaceId).then(refreshWorkspaces),
              ).catch(reportError)
            }
            onDuplicateProject={(projectId) =>
              activeWorkspace &&
              api
                .duplicateProject(projectId, activeWorkspace._id)
                .then(() => refreshTree(activeWorkspace._id))
                .catch(reportError)
            }
            onDeleteProject={(projectId) =>
              activeWorkspace &&
              deleteEntity("project", () =>
                api.deleteProject(projectId, activeWorkspace._id).then(() =>
                  refreshTree(activeWorkspace._id),
                ),
              ).catch(reportError)
            }
            onDuplicateFolder={(folderId) =>
              activeWorkspace &&
              api
                .duplicateFolder(folderId, activeWorkspace._id)
                .then(() => refreshTree(activeWorkspace._id))
                .catch(reportError)
            }
            onDeleteFolder={(folderId) =>
              activeWorkspace &&
              deleteEntity("folder", () =>
                api.deleteFolder(folderId, activeWorkspace._id).then(() =>
                  refreshTree(activeWorkspace._id),
                ),
              ).catch(reportError)
            }
            onDuplicateRequest={(requestId) =>
              activeWorkspace &&
              api
                .duplicateRequest(requestId, activeWorkspace._id)
                .then(() => refreshTree(activeWorkspace._id))
                .catch(reportError)
            }
            onDeleteRequest={(requestId) =>
              activeWorkspace &&
              deleteEntity("request", () =>
                api.deleteRequest(requestId, activeWorkspace._id).then(() =>
                  refreshTree(activeWorkspace._id),
                ),
              ).catch(reportError)
            }
            onToggleProjectPrivacy={(workspaceId, projectId, isPrivate) =>
              handleToggleProjectPrivacy(workspaceId, projectId, isPrivate).catch(reportError)
            }
            onToggleFolderPrivacy={(workspaceId, folderId, isPrivate) =>
              handleToggleFolderPrivacy(workspaceId, folderId, isPrivate).catch(reportError)
            }
            onToggleRequestPrivacy={(workspaceId, requestId, isPrivate) =>
              handleToggleRequestPrivacy(workspaceId, requestId, isPrivate).catch(reportError)
            }
            onWorkspaceReorder={(orderedIds) =>
              api.reorderWorkspaces(orderedIds).then(refreshWorkspaces).catch(reportError)
            }
            onProjectReorder={(orderedIds) =>
              activeWorkspace &&
              api
                .reorderProjects(activeWorkspace._id, orderedIds)
                .then(() => refreshTree(activeWorkspace._id))
                .catch(reportError)
            }
            onFolderReorder={(projectId, orderedIds) =>
              activeWorkspace &&
              api
                .reorderFolders(activeWorkspace._id, projectId, orderedIds)
                .then(() => refreshTree(activeWorkspace._id))
                .catch(reportError)
            }
            onMoveProject={(payload) =>
              handleMoveProject(payload).catch(reportError)
            }
            onMoveFolder={(payload) =>
              handleMoveFolder(payload).catch(reportError)
            }
            onMoveRequest={(payload) =>
              handleMoveRequest(payload).catch(reportError)
            }
            onEnsureWorkspaceTree={(workspaceId) => {
              if (useWorkspaceStore.getState().trees[workspaceId]) {
                return Promise.resolve();
              }

              return api.getWorkspaceTree(workspaceId).then(({ tree }) => {
                useWorkspaceStore.getState().setTree(workspaceId, tree);
              });
            }}
          />
        }
        builder={
          <RequestBuilder
            draft={draft}
            envVars={activeProjectEnvVars}
            activeTab={activeTab}
            isSending={isSending}
            onDraftChange={setDraft}
            onActiveTabChange={setActiveTab}
            onSave={() => saveRequest().catch(reportError)}
            onCancel={cancelRequest}
            onSend={(payload) => sendRequest(payload).catch(reportError)}
          />
        }
        response={<ResponseViewer response={visibleResponse} />}
        inspector={<InspectorPanel />}
      />
      {createDialogConfig ? (
        <CreateEntityDialog
          open={Boolean(createDialog)}
          title={createDialogConfig.title}
          description={createDialogConfig.description}
          label={createDialogConfig.label}
          placeholder={createDialogConfig.placeholder}
          submitLabel={createDialogConfig.submitLabel}
          onOpenChange={(open) => !open && setCreateDialog(null)}
          onSubmit={handleCreateEntity}
        />
      ) : null}
      {renameDialogConfig ? (
        <CreateEntityDialog
          open={Boolean(renameDialog)}
          title={renameDialogConfig.title}
          description={renameDialogConfig.description}
          label={renameDialogConfig.label}
          placeholder={renameDialogConfig.placeholder}
          submitLabel={renameDialogConfig.submitLabel}
          initialValue={renameDialog?.currentName}
          actionVerb="rename"
          onOpenChange={(open) => !open && setRenameDialog(null)}
          onSubmit={handleRenameEntity}
        />
      ) : null}
      <ImportPostmanDialog
        open={Boolean(importDialog)}
        workspaceName={importDialog?.workspaceName}
        onOpenChange={(open) => !open && setImportDialog(null)}
        onSubmit={handleImportPostman}
      />
      <HistoryDetailsDialog
        entry={historyDetailsEntry}
        open={Boolean(historyDetailsEntry)}
        onOpenChange={(open) => !open && setHistoryDetailsEntry(null)}
      />
    </>
  );
}
























