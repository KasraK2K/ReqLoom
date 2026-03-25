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
  GripVertical,
  Layers3,
  Plus,
  Workflow,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { METHOD_TEXT_STYLES } from "../../lib/methods";
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
}

interface DropTargetState {
  id: string;
  data: TreeDragData;
}

interface WorkspaceTreeProps {
  workspaces: WorkspaceMeta[];
  tree?: WorkspaceTreeModel;
  activeWorkspaceId?: string;
  activeProjectId?: string;
  activeRequestId?: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectRequest: (requestId: string) => void;
  onCreateWorkspace: () => void;
  onCreateProject: () => void;
  onCreateFolder: (projectId: string) => void;
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
  onWorkspaceReorder: (orderedIds: string[]) => void;
  onProjectReorder: (orderedIds: string[]) => void;
  onFolderReorder: (projectId: string, orderedIds: string[]) => void;
  onMoveProject: (payload: ProjectMovePayload) => void;
  onMoveRequest: (payload: RequestMovePayload) => void;
}

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function normalizeFolderId(folderId?: string | null) {
  return folderId ?? null;
}

function getRequestContainerKey(projectId: string, folderId?: string | null) {
  const normalizedFolderId = normalizeFolderId(folderId);
  return normalizedFolderId
    ? `folder:${normalizedFolderId}`
    : `project:${projectId}:root`;
}

function getDragEntityId(data: TreeDragData) {
  switch (data.kind) {
    case "workspace":
      return data.workspaceId;
    case "project":
      return data.projectId;
    case "folder":
      return data.folderId;
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
      className="flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted/60 transition hover:bg-white/8 hover:text-foreground active:cursor-grabbing touch-none"
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
        className={cn("will-change-transform", isDragging && "z-30 opacity-45")}
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


function RequestDropPlaceholder({ request }: { request: RequestDoc }) {
  return (
    <div className="ml-5 rounded-md border border-dashed border-accent/45 bg-accent/8 px-2 py-1">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "w-10 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]",
            METHOD_TEXT_STYLES[request.method],
          )}
        >
          {request.method}
        </span>
        <span className="truncate text-[12px] text-accent/90">{request.name}</span>
      </div>
    </div>
  );
}

function RequestItem({
  request,
  activeRequestId,
  onSelectRequest,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
  isDragging = false,
  isDropTarget = false,
}: {
  request: RequestDoc;
  activeRequestId?: string;
  onSelectRequest: (requestId: string) => void;
  onRenameRequest: (requestId: string) => void;
  onDuplicateRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
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
            ? "bg-accent/10 pr-7 ring-1 ring-inset ring-accent/55"
            : activeRequestId === request._id
              ? "bg-accent/10 pr-7"
              : "pr-7 hover:bg-white/[0.035]",
      )}
    >
      <div className="flex items-center gap-1.5 px-1 py-0.5">
        <span
          className={cn(
            "w-10 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]",
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
    tree,
    activeWorkspaceId,
    activeProjectId,
    activeRequestId,
    onSelectWorkspace,
    onSelectProject,
    onSelectRequest,
    onCreateWorkspace,
    onCreateProject,
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
    onWorkspaceReorder,
    onProjectReorder,
    onFolderReorder,
    onMoveProject,
    onMoveRequest,
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    {},
  );
  const [activeDragData, setActiveDragData] = useState<TreeDragData | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

  const workspaceList = useMemo(
    () => [...workspaces].sort((a, b) => a.order - b.order),
    [workspaces],
  );

  const activeProjects = useMemo(() => sortByOrder(tree?.projects ?? []), [tree]);

  const foldersByProject = useMemo(() => {
    const map: Record<string, TreeFolder[]> = {};
    activeProjects.forEach((project) => {
      map[project._id] = sortByOrder(project.folders);
    });
    return map;
  }, [activeProjects]);

  const requestById = useMemo(() => {
    const map: Record<string, RequestDoc> = {};

    activeProjects.forEach((project) => {
      project.requests.forEach((request) => {
        map[request._id] = request;
      });
      project.folders.forEach((folder) => {
        folder.requests.forEach((request) => {
          map[request._id] = request;
        });
      });
    });

    return map;
  }, [activeProjects]);
  const requestContainerIds = useMemo(() => {
    const containers: Record<string, string[]> = {};

    activeProjects.forEach((project) => {
      containers[getRequestContainerKey(project._id)] = sortByOrder(
        project.requests,
      ).map((request) => request._id);

      project.folders.forEach((folder) => {
        containers[getRequestContainerKey(project._id, folder._id)] = sortByOrder(
          folder.requests,
        ).map((request) => request._id);
      });
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
      if (
        overData.kind === "project" &&
        activeData.workspaceId === overData.workspaceId
      ) {
        const orderedIds = reorderIds(
          activeProjects,
          activeData.projectId,
          overData.projectId,
        );
        if (orderedIds) {
          onProjectReorder(orderedIds);
        }
        return;
      }

      if (
        overData.kind === "workspace" &&
        activeData.workspaceId !== overData.workspaceId
      ) {
        onMoveProject({
          projectId: activeData.projectId,
          sourceWorkspaceId: activeData.workspaceId,
          targetWorkspaceId: overData.workspaceId,
        });
      }
      return;
    }
    if (activeData.kind === "folder" && overData.kind === "folder") {
      if (activeData.projectId !== overData.projectId) {
        return;
      }

      const projectFolders = foldersByProject[activeData.projectId] ?? [];
      const orderedIds = reorderIds(
        projectFolders,
        activeData.folderId,
        overData.folderId,
      );
      if (orderedIds) {
        onFolderReorder(activeData.projectId, orderedIds);
      }
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


  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="px-3 py-2">
        <div className="flex w-full items-center justify-between gap-2">
          <CardTitle>Collections</CardTitle>
          <Button
            className="h-7 rounded-md px-2 text-xs"
            onClick={onCreateWorkspace}
          >
            <Plus className="h-3.5 w-3.5" />
            Workspace
          </Button>
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
              const activeWorkspaceTree = isActiveWorkspace ? tree : undefined;
              const isExpandedWorkspace = Boolean(activeWorkspaceTree);
              const isWorkspaceDropTarget = isDropTarget("workspace", workspace._id);
              const workspaceMeta = activeWorkspaceTree
                ? formatCount(activeWorkspaceTree.projects.length, "project")
                : "Open";

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
                          meta={workspaceMeta}
                        />
                      </button>
                    </div>
                    {!isDragging ? (
                      <ContextMenus
                        onCreate={isActiveWorkspace ? onCreateProject : undefined}
                        onRename={() => onRenameWorkspace(workspace._id)}
                        onDuplicate={() => onDuplicateWorkspace(workspace._id)}
                        onDelete={() => onDeleteWorkspace(workspace._id)}
                      />
                    ) : null}
                  </div>
                ),
                renderChildren: (isDragging) => isExpandedWorkspace && !isDragging ? (
                  <div className="ml-2 space-y-0.5 pl-1.5">
                    <ReorderableList
                      items={activeProjects}
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
                        const requestCount =
                          project.requests.length +
                          project.folders.reduce(
                            (total, folder) => total + folder.requests.length,
                            0,
                          );
                        const projectMeta = `${project.folders.length} fld | ${requestCount} req`;

                        return {
                          row: (dragHandle, isDragging) => (
                            <div
                              className={cn(
                                "group relative rounded-md transition",
                                isDragging
                                  ? "pointer-events-none border border-dashed border-accent/35 bg-white/[0.04] pr-2"
                                  : isProjectDropTarget
                                    ? "bg-accent/10 pr-7 ring-1 ring-inset ring-accent/55"
                                    : project._id === activeProjectId
                                      ? "bg-white/[0.05] pr-7"
                                      : "pr-7 hover:bg-white/[0.03]",
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
                                <button
                                  className="min-w-0 flex-1 text-left"
                                  onClick={() => {
                                    setExpandedProjects((state) => ({
                                      ...state,
                                      [project._id]: true,
                                    }));
                                    onSelectProject(project._id);
                                  }}
                                  type="button"
                                >
                                  <TreeNodeContent
                                    icon={
                                      <Workflow className="h-3.5 w-3.5 text-sky-300" />
                                    }
                                    name={project.name}
                                    meta={projectMeta}
                                  />
                                </button>
                              </div>
                              {!isDragging ? (
                                <ContextMenus
                                  onCreate={() => onCreateRequest(project._id)}
                                  onRename={() => onRenameProject(project._id)}
                                  onDuplicate={() => onDuplicateProject(project._id)}
                                  onDelete={() => onDeleteProject(project._id)}
                                />
                              ) : null}
                            </div>
                          ),
                          renderChildren: (isDragging) =>
                            (isExpandedProject || Boolean(projectRequestPreview)) && !isDragging ? (
                              <div className="ml-2 space-y-0.5 pl-1.5">
                                {project.requests.length > 0 ? (
                                  <ReorderableList
                                    items={sortByOrder(project.requests)}
                                    getItemData={(request) => ({
                                      kind: "request",
                                      workspaceId: workspace._id,
                                      projectId: project._id,
                                      folderId: null,
                                      requestId: request._id,
                                    })}
                                    renderItem={(request) => ({
                                      row: (dragHandle, isDragging) => (
                                        <div className="space-y-0.5">
                                          {projectRequestPreview?.beforeRequestId === request._id ? (
                                            <RequestDropPlaceholder
                                              request={projectRequestPreview.request}
                                            />
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
                                {projectRequestPreview && !projectRequestPreview.beforeRequestId ? (
                                  <RequestDropPlaceholder request={projectRequestPreview.request} />
                                ) : null}
                                <ReorderableList
                                  items={foldersByProject[project._id] ?? []}
                                getItemData={(folder) => ({
                                  kind: "folder",
                                  workspaceId: workspace._id,
                                  projectId: project._id,
                                  folderId: folder._id,
                                })}
                                renderItem={(folder) => {
                                  const isExpandedFolder =
                                    expandedFolders[folder._id] ?? true;
                                  const isFolderDropTarget = isDropTarget("folder", folder._id);
                                  const folderRequestPreview = getRequestDropPreview(
                                    project._id,
                                    folder._id,
                                  );

                                  return {
                                    row: (dragHandle, isDragging) => (
                                      <div
                                        className={cn(
                                          "group relative rounded-md transition",
                                          isDragging
                                            ? "pointer-events-none border border-dashed border-accent/35 bg-white/[0.04] pr-2"
                                            : isFolderDropTarget
                                              ? "bg-accent/10 pr-7 ring-1 ring-inset ring-accent/55"
                                              : "pr-7 hover:bg-white/[0.03]",
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
                                          <div className="min-w-0 flex-1">
                                            <TreeNodeContent
                                              icon={
                                                isExpandedFolder ? (
                                                  <Folder className="h-3.5 w-3.5 text-amber-300" />
                                                ) : (
                                                  <FolderClosed className="h-3.5 w-3.5 text-amber-300" />
                                                )
                                              }
                                              name={folder.name}
                                              meta={formatCount(
                                                folder.requests.length,
                                                "request",
                                              )}
                                            />
                                          </div>
                                        </div>
                                        {!isDragging ? (
                                          <ContextMenus
                                            onCreate={() =>
                                              onCreateRequest(project._id, folder._id)
                                            }
                                            onRename={() => onRenameFolder(folder._id)}
                                            onDuplicate={() =>
                                              onDuplicateFolder(folder._id)
                                            }
                                            onDelete={() => onDeleteFolder(folder._id)}
                                          />
                                        ) : null}
                                      </div>
                                    ),
                                    renderChildren: (isDragging) =>
                                      (isExpandedFolder || Boolean(folderRequestPreview)) && !isDragging ? (
                                        <div className="ml-2 space-y-0.5 pl-1.5">
                                          {folder.requests.length > 0 ? (
                                            <ReorderableList
                                              items={sortByOrder(folder.requests)}
                                              getItemData={(request) => ({
                                                kind: "request",
                                                workspaceId: workspace._id,
                                                projectId: project._id,
                                                folderId: folder._id,
                                                requestId: request._id,
                                              })}
                                              renderItem={(request) => ({
                                                row: (dragHandle, isDragging) => (
                                                  <div className="space-y-0.5">
                                                    {folderRequestPreview?.beforeRequestId === request._id ? (
                                                      <RequestDropPlaceholder
                                                        request={folderRequestPreview.request}
                                                      />
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
                                          {folderRequestPreview && !folderRequestPreview.beforeRequestId ? (
                                            <RequestDropPlaceholder request={folderRequestPreview.request} />
                                          ) : null}
                                        </div>
                                      ) : null,
                                  };
                                }}
                              />
                              <Button
                                variant="ghost"
                                className="h-6 w-full justify-start rounded-md px-1.5 text-[12px] text-muted hover:bg-white/[0.04] hover:text-foreground"
                                onClick={() => onCreateFolder(project._id)}
                              >
                                <Plus className="h-3 w-3" />
                                Add folder
                              </Button>
                            </div>
                          ) : null,
                        };
                      }}
                    />
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
