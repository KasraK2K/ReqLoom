import type { FolderTree, RequestDoc, WorkspaceTree } from "@restify/shared";

type TreeProject = WorkspaceTree["projects"][number];

type TreeFolder = FolderTree;

export function flattenFolders(folders: TreeFolder[]): TreeFolder[] {
  return folders.flatMap((folder) => [folder, ...flattenFolders(folder.folders)]);
}

export function flattenProjectRequests(project: TreeProject): RequestDoc[] {
  return [
    ...project.requests,
    ...flattenFolders(project.folders).flatMap((folder) => folder.requests),
  ];
}

export function getFirstFolderRequestId(folders: TreeFolder[]): string | undefined {
  for (const folder of folders) {
    if (folder.requests[0]?._id) {
      return folder.requests[0]._id;
    }

    const nestedRequestId = getFirstFolderRequestId(folder.folders);
    if (nestedRequestId) {
      return nestedRequestId;
    }
  }

  return undefined;
}

export function getFirstProjectRequestId(project?: TreeProject): string | undefined {
  if (!project) {
    return undefined;
  }

  return project.requests[0]?._id ?? getFirstFolderRequestId(project.folders);
}

export function findFolderInProject(
  project: TreeProject,
  folderId: string,
): TreeFolder | undefined {
  const walk = (folders: TreeFolder[]): TreeFolder | undefined => {
    for (const folder of folders) {
      if (folder._id === folderId) {
        return folder;
      }

      const nestedFolder = walk(folder.folders);
      if (nestedFolder) {
        return nestedFolder;
      }
    }

    return undefined;
  };

  return walk(project.folders);
}

export function findFolderInTree(
  tree: WorkspaceTree | undefined,
  folderId: string,
): { project: TreeProject; folder: TreeFolder } | null {
  if (!tree) {
    return null;
  }

  for (const project of tree.projects) {
    const folder = findFolderInProject(project, folderId);
    if (folder) {
      return { project, folder };
    }
  }

  return null;
}

export function findRequestInProject(
  project: TreeProject,
  requestId: string,
): RequestDoc | undefined {
  return flattenProjectRequests(project).find((request) => request._id === requestId);
}

export function findRequestInTree(
  tree: WorkspaceTree | undefined,
  requestId: string,
): { project: TreeProject; request: RequestDoc } | null {
  if (!tree) {
    return null;
  }

  for (const project of tree.projects) {
    const request = findRequestInProject(project, requestId);
    if (request) {
      return { project, request };
    }
  }

  return null;
}
