import type { RequestDoc, WorkspaceMeta, WorkspaceTree } from "@restify/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api } from "../lib/http-client";

type TreeProject = WorkspaceTree["projects"][number];

interface WorkspaceState {
  workspaces: WorkspaceMeta[];
  trees: Record<string, WorkspaceTree>;
  activeWorkspaceId?: string;
  activeProjectId?: string;
  activeRequestId?: string;
  isLoading: boolean;
  loadWorkspaces: () => Promise<void>;
  loadWorkspaceTree: (workspaceId: string) => Promise<void>;
  setWorkspaces: (workspaces: WorkspaceMeta[]) => void;
  setTree: (workspaceId: string, tree: WorkspaceTree) => void;
  selectWorkspace: (workspaceId?: string) => void;
  selectProject: (projectId?: string) => void;
  selectRequest: (requestId?: string) => void;
  getActiveTree: () => WorkspaceTree | undefined;
  getActiveProject: () => TreeProject | undefined;
  getActiveRequest: () => RequestDoc | undefined;
}

const WORKSPACE_SELECTION_KEY = "httpclient.workspace-selection";

function getFirstRequestId(project?: TreeProject): string | undefined {
  if (!project) {
    return undefined;
  }

  return project.requests[0]?._id ?? project.folders[0]?.requests[0]?._id;
}

function projectContainsRequest(
  project: TreeProject | undefined,
  requestId?: string,
): boolean {
  if (!project || !requestId) {
    return false;
  }

  return [
    ...project.requests,
    ...project.folders.flatMap((folder) => folder.requests),
  ].some((request) => request._id === requestId);
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      trees: {},
      activeWorkspaceId: undefined,
      activeProjectId: undefined,
      activeRequestId: undefined,
      isLoading: false,
      loadWorkspaces: async () => {
        set({ isLoading: true });
        const { workspaces } = await api.listWorkspaces();
        set((state) => ({
          workspaces,
          activeWorkspaceId: workspaces.some(
            (workspace) => workspace._id === state.activeWorkspaceId,
          )
            ? state.activeWorkspaceId
            : workspaces[0]?._id,
          isLoading: false,
        }));
      },
      loadWorkspaceTree: async (workspaceId) => {
        const { tree } = await api.getWorkspaceTree(workspaceId);
        set((state) => {
          const activeProjectId =
            tree.projects.find((project) => project._id === state.activeProjectId)
              ?._id ?? tree.projects[0]?._id;
          const activeProject = tree.projects.find(
            (project) => project._id === activeProjectId,
          );

          return {
            trees: { ...state.trees, [workspaceId]: tree },
            activeWorkspaceId: workspaceId,
            activeProjectId,
            activeRequestId: projectContainsRequest(
              activeProject,
              state.activeRequestId,
            )
              ? state.activeRequestId
              : getFirstRequestId(activeProject),
          };
        });
      },
      setWorkspaces: (workspaces) => set({ workspaces }),
      setTree: (workspaceId, tree) =>
        set((state) => ({ trees: { ...state.trees, [workspaceId]: tree } })),
      selectWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),
      selectProject: (projectId) => set({ activeProjectId: projectId }),
      selectRequest: (requestId) => set({ activeRequestId: requestId }),
      getActiveTree: () => {
        const { activeWorkspaceId, trees } = get();
        return activeWorkspaceId ? trees[activeWorkspaceId] : undefined;
      },
      getActiveProject: () => {
        const { activeProjectId } = get();
        const tree = get().getActiveTree();
        return tree?.projects.find((project) => project._id === activeProjectId);
      },
      getActiveRequest: () => {
        const { activeRequestId } = get();
        const project = get().getActiveProject();
        if (!project) {
          return undefined;
        }

        return [
          ...project.requests,
          ...project.folders.flatMap((folder) => folder.requests),
        ].find((request) => request._id === activeRequestId);
      },
    }),
    {
      name: WORKSPACE_SELECTION_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        activeProjectId: state.activeProjectId,
        activeRequestId: state.activeRequestId,
      }),
    },
  ),
);