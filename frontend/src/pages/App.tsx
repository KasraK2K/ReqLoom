import type { HistoryDoc, RequestDoc, User } from "@restify/shared";
import { Activity, FileText, Settings2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateSuperuserPage } from "../components/auth/CreateSuperuserPage";
import { LoginPage } from "../components/auth/LoginPage";
import { UserManagement } from "../components/admin/UserManagement";
import { EnvVarEditor } from "../components/environment/EnvVarEditor";
import { HistoryDetailsDialog } from "../components/history/HistoryDetailsDialog";
import { AppShell } from "../components/layout/AppShell";
import { RequestBuilder } from "../components/request-builder/RequestBuilder";
import { ResponseViewer } from "../components/response-viewer/ResponseViewer";
import { CreateEntityDialog } from "../components/sidebar/CreateEntityDialog";
import { WorkspaceTree } from "../components/sidebar/WorkspaceTree";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { api } from "../lib/http-client";
import { createEmptyRequest } from "../lib/request-helpers";
import type { InspectorTab } from "../types";
import { useActiveRequestStore } from "../store/activeRequest";
import { useAuthStore } from "../store/auth";
import { useEnvironmentStore } from "../store/environment";
import { useHistoryStore } from "../store/history";
import { useWorkspaceStore } from "../store/workspaces";

const INSPECTOR_TAB_STORAGE_KEY = "httpclient.inspector-tab";
const INSPECTOR_TABS: InspectorTab[] = [
  "environment",
  "history",
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
  const message =
    error instanceof Error ? error.message : "Something went wrong";
  window.alert(message);
}

type CreateDialogState =
  | { kind: "workspace" }
  | { kind: "project"; workspaceId: string; workspaceName?: string }
  | {
      kind: "folder";
      workspaceId: string;
      projectId: string;
      projectName?: string;
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

export default function App() {
  const {
    user,
    needsSuperuser,
    isInitializing,
    initialize,
    login,
    createSuperuser,
    logout,
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
    response,
    isSending,
    activeTab,
    setDraft,
    setResponse,
    setSending,
    setActiveTab,
  } = useActiveRequestStore();
  const { envVars, setEnvVars, getEnvVars } = useEnvironmentStore();
  const { historyByProject, setHistory } = useHistoryStore();

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(
    getStoredInspectorTab,
  );
  const [users, setUsers] = useState<User[]>([]);
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(null);
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>(null);
  const [historyDetailsEntry, setHistoryDetailsEntry] = useState<HistoryDoc | null>(null);

  const normalizedInspectorTab =
    user?.role === "superadmin" || inspectorTab !== "admin"
      ? inspectorTab
      : "environment";

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
    return [
      ...activeProject.requests,
      ...activeProject.folders.flatMap((folder) => folder.requests),
    ].find((request) => request._id === activeRequestId);
  }, [activeProject, activeRequestId]);
  const activeHistory = activeProject
    ? historyByProject[activeProject._id] ?? []
    : [];
  const activeProjectEnvVars = activeProject
    ? getEnvVars(activeProject._id)
    : [];

  const findProjectInTree = (workspaceId: string, projectId: string) =>
    trees[workspaceId]?.projects.find((project) => project._id === projectId);

  const findFolderInTree = (workspaceId: string, folderId: string) => {
    const project = trees[workspaceId]?.projects.find((item) =>
      item.folders.some((folder) => folder._id === folderId),
    );
    const folder = project?.folders.find((item) => item._id === folderId);

    if (!project || !folder) {
      return null;
    }

    return { project, folder };
  };

  const findRequestInTree = (workspaceId: string, requestId: string) => {
    const project = trees[workspaceId]?.projects.find(
      (item) =>
        item.requests.some((request) => request._id === requestId) ||
        item.folders.some((folder) =>
          folder.requests.some((request) => request._id === requestId),
        ),
    );
    const request = project
      ? [
          ...project.requests,
          ...project.folders.flatMap((folder) => folder.requests),
        ].find((item) => item._id === requestId)
      : undefined;

    if (!project || !request) {
      return null;
    }

    return { project, request };
  };

  useEffect(() => {
    initialize().catch(reportError);
  }, [initialize]);

  useEffect(() => {
    if (!user) {
      setDraft(null);
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
    api
      .getProjectHistory(activeProject._id, activeProject.workspaceId)
      .then(({ history }) => setHistory(activeProject._id, history))
      .catch(() => undefined);
  }, [activeProject, setEnvVars, setHistory]);

  useEffect(() => {
    setDraft(activeRequest ? structuredClone(activeRequest) : null);
  }, [activeRequest, setDraft]);

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
    const firstRequest =
      project?.requests[0]?._id ?? project?.folders[0]?.requests[0]?._id;
    selectRequest(firstRequest);
  };

  const openCreateWorkspaceDialog = () => {
    setRenameDialog(null);
    setCreateDialog({ kind: "workspace" });
  };

  const openCreateProjectDialog = () => {
    if (!activeWorkspace) {
      reportError(new Error("Select a workspace before creating a project."));
      return;
    }

    setRenameDialog(null);
    setCreateDialog({
      kind: "project",
      workspaceId: activeWorkspace._id,
      workspaceName: activeWorkspace.name,
    });
  };

  const openCreateFolderDialog = (projectId: string) => {
    if (!activeWorkspace || !activeTree) {
      reportError(new Error("Open a workspace before creating a folder."));
      return;
    }

    const project = activeTree.projects.find((item) => item._id === projectId);
    if (!project) {
      reportError(new Error("Project not found."));
      return;
    }

    setRenameDialog(null);
    setCreateDialog({
      kind: "folder",
      workspaceId: activeWorkspace._id,
      projectId,
      projectName: project.name,
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
      ? project.folders.find((item) => item._id === folderId)
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

    const target = findFolderInTree(activeWorkspace._id, folderId);
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

    const target = findRequestInTree(activeWorkspace._id, requestId);
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
      const { workspace } = await api.createWorkspace(name);
      await loadWorkspaces();
      selectWorkspace(workspace._id);
      await loadWorkspaceTree(workspace._id);
      return;
    }

    if (createDialog.kind === "project") {
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
      await api.renameWorkspace(renameDialog.workspaceId, name);
      await refreshWorkspaces();
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
        { name },
      );
      await refreshTree(renameDialog.workspaceId);
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
        name,
      );
      await refreshTree(renameDialog.workspaceId);
      return;
    }

    const project = findProjectInTree(
      renameDialog.workspaceId,
      renameDialog.projectId,
    );
    if (!project) {
      throw new Error("Project not found.");
    }

    await api.updateRequest(
      renameDialog.requestId,
      { workspaceId: renameDialog.workspaceId, name },
    );
    await refreshTree(renameDialog.workspaceId);
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
      order: [
        ...project.requests,
        ...project.folders.flatMap((folder) => folder.requests),
      ].length,
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
    selectRequest(
      movedProject?.requests[0]?._id ??
        movedProject?.folders[0]?.requests[0]?._id,
    );
  };

  const handleMoveFolder = async ({
    folderId,
    workspaceId,
    targetProjectId,
    targetOrder,
  }: {
    folderId: string;
    workspaceId: string;
    targetProjectId: string;
    targetOrder: number;
  }) => {
    const preservedRequestId = activeRequestId;
    const { folder } = await api.moveFolder(folderId, {
      workspaceId,
      targetProjectId,
      targetOrder,
    });

    selectWorkspace(workspaceId);
    await refreshTree(workspaceId);

    const targetProject = useWorkspaceStore
      .getState()
      .trees[workspaceId]?.projects.find((item) => item._id === targetProjectId);
    const movedFolder = targetProject?.folders.find((item) => item._id === folder._id);
    const nextRequestId =
      movedFolder?.requests.find((item) => item._id === preservedRequestId)?._id ??
      movedFolder?.requests[0]?._id ??
      targetProject?.requests[0]?._id ??
      targetProject?.folders[0]?.requests[0]?._id;

    selectProject(targetProjectId);
    selectRequest(nextRequestId);
  };

  const saveRequest = async () => {
    if (!draft) {
      return;
    }
    await api.updateRequest(draft._id, {
      ...draft,
      workspaceId: draft.workspaceId,
    });
    await refreshTree(draft.workspaceId);
  };

  const sendRequest = async (payload: Parameters<typeof api.execute>[0]) => {
    setSending(true);
    try {
      const result = await api.execute(payload);
      setResponse(result);
      if (activeProject) {
        const { history } = await api.getProjectHistory(
          activeProject._id,
          activeProject.workspaceId,
        );
        setHistory(activeProject._id, history);
      }
    } catch (error) {
      reportError(error);
    } finally {
      setSending(false);
    }
  };

  const updateEnvironment = async () => {
    if (!activeProject || !activeWorkspace) {
      return;
    }
    await api.updateProject(activeProject._id, activeWorkspace._id, {
      envVars: envVars[activeProject._id] ?? [],
    });
    await refreshTree(activeWorkspace._id);
  };

  const refreshUsers = async () => {
    if (user?.role !== "superadmin") {
      return;
    }
    const response = await api.listUsers();
    setUsers(response.users);
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
        description: createDialog.projectName
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
  }, [createDialog]);

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
    return <CreateSuperuserPage onSubmit={createSuperuser} />;
  }

  if (!user) {
    return <LoginPage onSubmit={login} />;
  }

  return (
    <>
      <AppShell
        user={user}
        activeWorkspaceName={activeWorkspace?.name}
        activeProjectName={activeProject?.name}
        activeRequestName={activeRequest?.name}
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
            onSelectRequest={selectRequest}
            onCreateWorkspace={openCreateWorkspaceDialog}
            onCreateProject={openCreateProjectDialog}
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
            onSend={(payload) => sendRequest(payload).catch(reportError)}
          />
        }
        response={<ResponseViewer response={response} />}
        inspector={
          <Tabs
            value={normalizedInspectorTab}
            onValueChange={(value) => setInspectorTab(value as InspectorTab)}
          >
            <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-1">
              <TabsTrigger
                value="environment"
                className="inline-flex h-9 w-9 items-center justify-center p-0"
                aria-label="Environment"
                title="Environment"
              >
                <Settings2 className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="inline-flex h-9 w-9 items-center justify-center p-0"
                aria-label="History"
                title="History"
              >
                <Activity className="h-4 w-4" />
              </TabsTrigger>
              {user.role === "superadmin" ? (
                <TabsTrigger
                  value="admin"
                  className="inline-flex h-9 w-9 items-center justify-center p-0"
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
              <Card>
                <CardHeader>
                  <CardTitle>Request History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeHistory.length === 0 ? (
                    <p className="text-sm text-muted">
                      The last 50 project executions will appear here.
                    </p>
                  ) : null}
                  {activeHistory.map((entry: HistoryDoc) => (
                    <div
                      key={entry._id}
                      className="rounded-2xl border border-white/8 bg-white/4 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3 text-sm">
                            <span className="font-medium text-foreground">
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
            {user.role === "superadmin" ? (
              <TabsContent value="admin">
                <UserManagement
                  users={users}
                  workspaces={workspaces}
                  onCreate={(payload) => api.createUser(payload).then(refreshUsers)}
                  onUpdate={(userId, payload) =>
                    api.updateUser(userId, payload).then(refreshUsers)
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
        }
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
      <HistoryDetailsDialog
        entry={historyDetailsEntry}
        open={Boolean(historyDetailsEntry)}
        onOpenChange={(open) => !open && setHistoryDetailsEntry(null)}
      />
    </>
  );
}








