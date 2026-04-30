import type {
  FormValueRow,
  HeaderRow,
  ProjectDoc,
  QueryParamRow,
  RequestDoc,
  RequestHistorySummary,
} from "@restify/shared";
import { createClientId } from "./id";

function createRow<T extends HeaderRow | QueryParamRow>(): T {
  return {
    id: createClientId("row"),
    key: "",
    value: "",
    enabled: true,
  } as T;
}

export function createHeaderRow(): HeaderRow {
  return createRow<HeaderRow>();
}

export function createQueryParamRow(): QueryParamRow {
  return createRow<QueryParamRow>();
}

export function createFormValueRow(): FormValueRow {
  return {
    id: createClientId("form-row"),
    key: "",
    value: "",
    enabled: true,
    valueKind: "text",
  };
}

export function createEmptyRequest(
  project: ProjectDoc,
  folderId?: string | null,
): RequestDoc {
  return {
    _id: createClientId("request"),
    entityType: "request",
    workspaceId: project.workspaceId,
    projectId: project._id,
    folderId: folderId ?? null,
    name: "New Request",
    method: "POST",
    url: "https://api.example.com/resource",
    headers: [createHeaderRow()],
    params: [createQueryParamRow()],
    body: {
      type: "json",
      content: '{\n  "hello": "world"\n}',
    },
    auth: {
      type: "none",
    },
    responseHistory: [] as RequestHistorySummary[],
    order: 0,
    isPrivate: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
