import type {
  RequestDoc,
  WorkspaceMeta,
  WorkspaceTree as WorkspaceTreeModel,
} from "@restify/shared";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderClosed,
  Eye,
  EyeOff,
  FileUp,
  GripVertical,
  Layers3,
  Plus,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { METHOD_TEXT_STYLES } from "../../lib/methods";
import { flattenFolders } from "../../lib/workspace-tree";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ContextMenus } from "./ContextMenus";

type SortableItem = { _id: string; order: number };
type TreeProject = WorkspaceTreeModel["projects"][number];
type TreeFolder = TreeProject["folders"][number];
type ReorderableRenderResult = {
  row: (dragHandle: ReactNode, isDragging: boolean) => ReactNode;
  renderChildren?: (isDragging: boolean) => ReactNode;
};

type TreeDragData =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; workspaceId: string; projectId: string }
  | {
      kind: "folder";
      workspaceId: string;
      projectId: string;
      folderId: string;
      parentFolderId?: string | null;
    }
  | {
      kind: "folder-container";
      workspaceId: string;
      projectId: string;
      folderId: string;
    }
  | {
      kind: "request";
      workspaceId: string;
      projectId: string;
      folderId?: string | null;
      requestId: string;
    };

interface RequestMovePayload {
  requestId: string;
  workspaceId: string;
  targetProjectId: string;
  targetFolderId?: string | null;
  targetOrder: number;
}

interface ProjectMovePayload {
  projectId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  targetOrder?: number;
}

interface FolderMovePayload {
  folderId: string;
  workspaceId: string;
  targetProjectId: string;
  targetParentFolderId?: string | null;
  targetOrder: number;
}

interface DropTargetState {
  id: string;
  data: TreeDragData;
}

interface WorkspaceTreeProps {
  workspaces: WorkspaceMeta[];
  workspaceTrees: Record<string, WorkspaceTreeModel>;
  tree?: WorkspaceTreeModel;
  activeWorkspaceId?: string;
  activeProjectId?: string;
  activeRequestId?: string;
  canCreateWorkspace: boolean;
  canCreateProject: boolean;
  canManagePrivacy: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectRequest: (requestId: string) => void;
  onCreateWorkspace: () => void;
  onCreateProject: (workspaceId?: string) => void;
  onImportPostman: (workspaceId: string) => void;
  onCreateFolder: (projectId: string, parentFolderId?: string | null) => void;
  onCreateRequest: (projectId: string, folderId?: string | null) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onRenameProject: (projectId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onRenameRequest: (requestId: string) => void;
  onDuplicateWorkspace: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDuplicateFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDuplicateRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onToggleProjectPrivacy: (
    workspaceId: string,
    projectId: string,
    isPrivate: boolean,
  ) => void;
  onToggleFolderPrivacy: (
    workspaceId: string,
    folderId: string,
    isPrivate: boolean,
  ) => void;
  onToggleRequestPrivacy: (
    workspaceId: string,
    requestId: string,
    isPrivate: boolean,
  ) => void;
  onWorkspaceReorder: (orderedIds: string[]) => void;
  onProjectReorder: (orderedIds: string[]) => void;
  onFolderReorder: (projectId: string, orderedIds: string[]) => void;
  onMoveProject: (payload: ProjectMovePayload) => void;
  onMoveFolder: (payload: FolderMovePayload) => void;
  onMoveRequest: (payload: RequestMovePayload) => void;
  onEnsureWorkspaceTree?: (workspaceId: string) => Promise<void>;
}

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function normalizeFolderId(folderId?: string | null) {
  return folderId ?? null;
}

function getRequestContainerKey(projectId: string, folderId?: string | null) {
  const normalizedFolderId = normalizeFolderId(folderId);
  return normalizedFolderId
    ? `folder:${normalizedFolderId}:requests`
    : `project:${projectId}:requests`;
}

function getFolderContainerKey(projectId: string, parentFolderId?: string | null) {
  const normalizedParentFolderId = normalizeFolderId(parentFolderId);
  return normalizedParentFolderId
    ? `folder:${normalizedParentFolderId}:folders`
    : `project:${projectId}:folders`;
}

const SIDEBAR_EXPANSION_STORAGE_KEY = "httpclient.sidebar-expansion";

interface SidebarExpansionState {
  projects: Record<string, boolean>;
  folders: Record<string, boolean>;
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

function loadSidebarExpansionState(): SidebarExpansionState {
  if (typeof window === "undefined") {
    return { projects: {}, folders: {} };
  }

  try {
    const rawValue = window.localStorage.getItem(SIDEBAR_EXPANSION_STORAGE_KEY);
    if (!rawValue) {
      return { projects: {}, folders: {} };
    }

    const parsedValue = JSON.parse(rawValue) as {
      projects?: unknown;
      folders?: unknown;
    };

    return {
      projects: isBooleanRecord(parsedValue.projects) ? parsedValue.projects : {},
      folders: isBooleanRecord(parsedValue.folders) ? parsedValue.folders : {},
    };
  } catch {
    return { projects: {}, folders: {} };
  }
}

function persistSidebarExpansionState(state: SidebarExpansionState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SIDEBAR_EXPANSION_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    return;
  }
}


function getDragEntityId(data: TreeDragData) {
  switch (data.kind) {
    case "workspace":
      return data.workspaceId;
    case "project":
      return data.projectId;
    case "folder":
      return data.folderId;
    case "folder-container":
      return `folder-container:${data.folderId}`;
    case "request":
      return data.requestId;
  }
}

function SortableTreeItem({
  id,
  data,
  renderRow,
  renderChildren,
}: {
  id: string;
  data: TreeDragData;
  renderRow: (dragHandle: ReactNode, isDragging: boolean) => ReactNode;
  renderChildren?: (isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, data });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragHandle = (
    <button
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted/60 transition active:cursor-grabbing touch-none",
        "cursor-grab opacity-0 pointer-events-none group-hover/tree-item:opacity-100 group-hover/tree-item:pointer-events-auto group-focus-within/tree-item:opacity-100 group-focus-within/tree-item:pointer-events-auto",
        "hover:bg-white/8 hover:text-foreground",
      )}
      {...attributes}
      {...listeners}
      type="button"
      aria-label="Reorder item"
    >
      <GripVertical className="h-3 w-3" />
    </button>
  );

  return (
    <div className="min-w-0 space-y-0.5">
      <div
        ref={setNodeRef}
        style={style}
        className={cn("group/tree-item will-change-transform", isDragging && "z-30 opacity-45")}
      >
        {renderRow(dragHandle, isDragging)}
      </div>
      {renderChildren?.(isDragging)}
    </div>
  );
}

function ReorderableList<T extends SortableItem>({
  items,
  getItemData,
  renderItem,
}: {
  items: T[];
  getItemData: (item: T) => TreeDragData;
  renderItem: (item: T) => ReorderableRenderResult;
}) {
  return (
    <SortableContext
      items={items.map((item) => item._id)}
      strategy={verticalListSortingStrategy}
    >
      <div className="space-y-0.5">
        {items.map((item) => {
          const renderedItem = renderItem(item);

          return (
            <SortableTreeItem
              key={item._id}
              id={item._id}
              data={getItemData(item)}
              renderRow={renderedItem.row}
              renderChildren={renderedItem.renderChildren}
            />
          );
        })}
      </div>
    </SortableContext>
  );
}

function TreeNodeContent({
  icon,
  name,
  meta,
  accessory,
}: {
  icon: ReactNode;
  name: string;
  meta?: string;
  accessory?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0">{icon}</span>
      <span
        className="min-w-0 flex-1 truncate text-[13px] leading-5 text-foreground"
        title={name}
      >
        {name}
      </span>
      {meta ? (
        <span className="shrink-0 text-[10px] text-muted">{meta}</span>
      ) : null}
      {accessory ? <span className="shrink-0">{accessory}</span> : null}
    </div>
  );
}

function PrivacyToggleButton({
  isPrivate,
  label,
  onToggle,
}: {
  isPrivate: boolean;
  label: "project" | "folder" | "request";
  onToggle: (isPrivate: boolean) => void;
}) {
  const title = isPrivate
    ? `Make ${label} visible to members`
    : `Make ${label} private`;

  return (
    <button
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted/70 transition hover:bg-white/8 hover:text-foreground",
        isPrivate && "text-amber-200",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(!isPrivate);
      }}
      type="button"
      aria-label={title}
      title={title}
    >
      {isPrivate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );
}

function DropPlaceholderShell({ children }: { children: ReactNode }) {
  return (
    <div className="ml-5 rounded-md border border-dashed border-accent/45 bg-accent/8 px-2 py-1">
      {children}
    </div>
  );
}

function DropPlaceholderTarget({
  id,
  data,
  children,
}: {
  id: string;
  data: TreeDragData;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id, data });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition",
        isOver && "ring-1 ring-inset ring-accent/60",
      )}
    >
      {children}
    </div>
  );
}

function ProjectDropPlaceholder({ project }: { project: TreeProject }) {
  return (
    <DropPlaceholderShell>
      <TreeNodeContent
        icon={<Workflow className="h-3.5 w-3.5 text-sky-300" />}
        name={project.name}
      />
    </DropPlaceholderShell>
  );
}

function FolderDropPlaceholder({ folder }: { folder: TreeFolder }) {
  return (
    <DropPlaceholderShell>
      <TreeNodeContent
        icon={<Folder className="h-3.5 w-3.5 text-amber-300" />}
        name={folder.name}
      />
    </DropPlaceholderShell>
  );
}

function RequestDropPlaceholder({ request }: { request: RequestDoc }) {
  return (
    <DropPlaceholderShell>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "w-14 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]",
            METHOD_TEXT_STYLES[request.method],
          )}
        >
          {request.method}
        </span>
        <span className="truncate text-[12px] text-accent/90">{request.name}</span>
      </div>
    </DropPlaceholderShell>
  );
}

function RequestItem({
  request,
  activeRequestId,
  onSelectRequest,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
  onTogglePrivacy,
  canManagePrivacy,
  isDragging = false,
  isDropTarget = false,
}: {
  request: RequestDoc;
  activeRequestId?: string;
  onSelectRequest: (requestId: string) => void;
  onRenameRequest: (requestId: string) => void;
  onDuplicateRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onTogglePrivacy: (requestId: string, isPrivate: boolean) => void;
  canManagePrivacy: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-md transition",
        isDragging
          ? "pointer-events-none border border-dashed border-accent/35 bg-white/[0.04] pr-2"
          : isDropTarget
            ? cn("bg-accent/10 ring-1 ring-inset ring-accent/55", canManagePrivacy ? "pr-14" : "pr-7")
            : activeRequestId === request._id
              ? cn("bg-accent/10", canManagePrivacy ? "pr-14" : "pr-7")
              : cn(canManagePrivacy ? "pr-14" : "pr-7", "hover:bg-white/[0.035]"),
      )}
    >
      <div className="flex items-center gap-1.5 px-1 py-0.5">
        <span
          className={cn(
            "w-14 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]",
            METHOD_TEXT_STYLES[request.method],
          )}
        >
          {request.method}
        </span>
        <button
          className={cn(
            "min-w-0 flex-1 truncate text-left text-[13px] leading-5 text-foreground",
            activeRequestId === request._id && "font-medium",
          )}
          onClick={() => onSelectRequest(request._id)}
          type="button"
          title={request.name}
        >
          {request.name}
        </button>
      </div>
      {!isDragging ? (
        <ContextMenus
          leadingAccessory={
            canManagePrivacy ? (
              <PrivacyToggleButton
                isPrivate={request.isPrivate}
                label="request"
                onToggle={(isPrivate) => onTogglePrivacy(request._id, isPrivate)}
              />
            ) : null
          }
          onRename={() => onRenameRequest(request._id)}
          onDuplicate={() => onDuplicateRequest(request._id)}
          onDelete={() => onDeleteRequest(request._id)}
        />
      ) : null}
    </div>
  );
}

function reorderIds(items: SortableItem[], activeId: string, overId: string) {
  const oldIndex = items.findIndex((item) => item._id === activeId);
  const newIndex = items.findIndex((item) => item._id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null;
  }

  return arrayMove(items, oldIndex, newIndex).map((item) => item._id);
}

export function WorkspaceTree(props: WorkspaceTreeProps) {
  const {
    workspaces,
    workspaceTrees,
    tree,
    activeWorkspaceId,
    activeProjectId,
    activeRequestId,
    canCreateWorkspace,
    canCreateProject,
    canManagePrivacy,
    onSelectWorkspace,
    onSelectProject,
    onSelectRequest,
    onCreateWorkspace,
    onCreateProject,
    onImportPostman,
    onCreateFolder,
    onCreateRequest,
    onRenameWorkspace,
    onRenameProject,
    onRenameFolder,
    onRenameRequest,
    onDuplicateWorkspace,
    onDeleteWorkspace,
    onDuplicateProject,
    onDeleteProject,
    onDuplicateFolder,
    onDeleteFolder,
    onDuplicateRequest,
    onDeleteRequest,
    onToggleProjectPrivacy,
    onToggleFolderPrivacy,
    onToggleRequestPrivacy,
    onWorkspaceReorder,
    onProjectReorder,
    onFolderReorder: _onFolderReorder,
    onMoveProject,
    onMoveFolder,
    onMoveRequest,
    onEnsureWorkspaceTree,
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(
    () => loadSidebarExpansionState().projects,
  );
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    () => loadSidebarExpansionState().folders,
  );
  const [activeDragData, setActiveDragData] = useState<TreeDragData | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

  const workspaceList = useMemo(
    () => [...workspaces].sort((a, b) => a.order - b.order),
    [workspaces],
  );
  const treeByWorkspace = useMemo(
    () =>
      activeWorkspaceId && tree
        ? { ...workspaceTrees, [activeWorkspaceId]: tree }
        : workspaceTrees,
    [activeWorkspaceId, tree, workspaceTrees],
  );
  const activeProjects = useMemo(
    () =>
      sortByOrder(
        activeWorkspaceId ? treeByWorkspace[activeWorkspaceId]?.projects ?? [] : [],
      ),
    [activeWorkspaceId, treeByWorkspace],
  );
  const projectsByWorkspace = useMemo(() => {
    const map: Record<string, TreeProject[]> = {};

    workspaces.forEach((workspace) => {
      map[workspace._id] = sortByOrder(treeByWorkspace[workspace._id]?.projects ?? []);
    });

    return map;
  }, [treeByWorkspace, workspaces]);
  const projectById = useMemo(() => {
    const map: Record<string, TreeProject> = {};

    Object.values(treeByWorkspace).forEach((workspaceTree) => {
      workspaceTree.projects.forEach((project) => {
        map[project._id] = project;
      });
    });

    return map;
  }, [treeByWorkspace]);

  const folderById = useMemo(() => {
    const map: Record<string, TreeFolder> = {};

    Object.values(projectById).forEach((project) => {
      flattenFolders(project.folders).forEach((folder) => {
        map[folder._id] = folder;
      });
    });

    return map;
  }, [projectById]);


  useEffect(() => {
    persistSidebarExpansionState({
      projects: expandedProjects,
      folders: expandedFolders,
    });
  }, [expandedFolders, expandedProjects]);

  const requestById = useMemo(() => {
    const map: Record<string, RequestDoc> = {};

    activeProjects.forEach((project) => {
      project.requests.forEach((request) => {
        map[request._id] = request;
      });
      flattenFolders(project.folders).forEach((folder) => {
        folder.requests.forEach((request) => {
          map[request._id] = request;
        });
      });
    });

    return map;
  }, [activeProjects]);

  const folderContainerIds = useMemo(() => {
    const containers: Record<string, string[]> = {};

    const visitFolderContainer = (
      projectId: string,
      folders: TreeFolder[],
      parentFolderId: string | null,
    ) => {
      containers[getFolderContainerKey(projectId, parentFolderId)] = sortByOrder(
        folders,
      ).map((folder) => folder._id);

      sortByOrder(folders).forEach((folder) => {
        visitFolderContainer(projectId, folder.folders, folder._id);
      });
    };

    activeProjects.forEach((project) => {
      visitFolderContainer(project._id, project.folders, null);
    });

    return containers;
  }, [activeProjects]);

  const requestContainerIds = useMemo(() => {
    const containers: Record<string, string[]> = {};

    const visitRequests = (projectId: string, folders: TreeFolder[]) => {
      folders.forEach((folder) => {
        containers[getRequestContainerKey(projectId, folder._id)] = sortByOrder(
          folder.requests,
        ).map((request) => request._id);
        visitRequests(projectId, folder.folders);
      });
    };

    activeProjects.forEach((project) => {
      containers[getRequestContainerKey(project._id)] = sortByOrder(
        project.requests,
      ).map((request) => request._id);
      visitRequests(project._id, project.folders);
    });

    return containers;
  }, [activeProjects]);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragData((event.active.data.current as TreeDragData | undefined) ?? null);
    setDropTarget(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const activeData = event.active.data.current as TreeDragData | undefined;
    const overData = event.over?.data.current as TreeDragData | undefined;

    if (!event.over || !activeData || !overData) {
      setDropTarget(null);
      return;
    }

    const overId = String(event.over.id);
    if (overId === getDragEntityId(activeData)) {
      setDropTarget(null);
      return;
    }

    setDropTarget({ id: overId, data: overData });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragData(null);
    setDropTarget(null);

    if (!event.over) {
      return;
    }

    const activeData = event.active.data.current as TreeDragData | undefined;
    const overData = event.over.data.current as TreeDragData | undefined;
    if (!activeData || !overData) {
      return;
    }

    if (activeData.kind === "workspace" && overData.kind === "workspace") {
      const orderedIds = reorderIds(
        workspaceList,
        activeData.workspaceId,
        overData.workspaceId,
      );
      if (orderedIds) {
        onWorkspaceReorder(orderedIds);
      }
      return;
    }

    if (activeData.kind === "project") {
      const resolveProjectTarget = () => {
        if (overData.kind === "project") {
          return {
            workspaceId: overData.workspaceId,
            overProjectId: overData.projectId,
          };
        }

        if (overData.kind === "workspace") {
          return {
            workspaceId: overData.workspaceId,
            overProjectId: null,
          };
        }

        return null;
      };

      const target = resolveProjectTarget();
      if (!target) {
        return;
      }

      const sourceProjects = projectsByWorkspace[activeData.workspaceId] ?? [];
      const sourceProjectIds = sourceProjects.map((item) => item._id);
      const isSameWorkspace = activeData.workspaceId === target.workspaceId;

      if (isSameWorkspace && overData.kind === "project") {
        const orderedIds = reorderIds(
          sourceProjects,
          activeData.projectId,
          overData.projectId,
        );
        if (orderedIds) {
          onProjectReorder(orderedIds);
        }
        return;
      }

      const targetProjects = projectsByWorkspace[target.workspaceId] ?? [];
      const targetIdsWithoutActive = targetProjects
        .map((item) => item._id)
        .filter((projectId) => projectId !== activeData.projectId);
      const targetOrder =
        overData.kind === "project" && target.overProjectId
          ? targetIdsWithoutActive.indexOf(target.overProjectId)
          : treeByWorkspace[target.workspaceId]
            ? targetIdsWithoutActive.length
            : undefined;
      const normalizedTargetOrder =
        targetOrder === undefined
          ? undefined
          : Math.max(
              0,
              targetOrder === -1 ? targetIdsWithoutActive.length : targetOrder,
            );
      const currentIndex = sourceProjectIds.indexOf(activeData.projectId);

      if (isSameWorkspace) {
        if (normalizedTargetOrder === undefined || currentIndex === normalizedTargetOrder) {
          return;
        }

        const orderedIds = sourceProjectIds.filter(
          (projectId) => projectId !== activeData.projectId,
        );
        orderedIds.splice(normalizedTargetOrder, 0, activeData.projectId);
        onProjectReorder(orderedIds);
        return;
      }

      onMoveProject({
        projectId: activeData.projectId,
        sourceWorkspaceId: activeData.workspaceId,
        targetWorkspaceId: target.workspaceId,
        targetOrder: normalizedTargetOrder,
      });
      return;
    }

    if (activeData.kind === "folder") {
      const sourceContainerKey = getFolderContainerKey(
        activeData.projectId,
        activeData.parentFolderId,
      );
      const sourceFolderIds = folderContainerIds[sourceContainerKey] ?? [];

      const resolveFolderTarget = () => {
        if (overData.kind === "folder") {
          return {
            projectId: overData.projectId,
            parentFolderId: normalizeFolderId(overData.parentFolderId),
            containerKey: getFolderContainerKey(
              overData.projectId,
              overData.parentFolderId,
            ),
            overFolderId: overData.folderId,
          };
        }

        if (overData.kind === "folder-container") {
          return {
            projectId: overData.projectId,
            parentFolderId: overData.folderId,
            containerKey: getFolderContainerKey(overData.projectId, overData.folderId),
            overFolderId: null,
          };
        }

        if (overData.kind === "project") {
          return {
            projectId: overData.projectId,
            parentFolderId: null,
            containerKey: getFolderContainerKey(overData.projectId, null),
            overFolderId: null,
          };
        }

        return null;
      };

      const target = resolveFolderTarget();
      if (!target) {
        return;
      }

      if (
        overData.kind === "folder" &&
        activeData.folderId === overData.folderId &&
        sourceContainerKey === target.containerKey
      ) {
        return;
      }

      const targetFolderIds = folderContainerIds[target.containerKey] ?? [];
      const isSameContainer = sourceContainerKey === target.containerKey;

      if (isSameContainer && overData.kind === "folder") {
        const orderedIds = reorderIds(
          sourceFolderIds.map((folderId, index) => ({
            _id: folderId,
            order: index,
          })),
          activeData.folderId,
          overData.folderId,
        );

        if (!orderedIds) {
          return;
        }

        onMoveFolder({
          folderId: activeData.folderId,
          workspaceId: activeData.workspaceId,
          targetProjectId: target.projectId,
          targetParentFolderId: target.parentFolderId,
          targetOrder: orderedIds.indexOf(activeData.folderId),
        });
        return;
      }

      const targetIdsWithoutActive = targetFolderIds.filter(
        (folderId) => folderId !== activeData.folderId,
      );
      const targetOrder =
        overData.kind === "folder" && target.overFolderId
          ? targetIdsWithoutActive.indexOf(target.overFolderId)
          : targetIdsWithoutActive.length;
      const normalizedTargetOrder = Math.max(
        0,
        targetOrder === -1 ? targetIdsWithoutActive.length : targetOrder,
      );
      const currentIndex = sourceFolderIds.indexOf(activeData.folderId);

      if (isSameContainer && currentIndex === normalizedTargetOrder) {
        return;
      }

      onMoveFolder({
        folderId: activeData.folderId,
        workspaceId: activeData.workspaceId,
        targetProjectId: target.projectId,
        targetParentFolderId: target.parentFolderId,
        targetOrder: normalizedTargetOrder,
      });
      return;
    }

    if (activeData.kind !== "request") {
      return;
    }

    const sourceContainerKey = getRequestContainerKey(
      activeData.projectId,
      activeData.folderId,
    );
    const sourceRequestIds = requestContainerIds[sourceContainerKey] ?? [];

    const resolveRequestTarget = () => {
      if (overData.kind === "request") {
        return {
          projectId: overData.projectId,
          folderId: normalizeFolderId(overData.folderId),
          containerKey: getRequestContainerKey(
            overData.projectId,
            overData.folderId,
          ),
          overRequestId: overData.requestId,
        };
      }

      if (overData.kind === "project") {
        return {
          projectId: overData.projectId,
          folderId: null,
          containerKey: getRequestContainerKey(overData.projectId),
          overRequestId: null,
        };
      }

      if (overData.kind === "folder") {
        return {
          projectId: overData.projectId,
          folderId: overData.folderId,
          containerKey: getRequestContainerKey(
            overData.projectId,
            overData.folderId,
          ),
          overRequestId: null,
        };
      }

      if (overData.kind === "folder-container") {
        return {
          projectId: overData.projectId,
          folderId: overData.folderId,
          containerKey: getRequestContainerKey(overData.projectId, overData.folderId),
          overRequestId: null,
        };
      }

      return null;
    };

    const target = resolveRequestTarget();
    if (!target) {
      return;
    }

    if (
      overData.kind === "request" &&
      activeData.requestId === overData.requestId &&
      sourceContainerKey === target.containerKey
    ) {
      return;
    }

    const targetRequestIds = requestContainerIds[target.containerKey] ?? [];
    const isSameContainer = sourceContainerKey === target.containerKey;

    if (isSameContainer && overData.kind === "request") {
      const orderedIds = reorderIds(
        sourceRequestIds.map((requestId, index) => ({
          _id: requestId,
          order: index,
        })),
        activeData.requestId,
        overData.requestId,
      );

      if (!orderedIds) {
        return;
      }

      onMoveRequest({
        requestId: activeData.requestId,
        workspaceId: activeData.workspaceId,
        targetProjectId: target.projectId,
        targetFolderId: target.folderId,
        targetOrder: orderedIds.indexOf(activeData.requestId),
      });
      return;
    }

    const targetIdsWithoutActive = targetRequestIds.filter(
      (requestId) => requestId !== activeData.requestId,
    );
    const targetOrder =
      overData.kind === "request" && target.overRequestId
        ? targetIdsWithoutActive.indexOf(target.overRequestId)
        : targetIdsWithoutActive.length;

    const normalizedTargetOrder = Math.max(
      0,
      targetOrder === -1 ? targetIdsWithoutActive.length : targetOrder,
    );
    const currentIndex = sourceRequestIds.indexOf(activeData.requestId);

    if (isSameContainer && currentIndex === normalizedTargetOrder) {
      return;
    }

    onMoveRequest({
      requestId: activeData.requestId,
      workspaceId: activeData.workspaceId,
      targetProjectId: target.projectId,
      targetFolderId: target.folderId,
      targetOrder: normalizedTargetOrder,
    });
  };

  const isDropTarget = useCallback(
    (kind: TreeDragData["kind"], id: string) =>
      dropTarget?.id === id && dropTarget.data.kind === kind,
    [dropTarget],
  );

  const projectPreviewTarget = useMemo(() => {
    if (activeDragData?.kind !== "project" || !dropTarget) {
      return null;
    }

    if (dropTarget.data.kind === "project") {
      return {
        workspaceId: dropTarget.data.workspaceId,
        overProjectId: dropTarget.data.projectId,
      };
    }

    if (dropTarget.data.kind === "workspace") {
      return {
        workspaceId: dropTarget.data.workspaceId,
        overProjectId: null,
      };
    }

    return null;
  }, [activeDragData, dropTarget]);

  const activeDraggedProject = useMemo(
    () =>
      activeDragData?.kind === "project"
        ? projectById[activeDragData.projectId] ?? null
        : null,
    [activeDragData, projectById],
  );

  const getProjectDropPreview = useCallback(
    (workspaceId: string) => {
      if (
        activeDragData?.kind !== "project" ||
        !activeDraggedProject ||
        !projectPreviewTarget
      ) {
        return null;
      }

      if (projectPreviewTarget.workspaceId !== workspaceId) {
        return null;
      }

      if (activeDragData.workspaceId === workspaceId) {
        return null;
      }

      return {
        project: activeDraggedProject,
        beforeProjectId: projectPreviewTarget.overProjectId,
      };
    },
    [activeDragData, activeDraggedProject, projectPreviewTarget],
  );

  const folderPreviewTarget = useMemo(() => {
    if (activeDragData?.kind !== "folder" || !dropTarget) {
      return null;
    }

    if (dropTarget.data.kind === "folder") {
      return {
        containerKey: getFolderContainerKey(
          dropTarget.data.projectId,
          dropTarget.data.parentFolderId,
        ),
        projectId: dropTarget.data.projectId,
        parentFolderId: normalizeFolderId(dropTarget.data.parentFolderId),
        overFolderId: dropTarget.data.folderId,
      };
    }

    if (dropTarget.data.kind === "folder-container") {
      return {
        containerKey: getFolderContainerKey(
          dropTarget.data.projectId,
          dropTarget.data.folderId,
        ),
        projectId: dropTarget.data.projectId,
        parentFolderId: dropTarget.data.folderId,
        overFolderId: null,
      };
    }

    if (dropTarget.data.kind === "project") {
      return {
        containerKey: getFolderContainerKey(dropTarget.data.projectId, null),
        projectId: dropTarget.data.projectId,
        parentFolderId: null,
        overFolderId: null,
      };
    }

    return null;
  }, [activeDragData, dropTarget]);

  const activeDraggedFolder = useMemo(
    () =>
      activeDragData?.kind === "folder"
        ? folderById[activeDragData.folderId] ?? null
        : null,
    [activeDragData, folderById],
  );

  const getFolderDropPreview = useCallback(
    (projectId: string, parentFolderId?: string | null) => {
      if (
        activeDragData?.kind !== "folder" ||
        !activeDraggedFolder ||
        !folderPreviewTarget
      ) {
        return null;
      }

      const targetContainerKey = getFolderContainerKey(projectId, parentFolderId);
      if (folderPreviewTarget.containerKey !== targetContainerKey) {
        return null;
      }

      const sourceContainerKey = getFolderContainerKey(
        activeDragData.projectId,
        activeDragData.parentFolderId,
      );
      if (sourceContainerKey === targetContainerKey) {
        return null;
      }

      return {
        folder: activeDraggedFolder,
        beforeFolderId: folderPreviewTarget.overFolderId,
      };
    },
    [activeDragData, activeDraggedFolder, folderPreviewTarget],
  );

  const requestPreviewTarget = useMemo(() => {
    if (activeDragData?.kind !== "request" || !dropTarget) {
      return null;
    }

    if (dropTarget.data.kind === "request") {
      return {
        containerKey: getRequestContainerKey(
          dropTarget.data.projectId,
          dropTarget.data.folderId,
        ),
        overRequestId: dropTarget.data.requestId,
      };
    }

    if (dropTarget.data.kind === "project") {
      return {
        containerKey: getRequestContainerKey(dropTarget.data.projectId),
        overRequestId: null,
      };
    }

    if (dropTarget.data.kind === "folder") {
      return {
        containerKey: getRequestContainerKey(
          dropTarget.data.projectId,
          dropTarget.data.folderId,
        ),
        overRequestId: null,
      };
    }

    if (dropTarget.data.kind === "folder-container") {
      return {
        containerKey: getRequestContainerKey(
          dropTarget.data.projectId,
          dropTarget.data.folderId,
        ),
        overRequestId: null,
      };
    }

    return null;
  }, [activeDragData, dropTarget]);

  const activeDraggedRequest = useMemo(
    () =>
      activeDragData?.kind === "request"
        ? requestById[activeDragData.requestId] ?? null
        : null,
    [activeDragData, requestById],
  );

  const getRequestDropPreview = useCallback(
    (projectId: string, folderId?: string | null) => {
      if (
        activeDragData?.kind !== "request" ||
        !activeDraggedRequest ||
        !requestPreviewTarget
      ) {
        return null;
      }

      const targetContainerKey = getRequestContainerKey(projectId, folderId);
      if (requestPreviewTarget.containerKey !== targetContainerKey) {
        return null;
      }

      const sourceContainerKey = getRequestContainerKey(
        activeDragData.projectId,
        activeDragData.folderId,
      );
      if (sourceContainerKey === targetContainerKey) {
        return null;
      }

      return {
        request: activeDraggedRequest,
        beforeRequestId: requestPreviewTarget.overRequestId,
      };
    },
    [activeDragData, activeDraggedRequest, requestPreviewTarget],
  );

  useEffect(() => {
    if (!onEnsureWorkspaceTree || !projectPreviewTarget) {
      return;
    }

    const workspaceId = projectPreviewTarget.workspaceId;
    if (treeByWorkspace[workspaceId]) {
      return;
    }

    onEnsureWorkspaceTree(workspaceId).catch(() => undefined);
  }, [onEnsureWorkspaceTree, projectPreviewTarget, treeByWorkspace]);

  function renderRequestList(
    workspaceId: string,
    projectId: string,
    requests: RequestDoc[],
    folderId?: string | null,
  ) {
    const requestPreview = getRequestDropPreview(projectId, folderId);

    return (
      <>
        {requests.length > 0 ? (
          <ReorderableList
            items={sortByOrder(requests)}
            getItemData={(request) => ({
              kind: "request",
              workspaceId,
              projectId,
              folderId: folderId ?? null,
              requestId: request._id,
            })}
            renderItem={(request) => ({
              row: (dragHandle, isDragging) => (
                <div className="space-y-0.5">
                  {requestPreview?.beforeRequestId === request._id ? (
                    <RequestDropPlaceholder request={requestPreview.request} />
                  ) : null}
                  <div className="flex items-center gap-0.5">
                    {dragHandle}
                    <div className="min-w-0 flex-1">
                      <RequestItem
                        request={request}
                        activeRequestId={activeRequestId}
                        onSelectRequest={onSelectRequest}
                        onRenameRequest={onRenameRequest}
                        onDuplicateRequest={onDuplicateRequest}
                        onDeleteRequest={onDeleteRequest}
                        onTogglePrivacy={(requestId, isPrivate) =>
                          onToggleRequestPrivacy(workspaceId, requestId, isPrivate)
                        }
                        canManagePrivacy={canManagePrivacy}
                        isDragging={isDragging}
                        isDropTarget={isDropTarget("request", request._id)}
                      />
                    </div>
                  </div>
                </div>
              ),
            })}
          />
        ) : null}
        {requestPreview && !requestPreview.beforeRequestId ? (
          <DropPlaceholderTarget
            id={
              folderId
                ? `request-end:folder:${folderId}`
                : `request-end:project:${projectId}`
            }
            data={
              folderId
                ? {
                    kind: "folder-container",
                    workspaceId,
                    projectId,
                    folderId,
                  }
                : {
                    kind: "project",
                    workspaceId,
                    projectId,
                  }
            }
          >
            <RequestDropPlaceholder request={requestPreview.request} />
          </DropPlaceholderTarget>
        ) : null}
      </>
    );
  }

  function renderFolderList(
    workspaceId: string,
    projectId: string,
    folders: TreeFolder[],
    parentFolderId?: string | null,
  ) {
    const folderPreview = getFolderDropPreview(projectId, parentFolderId);

    return (
      <>
        {folders.length > 0 ? (
          <ReorderableList
            items={sortByOrder(folders)}
            getItemData={(folder) => ({
              kind: "folder",
              workspaceId,
              projectId,
              folderId: folder._id,
              parentFolderId: folder.parentFolderId ?? null,
            })}
            renderItem={(folder) => {
              const isExpandedFolder = expandedFolders[folder._id] ?? true;
              const isFolderDropTarget = isDropTarget("folder", folder._id);
              const folderRequestPreview = getRequestDropPreview(projectId, folder._id);
              const childFolderPreview = getFolderDropPreview(projectId, folder._id);

              return {
                row: (dragHandle, isDragging) => (
                  <div className="space-y-0.5">
                    {folderPreview?.beforeFolderId === folder._id ? (
                      <FolderDropPlaceholder folder={folderPreview.folder} />
                    ) : null}
                    <div
                      className={cn(
                        "group relative rounded-md transition",
                        isDragging
                          ? "pointer-events-none border border-dashed border-accent/35 bg-white/[0.04] pr-2"
                          : isFolderDropTarget
                            ? cn(
                                "bg-accent/10 ring-1 ring-inset ring-accent/55",
                                canManagePrivacy ? "pr-14" : "pr-7",
                              )
                            : cn(
                                canManagePrivacy ? "pr-14" : "pr-7",
                                "hover:bg-white/[0.03]",
                              ),
                      )}
                    >
                      <div className="flex items-center gap-0.5 px-1 py-0.5">
                        {dragHandle}
                        <button
                          className="rounded-md p-0.5 text-muted transition hover:bg-white/8 hover:text-foreground"
                          onClick={() =>
                            setExpandedFolders((state) => ({
                              ...state,
                              [folder._id]: !isExpandedFolder,
                            }))
                          }
                          type="button"
                          aria-label={
                            isExpandedFolder
                              ? "Collapse folder"
                              : "Expand folder"
                          }
                        >
                          {isExpandedFolder ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="shrink-0">
                            {isExpandedFolder ? (
                              <Folder className="h-3.5 w-3.5 text-amber-300" />
                            ) : (
                              <FolderClosed className="h-3.5 w-3.5 text-amber-300" />
                            )}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate text-[13px] leading-5 text-foreground"
                            title={folder.name}
                          >
                            {folder.name}
                          </span>
                        </div>
                      </div>
                      {!isDragging ? (
                        <ContextMenus
                          createActions={[
                            {
                              key: "new-folder",
                              label: "New Folder",
                              onClick: () => onCreateFolder(projectId, folder._id),
                            },
                            {
                              key: "new-request",
                              label: "New Request",
                              onClick: () => onCreateRequest(projectId, folder._id),
                            },
                          ]}
                          leadingAccessory={
                            canManagePrivacy ? (
                              <PrivacyToggleButton
                                isPrivate={folder.isPrivate}
                                label="folder"
                                onToggle={(isPrivate) =>
                                  onToggleFolderPrivacy(workspaceId, folder._id, isPrivate)
                                }
                              />
                            ) : null
                          }
                          onRename={() => onRenameFolder(folder._id)}
                          onDuplicate={() => onDuplicateFolder(folder._id)}
                          onDelete={() => onDeleteFolder(folder._id)}
                        />
                      ) : null}
                    </div>
                  </div>
                ),
                renderChildren: (isDragging) =>
                  (isExpandedFolder ||
                    Boolean(folderRequestPreview) ||
                    Boolean(childFolderPreview)) &&
                  !isDragging ? (
                    <DropPlaceholderTarget
                      id={`folder-container:${folder._id}`}
                      data={{
                        kind: "folder-container",
                        workspaceId,
                        projectId,
                        folderId: folder._id,
                      }}
                    >
                      <div className="ml-2 space-y-0.5 pl-1.5">
                        {renderRequestList(
                          workspaceId,
                          projectId,
                          folder.requests,
                          folder._id,
                        )}
                        {renderFolderList(
                          workspaceId,
                          projectId,
                          folder.folders,
                          folder._id,
                        )}
                        {childFolderPreview && !childFolderPreview.beforeFolderId ? (
                          <DropPlaceholderTarget
                            id={`folder-end:folder:${folder._id}`}
                            data={{
                              kind: "folder-container",
                              workspaceId,
                              projectId,
                              folderId: folder._id,
                            }}
                          >
                            <FolderDropPlaceholder folder={childFolderPreview.folder} />
                          </DropPlaceholderTarget>
                        ) : null}
                      </div>
                    </DropPlaceholderTarget>
                  ) : null,
              };
            }}
          />
        ) : null}
        {folderPreview && !folderPreview.beforeFolderId ? (
          <DropPlaceholderTarget
            id={
              parentFolderId
                ? `folder-end:folder:${parentFolderId}`
                : `folder-end:project:${projectId}`
            }
            data={
              parentFolderId
                ? {
                    kind: "folder-container",
                    workspaceId,
                    projectId,
                    folderId: parentFolderId,
                  }
                : {
                    kind: "project",
                    workspaceId,
                    projectId,
                  }
            }
          >
            <FolderDropPlaceholder folder={folderPreview.folder} />
          </DropPlaceholderTarget>
        ) : null}
      </>
    );
  }

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="px-3 py-2">
        <div className="flex w-full items-center justify-between gap-2">
          <CardTitle>Collections</CardTitle>
          {canCreateWorkspace ? (
            <Button
              className="h-7 rounded-md px-2 text-xs"
              onClick={onCreateWorkspace}
            >
              <Plus className="h-3.5 w-3.5" />
              Workspace
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="overflow-y-auto p-1.5 pl-4">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={() => {
            setActiveDragData(null);
            setDropTarget(null);
          }}
          onDragEnd={handleDragEnd}
        >
          <ReorderableList
            items={workspaceList}
            getItemData={(workspace) => ({
              kind: "workspace",
              workspaceId: workspace._id,
            })}
            renderItem={(workspace) => {
              const isActiveWorkspace = workspace._id === activeWorkspaceId;
              const workspaceProjects = projectsByWorkspace[workspace._id] ?? [];
              const workspaceProjectPreview = getProjectDropPreview(workspace._id);
              const isExpandedWorkspace = isActiveWorkspace;
              const isWorkspaceDropTarget = isDropTarget("workspace", workspace._id);

              return {
                row: (dragHandle, isDragging) => (
                  <div
                    className={cn(
                      "group relative rounded-md transition",
                      isDragging
                        ? "pointer-events-none border border-dashed border-accent/35 bg-white/[0.04] pr-2"
                        : isWorkspaceDropTarget
                          ? "bg-accent/10 pr-7 ring-1 ring-inset ring-accent/55"
                          : isActiveWorkspace
                            ? "bg-white/[0.05] pr-7"
                            : "pr-7 hover:bg-white/[0.03]",
                    )}
                  >
                    <div className="flex items-center gap-0.5 px-1 py-0.5">
                      {dragHandle}
                      <button
                        className="rounded-md p-0.5 text-muted transition hover:bg-white/8 hover:text-foreground"
                        onClick={() => onSelectWorkspace(workspace._id)}
                        type="button"
                        aria-label={
                          isExpandedWorkspace
                            ? "Collapse workspace"
                            : "Expand workspace"
                        }
                      >
                        {isExpandedWorkspace ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onSelectWorkspace(workspace._id)}
                        type="button"
                      >
                        <TreeNodeContent
                          icon={<Layers3 className="h-3.5 w-3.5 text-accent" />}
                          name={workspace.name}
                        />
                      </button>
                    </div>
                    {!isDragging ? (
                      <ContextMenus
                        createActions={
                          canCreateProject
                            ? [
                                {
                                  key: "new-project",
                                  label: "New Project",
                                  onClick: () => onCreateProject(workspace._id),
                                },
                              ]
                            : undefined
                        }
                        customActions={
                          canCreateProject
                            ? [
                                {
                                  key: "import-postman",
                                  label: "Import Postman",
                                  icon: FileUp,
                                  onClick: () => onImportPostman(workspace._id),
                                },
                              ]
                            : undefined
                        }
                        onRename={() => onRenameWorkspace(workspace._id)}
                        onDuplicate={() => onDuplicateWorkspace(workspace._id)}
                        onDelete={() => onDeleteWorkspace(workspace._id)}
                      />
                    ) : null}
                  </div>
                ),
                renderChildren: (isDragging) =>
                  (isExpandedWorkspace || Boolean(workspaceProjectPreview)) && !isDragging ? (
                    <div className="ml-2 space-y-0.5 pl-1.5">
                      <ReorderableList
                        items={workspaceProjects}
                        getItemData={(project) => ({
                          kind: "project",
                          workspaceId: workspace._id,
                          projectId: project._id,
                        })}
                        renderItem={(project) => {
                          const isExpandedProject =
                            expandedProjects[project._id] ??
                            project._id === activeProjectId;
                          const isProjectDropTarget = isDropTarget("project", project._id);
                          const projectRequestPreview = getRequestDropPreview(project._id);
                          const projectFolderPreview = getFolderDropPreview(project._id, null);

                          return {
                            row: (dragHandle, isDragging) => (
                              <div className="space-y-0.5">
                                {workspaceProjectPreview?.beforeProjectId === project._id ? (
                                  <ProjectDropPlaceholder project={workspaceProjectPreview.project} />
                                ) : null}
                                <div
                                  className={cn(
                                    "group relative rounded-md transition",
                                    isDragging
                                      ? "pointer-events-none border border-dashed border-accent/35 bg-white/[0.04] pr-2"
                                      : isProjectDropTarget
                                        ? cn(
                                            "bg-accent/10 ring-1 ring-inset ring-accent/55",
                                            canManagePrivacy ? "pr-14" : "pr-7",
                                          )
                                        : project._id === activeProjectId
                                          ? cn(
                                              "bg-white/[0.05]",
                                              canManagePrivacy ? "pr-14" : "pr-7",
                                            )
                                          : cn(
                                              canManagePrivacy ? "pr-14" : "pr-7",
                                              "hover:bg-white/[0.03]",
                                            ),
                                  )}
                                >
                                  <div className="flex items-center gap-0.5 px-1 py-0.5">
                                    {dragHandle}
                                    <button
                                      className="rounded-md p-0.5 text-muted transition hover:bg-white/8 hover:text-foreground"
                                      onClick={() =>
                                        setExpandedProjects((state) => ({
                                          ...state,
                                          [project._id]: !isExpandedProject,
                                        }))
                                      }
                                      type="button"
                                      aria-label={
                                        isExpandedProject
                                          ? "Collapse project"
                                          : "Expand project"
                                      }
                                    >
                                      {isExpandedProject ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                      <span className="shrink-0">
                                        <Workflow className="h-3.5 w-3.5 text-sky-300" />
                                      </span>
                                      <button
                                        className={cn(
                                          "min-w-0 flex-1 truncate text-left text-[13px] leading-5 text-foreground",
                                          project._id === activeProjectId && "font-medium",
                                        )}
                                        onClick={() => {
                                          setExpandedProjects((state) => ({
                                            ...state,
                                            [project._id]: true,
                                          }));
                                          onSelectProject(project._id);
                                        }}
                                        type="button"
                                        title={project.name}
                                      >
                                        {project.name}
                                      </button>
                                    </div>
                                  </div>
                                  {!isDragging ? (
                                    <ContextMenus
                                      createActions={[
                                        {
                                          key: "new-folder",
                                          label: "New Folder",
                                          onClick: () => onCreateFolder(project._id),
                                        },
                                        {
                                          key: "new-request",
                                          label: "New Request",
                                          onClick: () => onCreateRequest(project._id),
                                        },
                                      ]}
                                      leadingAccessory={
                                        canManagePrivacy ? (
                                          <PrivacyToggleButton
                                            isPrivate={project.isPrivate}
                                            label="project"
                                            onToggle={(isPrivate) =>
                                              onToggleProjectPrivacy(
                                                workspace._id,
                                                project._id,
                                                isPrivate,
                                              )
                                            }
                                          />
                                        ) : null
                                      }
                                      onRename={() => onRenameProject(project._id)}
                                      onDuplicate={() => onDuplicateProject(project._id)}
                                      onDelete={() => onDeleteProject(project._id)}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            ),
                            renderChildren: (isDragging) =>
                              (isExpandedProject ||
                                Boolean(projectRequestPreview) ||
                                Boolean(projectFolderPreview)) &&
                              !isDragging ? (
                                <div className="ml-2 space-y-0.5 pl-1.5">
                                  {renderRequestList(
                                    workspace._id,
                                    project._id,
                                    project.requests,
                                    null,
                                  )}
                                  {renderFolderList(
                                    workspace._id,
                                    project._id,
                                    project.folders,
                                    null,
                                  )}
                                  {projectFolderPreview && !projectFolderPreview.beforeFolderId ? (
                                    <DropPlaceholderTarget
                                      id={`folder-end:project:${project._id}`}
                                      data={{
                                        kind: "project",
                                        workspaceId: workspace._id,
                                        projectId: project._id,
                                      }}
                                    >
                                      <FolderDropPlaceholder folder={projectFolderPreview.folder} />
                                    </DropPlaceholderTarget>
                                  ) : null}
                                </div>
                              ) : null,
                          };
                        }}
                      />
                      {workspaceProjectPreview && !workspaceProjectPreview.beforeProjectId ? (
                        <DropPlaceholderTarget
                          id={`project-end:workspace:${workspace._id}`}
                          data={{ kind: "workspace", workspaceId: workspace._id }}
                        >
                          <ProjectDropPlaceholder project={workspaceProjectPreview.project} />
                        </DropPlaceholderTarget>
                      ) : null}
                    </div>
                  ) : null,
              };
            }}
          />
        </DndContext>
      </CardContent>
    </Card>
  );
}







