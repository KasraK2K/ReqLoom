import type { ReactNode } from "react";
import type {
  RequestDoc,
  WorkspaceMeta,
  WorkspaceTree as WorkspaceTreeModel,
} from "@restify/shared";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ContextMenus } from "./ContextMenus";

type SortableItem = { _id: string };

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
  onRequestReorder: (orderedIds: string[]) => void;
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        className="absolute -left-3 top-1 rounded-md p-0.5 text-muted/60 opacity-0 transition hover:bg-white/8 hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Reorder item"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReorderableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item._id === active.id);
    const newIndex = items.findIndex((item) => item._id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item._id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item._id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0.5">
          {items.map((item) => (
            <SortableRow key={item._id} id={item._id}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
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

function RequestItem({
  request,
  activeRequestId,
  onSelectRequest,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
}: {
  request: RequestDoc;
  activeRequestId?: string;
  onSelectRequest: (requestId: string) => void;
  onRenameRequest: (requestId: string) => void;
  onDuplicateRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-md pr-7 transition",
        activeRequestId === request._id
          ? "bg-accent/10"
          : "hover:bg-white/[0.035]",
      )}
    >
      <div className="flex items-center gap-1.5 px-1 py-0.5">
        <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">
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
      <ContextMenus
        onRename={() => onRenameRequest(request._id)}
        onDuplicate={() => onDuplicateRequest(request._id)}
        onDelete={() => onDeleteRequest(request._id)}
      />
    </div>
  );
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
    onRequestReorder,
  } = props;

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    {},
  );

  const workspaceList = useMemo(
    () => [...workspaces].sort((a, b) => a.order - b.order),
    [workspaces],
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
      <CardContent className="space-y-1 overflow-y-auto p-1.5 pl-4">
        <ReorderableList
          items={workspaceList}
          onReorder={onWorkspaceReorder}
          renderItem={(workspace) => {
            const isActiveWorkspace = workspace._id === activeWorkspaceId;
            const activeWorkspaceTree = isActiveWorkspace ? tree : undefined;
            const isExpandedWorkspace = Boolean(activeWorkspaceTree);
            const workspaceMeta = activeWorkspaceTree
              ? formatCount(activeWorkspaceTree.projects.length, "project")
              : "Open";

            return (
              <div className="space-y-0.5">
                <div
                  className={cn(
                    "group relative rounded-md pr-7 transition",
                    isActiveWorkspace
                      ? "bg-white/[0.05]"
                      : "hover:bg-white/[0.03]",
                  )}
                >
                  <div className="flex items-center gap-0.5 px-1 py-0.5">
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
                  <ContextMenus
                    onCreate={isActiveWorkspace ? onCreateProject : undefined}
                    onRename={() => onRenameWorkspace(workspace._id)}
                    onDuplicate={() => onDuplicateWorkspace(workspace._id)}
                    onDelete={() => onDeleteWorkspace(workspace._id)}
                  />
                </div>
                {isExpandedWorkspace ? (
                  <div className="ml-2 space-y-0.5 pl-1.5">
                    <ReorderableList
                      items={[...(activeWorkspaceTree?.projects ?? [])].sort(
                        (a, b) => a.order - b.order,
                      )}
                      onReorder={onProjectReorder}
                      renderItem={(project) => {
                        const isExpandedProject =
                          expandedProjects[project._id] ??
                          project._id === activeProjectId;
                        const requestCount =
                          project.requests.length +
                          project.folders.reduce(
                            (total, folder) => total + folder.requests.length,
                            0,
                          );
                        const projectMeta = `${project.folders.length} fld | ${requestCount} req`;

                        return (
                          <div className="space-y-0.5">
                            <div
                              className={cn(
                                "group relative rounded-md pr-7 transition",
                                project._id === activeProjectId
                                  ? "bg-white/[0.05]"
                                  : "hover:bg-white/[0.03]",
                              )}
                            >
                              <div className="flex items-center gap-0.5 px-1 py-0.5">
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
                                    icon={<Workflow className="h-3.5 w-3.5 text-sky-300" />}
                                    name={project.name}
                                    meta={projectMeta}
                                  />
                                </button>
                              </div>
                              <ContextMenus
                                onCreate={() => onCreateRequest(project._id)}
                                onRename={() => onRenameProject(project._id)}
                                onDuplicate={() => onDuplicateProject(project._id)}
                                onDelete={() => onDeleteProject(project._id)}
                              />
                            </div>
                            {isExpandedProject ? (
                              <div className="ml-2 space-y-0.5 pl-1.5">
                                {project.requests.length > 0 ? (
                                  <ReorderableList
                                    items={[...project.requests].sort(
                                      (a, b) => a.order - b.order,
                                    )}
                                    onReorder={onRequestReorder}
                                    renderItem={(request) => (
                                      <RequestItem
                                        request={request}
                                        activeRequestId={activeRequestId}
                                        onSelectRequest={onSelectRequest}
                                        onRenameRequest={onRenameRequest}
                                        onDuplicateRequest={onDuplicateRequest}
                                        onDeleteRequest={onDeleteRequest}
                                      />
                                    )}
                                  />
                                ) : null}
                                <ReorderableList
                                  items={[...project.folders].sort(
                                    (a, b) => a.order - b.order,
                                  )}
                                  onReorder={(orderedIds) =>
                                    onFolderReorder(project._id, orderedIds)
                                  }
                                  renderItem={(folder) => {
                                    const isExpandedFolder =
                                      expandedFolders[folder._id] ?? true;

                                    return (
                                      <div className="space-y-0.5">
                                        <div className="group relative rounded-md pr-7 transition hover:bg-white/[0.03]">
                                          <div className="flex items-center gap-0.5 px-1 py-0.5">
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
                                        </div>
                                        {isExpandedFolder ? (
                                          <div className="ml-2 space-y-0.5 pl-1.5">
                                            {folder.requests.map((request) => (
                                              <RequestItem
                                                key={request._id}
                                                request={request}
                                                activeRequestId={activeRequestId}
                                                onSelectRequest={onSelectRequest}
                                                onRenameRequest={onRenameRequest}
                                                onDuplicateRequest={onDuplicateRequest}
                                                onDeleteRequest={onDeleteRequest}
                                              />
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
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
                            ) : null}
                          </div>
                        );
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          }}
        />
      </CardContent>
    </Card>
  );
}
