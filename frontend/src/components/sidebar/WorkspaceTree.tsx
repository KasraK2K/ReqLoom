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
  Send,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ContextMenus } from "./ContextMenus";
import { LockIcon } from "./LockIcon";

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
  onUnlockWorkspace: (workspaceId: string) => void;
  onUnlockProject: (projectId: string) => void;
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
    <div ref={setNodeRef} style={style} className="group flex items-start gap-1.5">
      <button
        className="mt-2 rounded-md p-1 text-muted/70 transition hover:bg-white/8 hover:text-foreground"
        {...attributes}
        {...listeners}
        type="button"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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
        <div className="space-y-1.5">
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
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div
          className="break-words text-sm font-medium leading-5 text-foreground"
          title={name}
        >
          {name}
        </div>
        {meta ? <div className="mt-0.5 text-xs text-muted">{meta}</div> : null}
      </div>
      {accessory ? <div className="mt-0.5 shrink-0">{accessory}</div> : null}
    </div>
  );
}

function RequestItem({
  request,
  activeRequestId,
  onSelectRequest,
  onDuplicateRequest,
  onDeleteRequest,
}: {
  request: RequestDoc;
  activeRequestId?: string;
  onSelectRequest: (requestId: string) => void;
  onDuplicateRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-lg px-2 py-1.5 transition",
        activeRequestId === request._id
          ? "bg-accent/12"
          : "hover:bg-white/[0.05]",
      )}
    >
      <div className="flex items-start gap-2 pr-10">
        <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onSelectRequest(request._id)}
          type="button"
          title={request.name}
        >
          <span className="block break-words text-sm leading-5 text-foreground">
            {request.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{request.method}</span>
        </button>
      </div>
      <ContextMenus
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
    onUnlockWorkspace,
    onUnlockProject,
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
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Workspace Tree</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Workspaces, collections, folders, and requests.
            </p>
          </div>
          <Button className="h-9 shrink-0" onClick={onCreateWorkspace}>
            <Plus className="h-4 w-4" />
            Workspace
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 overflow-y-auto p-3">
        <ReorderableList
          items={workspaceList}
          onReorder={onWorkspaceReorder}
          renderItem={(workspace) => {
            const isActiveWorkspace = workspace._id === activeWorkspaceId;
            const activeWorkspaceTree = isActiveWorkspace ? tree : undefined;
            const isExpandedWorkspace = Boolean(activeWorkspaceTree);
            const workspaceMeta = activeWorkspaceTree
              ? formatCount(activeWorkspaceTree.projects.length, "project")
              : "Select to load projects";

            return (
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
                <div
                  className={cn(
                    "group relative rounded-lg px-2 py-2 transition",
                    isActiveWorkspace ? "bg-accent/10" : "hover:bg-white/[0.05]",
                  )}
                >
                  <div className="flex items-start gap-2 pr-10">
                    <button
                      className="mt-0.5 rounded-md p-1 text-muted transition hover:bg-white/8 hover:text-foreground"
                      onClick={() => onSelectWorkspace(workspace._id)}
                      type="button"
                    >
                      {isExpandedWorkspace ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        if (workspace.isPasswordProtected) {
                          onUnlockWorkspace(workspace._id);
                          return;
                        }
                        onSelectWorkspace(workspace._id);
                      }}
                      type="button"
                    >
                      <TreeNodeContent
                        icon={<Layers3 className="h-4 w-4 text-accent" />}
                        name={workspace.name}
                        meta={workspaceMeta}
                        accessory={
                          workspace.isPasswordProtected ? (
                            <LockIcon locked={workspace.isPasswordProtected} />
                          ) : null
                        }
                      />
                    </button>
                  </div>
                  <ContextMenus
                    onCreate={isActiveWorkspace ? onCreateProject : undefined}
                    onDuplicate={() => onDuplicateWorkspace(workspace._id)}
                    onDelete={() => onDeleteWorkspace(workspace._id)}
                  />
                </div>
                {isExpandedWorkspace ? (
                  <div className="mt-2 space-y-2 border-l border-white/10 pl-3">
                    <ReorderableList
                      items={[...(activeWorkspaceTree?.projects ?? [])].sort((a, b) => a.order - b.order)}
                      onReorder={onProjectReorder}
                      renderItem={(project) => {
                        const isExpandedProject =
                          expandedProjects[project._id] ?? project._id === activeProjectId;
                        const requestCount =
                          project.requests.length +
                          project.folders.reduce(
                            (total, folder) => total + folder.requests.length,
                            0,
                          );
                        const projectMeta = [
                          formatCount(project.folders.length, "folder"),
                          formatCount(requestCount, "request"),
                        ].join(" • ");

                        return (
                          <div className="rounded-lg border border-white/8 bg-slate-950/30 p-2.5">
                            <div
                              className={cn(
                                "group relative rounded-lg px-2 py-2 transition",
                                project._id === activeProjectId
                                  ? "bg-white/[0.06]"
                                  : "hover:bg-white/[0.05]",
                              )}
                            >
                              <div className="flex items-start gap-2 pr-10">
                                <button
                                  className="mt-0.5 rounded-md p-1 text-muted transition hover:bg-white/8 hover:text-foreground"
                                  onClick={() =>
                                    setExpandedProjects((state) => ({
                                      ...state,
                                      [project._id]: !isExpandedProject,
                                    }))
                                  }
                                  type="button"
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
                                    if (project.isPasswordProtected) {
                                      onUnlockProject(project._id);
                                      return;
                                    }
                                    onSelectProject(project._id);
                                  }}
                                  type="button"
                                >
                                  <TreeNodeContent
                                    icon={<Workflow className="h-4 w-4 text-sky-300" />}
                                    name={project.name}
                                    meta={projectMeta}
                                    accessory={
                                      project.isPasswordProtected ? (
                                        <LockIcon locked={project.isPasswordProtected} />
                                      ) : null
                                    }
                                  />
                                </button>
                              </div>
                              <ContextMenus
                                onCreate={() => onCreateRequest(project._id)}
                                onDuplicate={() => onDuplicateProject(project._id)}
                                onDelete={() => onDeleteProject(project._id)}
                              />
                            </div>
                            {isExpandedProject ? (
                              <div className="mt-2 space-y-1.5 border-l border-white/8 pl-3">
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
                                      <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
                                        <div className="group relative rounded-lg px-2 py-2 transition hover:bg-white/[0.05]">
                                          <div className="flex items-start gap-2 pr-10">
                                            <button
                                              className="mt-0.5 rounded-md p-1 text-muted transition hover:bg-white/8 hover:text-foreground"
                                              onClick={() =>
                                                setExpandedFolders((state) => ({
                                                  ...state,
                                                  [folder._id]: !isExpandedFolder,
                                                }))
                                              }
                                              type="button"
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
                                                    <Folder className="h-4 w-4 text-amber-300" />
                                                  ) : (
                                                    <FolderClosed className="h-4 w-4 text-amber-300" />
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
                                            onDuplicate={() =>
                                              onDuplicateFolder(folder._id)
                                            }
                                            onDelete={() => onDeleteFolder(folder._id)}
                                          />
                                        </div>
                                        {isExpandedFolder ? (
                                          <div className="mt-2 space-y-1.5 border-l border-white/8 pl-3">
                                            {folder.requests.map((request) => (
                                              <RequestItem
                                                key={request._id}
                                                request={request}
                                                activeRequestId={activeRequestId}
                                                onSelectRequest={onSelectRequest}
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
                                  className="w-full justify-start rounded-lg border border-dashed border-white/10 bg-white/[0.03] py-2 text-foreground hover:bg-white/[0.07]"
                                  onClick={() => onCreateFolder(project._id)}
                                >
                                  <Plus className="h-4 w-4" />
                                  Add Folder
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


