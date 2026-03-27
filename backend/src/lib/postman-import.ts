import { randomUUID } from "node:crypto";
import type {
  FormValueRow,
  HeaderRow,
  HttpMethod,
  ProjectEnvVar,
  QueryParamRow,
  RequestAuthConfig,
  RequestBodyConfig,
} from "@restify/shared";

export interface ImportedPostmanRequest {
  name: string;
  method: HttpMethod;
  url: string;
  headers: HeaderRow[];
  params: QueryParamRow[];
  body: RequestBodyConfig;
  auth: RequestAuthConfig;
}

export interface ImportedPostmanFolder {
  name: string;
  folders: ImportedPostmanFolder[];
  requests: ImportedPostmanRequest[];
}

export interface ImportedPostmanCollection {
  projectName: string;
  envVars: ProjectEnvVar[];
  folders: ImportedPostmanFolder[];
  requests: ImportedPostmanRequest[];
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_PROJECT_NAME = "Imported Postman Collection";
const DEFAULT_FOLDER_NAME = "Imported Folder";
const DEFAULT_REQUEST_NAME = "Imported Request";
const SUPPORTED_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function sanitizeName(value: unknown, fallback: string): string {
  const normalizedValue = getString(value)?.trim();
  return normalizedValue ? normalizedValue : fallback;
}

function createHeaderRow(key: string, value: string, enabled: boolean): HeaderRow {
  return {
    id: randomUUID(),
    key,
    value,
    enabled,
  };
}

function createQueryParamRow(
  key: string,
  value: string,
  enabled: boolean,
): QueryParamRow {
  return {
    id: randomUUID(),
    key,
    value,
    enabled,
  };
}

function createFormValueRow(
  key: string,
  value: string,
  enabled: boolean,
  overrides: Partial<FormValueRow> = {},
): FormValueRow {
  return {
    id: randomUUID(),
    key,
    value,
    enabled,
    valueKind: "text",
    ...overrides,
  };
}

function normalizeMethod(value: unknown): HttpMethod {
  const normalizedValue = getString(value)?.trim().toUpperCase();
  return normalizedValue && SUPPORTED_METHODS.has(normalizedValue as HttpMethod)
    ? (normalizedValue as HttpMethod)
    : "GET";
}

function normalizeQueryRows(rows: QueryParamRow[]): QueryParamRow[] {
  return rows.filter((row) => row.key.trim());
}

function stripQueryFromUrl(rawUrl: string): string {
  const hashIndex = rawUrl.indexOf("#");
  const queryIndex = rawUrl.indexOf("?");

  if (queryIndex === -1 || (hashIndex !== -1 && hashIndex < queryIndex)) {
    return rawUrl;
  }

  const hashSuffix = hashIndex === -1 ? "" : rawUrl.slice(hashIndex);
  return `${rawUrl.slice(0, queryIndex)}${hashSuffix}`;
}

function parseRawQueryParams(rawUrl: string): QueryParamRow[] {
  const hashIndex = rawUrl.indexOf("#");
  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex === -1 || (hashIndex !== -1 && hashIndex < queryIndex)) {
    return [];
  }

  const queryString = rawUrl.slice(
    queryIndex + 1,
    hashIndex === -1 ? undefined : hashIndex,
  );
  if (!queryString.trim()) {
    return [];
  }

  return Array.from(new URLSearchParams(queryString).entries()).map(([key, value]) =>
    createQueryParamRow(key, value, true),
  );
}

function parseHeaderRows(value: unknown): HeaderRow[] {
  return getArray(value).flatMap((entry) => {
    const record = getRecord(entry);
    const key = getString(record?.key)?.trim();
    if (!key) {
      return [];
    }

    return [
      createHeaderRow(key, toStringValue(record?.value), record?.disabled !== true),
    ];
  });
}

function parseQueryRows(value: unknown): QueryParamRow[] {
  return normalizeQueryRows(
    getArray(value).flatMap((entry) => {
      const record = getRecord(entry);
      const key = getString(record?.key)?.trim();
      if (!key) {
        return [];
      }

      return [
        createQueryParamRow(key, toStringValue(record?.value), record?.disabled !== true),
      ];
    }),
  );
}

function joinUrlSegments(value: unknown, separator: string): string {
  if (Array.isArray(value)) {
    return value
      .map((segment) => getString(segment)?.trim())
      .filter((segment): segment is string => Boolean(segment))
      .join(separator);
  }

  const directValue = getString(value)?.trim();
  return directValue ?? "";
}

function buildUrlFromRecord(urlRecord: JsonRecord): string {
  const protocol = getString(urlRecord.protocol)?.trim();
  const host = joinUrlSegments(urlRecord.host, ".");
  const path = joinUrlSegments(urlRecord.path, "/");

  let baseUrl = "";
  if (protocol && host) {
    baseUrl = `${protocol}://${host}`;
  } else if (host) {
    baseUrl = host;
  }

  if (!path) {
    return baseUrl;
  }

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function parseUrl(value: unknown): { url: string; params: QueryParamRow[] } {
  if (typeof value === "string") {
    return {
      url: stripQueryFromUrl(value),
      params: parseRawQueryParams(value),
    };
  }

  const urlRecord = getRecord(value);
  if (!urlRecord) {
    return { url: "", params: [] };
  }

  const rawUrl = getString(urlRecord.raw)?.trim();
  const explicitParams = parseQueryRows(urlRecord.query);
  if (rawUrl) {
    return {
      url: stripQueryFromUrl(rawUrl),
      params: explicitParams.length > 0 ? explicitParams : parseRawQueryParams(rawUrl),
    };
  }

  const builtUrl = buildUrlFromRecord(urlRecord);
  return {
    url: stripQueryFromUrl(builtUrl),
    params: explicitParams.length > 0 ? explicitParams : parseRawQueryParams(builtUrl),
  };
}

function getHeaderValue(headers: HeaderRow[], headerName: string): string | undefined {
  const normalizedName = headerName.trim().toLowerCase();
  return headers.find(
    (header) => header.enabled && header.key.trim().toLowerCase() === normalizedName,
  )?.value;
}

function isJsonRawBody(bodyRecord: JsonRecord | undefined, headers: HeaderRow[]): boolean {
  const rawOptions = getRecord(getRecord(bodyRecord?.options)?.raw);
  const language = getString(rawOptions?.language)?.trim().toLowerCase();
  if (language === "json") {
    return true;
  }

  const contentType = getHeaderValue(headers, "content-type")?.toLowerCase();
  return Boolean(contentType?.includes("application/json"));
}

function getFileName(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.split(/[\\/]/).filter(Boolean).at(-1);
  }

  if (Array.isArray(value)) {
    for (const candidate of value) {
      const fileName = getFileName(candidate);
      if (fileName) {
        return fileName;
      }
    }
  }

  return undefined;
}

function parseFormDataRows(value: unknown): FormValueRow[] {
  return getArray(value).flatMap((entry) => {
    const record = getRecord(entry);
    const key = getString(record?.key)?.trim();
    if (!key) {
      return [];
    }

    const enabled = record?.disabled !== true;
    if (getString(record?.type)?.trim() === "file") {
      return [
        createFormValueRow(key, "", enabled, {
          valueKind: "file",
          fileName: getFileName(record?.src),
        }),
      ];
    }

    return [createFormValueRow(key, toStringValue(record?.value), enabled)];
  });
}

function parseUrlEncodedRows(value: unknown): FormValueRow[] {
  return getArray(value).flatMap((entry) => {
    const record = getRecord(entry);
    const key = getString(record?.key)?.trim();
    if (!key) {
      return [];
    }

    return [
      createFormValueRow(key, toStringValue(record?.value), record?.disabled !== true),
    ];
  });
}

function parseGraphqlBody(bodyRecord: JsonRecord): RequestBodyConfig {
  const graphql = getRecord(bodyRecord.graphql);
  const query = getString(graphql?.query) ?? "";
  const rawVariables = graphql?.variables;
  let variables: unknown = {};

  if (typeof rawVariables === "string") {
    const trimmedVariables = rawVariables.trim();
    if (trimmedVariables) {
      try {
        variables = JSON.parse(trimmedVariables);
      } catch {
        variables = rawVariables;
      }
    }
  } else if (rawVariables !== undefined) {
    variables = rawVariables;
  }

  return {
    type: "json",
    content: JSON.stringify({ query, variables }, null, 2),
  };
}

function parseBody(value: unknown, headers: HeaderRow[]): RequestBodyConfig {
  const bodyRecord = getRecord(value);
  const mode = getString(bodyRecord?.mode)?.trim();

  switch (mode) {
    case "raw": {
      const content = getString(bodyRecord?.raw) ?? "";
      return {
        type: isJsonRawBody(bodyRecord, headers) ? "json" : "text",
        content,
      };
    }
    case "formdata":
      return {
        type: "form-data",
        values: parseFormDataRows(bodyRecord?.formdata),
      };
    case "urlencoded":
      return {
        type: "x-www-form-urlencoded",
        values: parseUrlEncodedRows(bodyRecord?.urlencoded),
      };
    case "graphql":
      return parseGraphqlBody(bodyRecord ?? {});
    default:
      return { type: "none" };
  }
}

function getAuthEntries(authRecord: JsonRecord, sectionName: string): JsonRecord[] {
  return getArray(authRecord[sectionName])
    .map((entry) => getRecord(entry))
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function getAuthValue(
  authRecord: JsonRecord,
  sectionName: string,
  key: string,
): string | undefined {
  const normalizedKey = key.trim();
  return getAuthEntries(authRecord, sectionName).find(
    (entry) => getString(entry.key) === normalizedKey,
  )?.value as string | undefined;
}

function resolveAuthSource(localAuth: unknown, inheritedAuth: unknown): unknown {
  const localAuthRecord = getRecord(localAuth);
  const localAuthType = getString(localAuthRecord?.type)?.trim().toLowerCase();

  if (!localAuthRecord || !localAuthType || localAuthType === "inherit") {
    return inheritedAuth;
  }

  return localAuthRecord;
}

function parseAuth(authSource: unknown): {
  auth: RequestAuthConfig;
  headers: HeaderRow[];
  params: QueryParamRow[];
} {
  const authRecord = getRecord(authSource);
  const authType = getString(authRecord?.type)?.trim().toLowerCase();
  if (!authRecord || !authType) {
    return {
      auth: { type: "none" },
      headers: [],
      params: [],
    };
  }

  switch (authType) {
    case "basic":
      return {
        auth: {
          type: "basic",
          username: toStringValue(getAuthValue(authRecord, "basic", "username")),
          password: toStringValue(getAuthValue(authRecord, "basic", "password")),
        },
        headers: [],
        params: [],
      };
    case "bearer":
      return {
        auth: {
          type: "bearer",
          token: toStringValue(getAuthValue(authRecord, "bearer", "token")),
        },
        headers: [],
        params: [],
      };
    case "apikey": {
      const key = getAuthValue(authRecord, "apikey", "key")?.trim();
      const value = toStringValue(getAuthValue(authRecord, "apikey", "value"));
      const location =
        getAuthValue(authRecord, "apikey", "in")?.trim().toLowerCase() ?? "header";

      if (!key) {
        return {
          auth: { type: "none" },
          headers: [],
          params: [],
        };
      }

      return {
        auth: { type: "none" },
        headers:
          location === "header" ? [createHeaderRow(key, value, true)] : [],
        params:
          location === "query" ? [createQueryParamRow(key, value, true)] : [],
      };
    }
    case "noauth":
      return {
        auth: { type: "none" },
        headers: [],
        params: [],
      };
    default:
      return {
        auth: { type: "none" },
        headers: [],
        params: [],
      };
  }
}

function mergeHeaders(headers: HeaderRow[], extraHeaders: HeaderRow[]): HeaderRow[] {
  const existingHeaderNames = new Set(
    headers.map((header) => header.key.trim().toLowerCase()).filter(Boolean),
  );

  return [
    ...headers,
    ...extraHeaders.filter(
      (header) => !existingHeaderNames.has(header.key.trim().toLowerCase()),
    ),
  ];
}

function mergeParams(params: QueryParamRow[], extraParams: QueryParamRow[]): QueryParamRow[] {
  const existingParamNames = new Set(
    params.map((param) => param.key.trim()).filter(Boolean),
  );

  return [
    ...params,
    ...extraParams.filter((param) => !existingParamNames.has(param.key.trim())),
  ];
}

function parseCollectionVariables(value: unknown): ProjectEnvVar[] {
  const variablesByKey = new Map<string, string>();

  getArray(value).forEach((entry) => {
    const record = getRecord(entry);
    const key = getString(record?.key)?.trim();
    if (!key) {
      return;
    }

    variablesByKey.set(key, toStringValue(record?.value));
  });

  return Array.from(variablesByKey.entries()).map(([key, value]) => ({ key, value }));
}

function parseRequestItem(
  itemRecord: JsonRecord,
  inheritedAuth: unknown,
): ImportedPostmanRequest | null {
  const rawRequest = itemRecord.request;
  const requestRecord =
    typeof rawRequest === "string"
      ? ({ url: rawRequest, method: "GET" } satisfies JsonRecord)
      : getRecord(rawRequest);
  if (!requestRecord) {
    return null;
  }

  const authData = parseAuth(resolveAuthSource(requestRecord.auth, inheritedAuth));
  const headers = mergeHeaders(parseHeaderRows(requestRecord.header), authData.headers);
  const parsedUrl = parseUrl(requestRecord.url);
  const params = mergeParams(parsedUrl.params, authData.params);
  const method = normalizeMethod(requestRecord.method);
  const url = parsedUrl.url.trim();

  return {
    name: sanitizeName(itemRecord.name, url ? `${method} ${url}` : DEFAULT_REQUEST_NAME),
    method,
    url,
    headers,
    params,
    body: parseBody(requestRecord.body, headers),
    auth: authData.auth,
  };
}

function parseItemGroup(
  items: unknown[],
  inheritedAuth: unknown,
): Pick<ImportedPostmanCollection, "folders" | "requests"> {
  const folders: ImportedPostmanFolder[] = [];
  const requests: ImportedPostmanRequest[] = [];

  items.forEach((entry) => {
    const itemRecord = getRecord(entry);
    if (!itemRecord) {
      return;
    }

    const nestedItems = getArray(itemRecord.item);
    if (nestedItems.length > 0) {
      const nextInheritedAuth = resolveAuthSource(itemRecord.auth, inheritedAuth);
      const parsedChildren = parseItemGroup(nestedItems, nextInheritedAuth);
      folders.push({
        name: sanitizeName(itemRecord.name, DEFAULT_FOLDER_NAME),
        folders: parsedChildren.folders,
        requests: parsedChildren.requests,
      });
      return;
    }

    const request = parseRequestItem(itemRecord, inheritedAuth);
    if (request) {
      requests.push(request);
    }
  });

  return { folders, requests };
}

export function parsePostmanCollection(collectionJson: string): ImportedPostmanCollection {
  const normalizedCollectionJson = collectionJson.trim();
  if (!normalizedCollectionJson) {
    throw new Error("Postman collection JSON is required.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedCollectionJson);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  const collectionRecord = getRecord(parsed);
  if (!collectionRecord) {
    throw new Error("The Postman export must be a JSON object.");
  }

  const items = getArray(collectionRecord.item);
  if (!Array.isArray(collectionRecord.item)) {
    throw new Error("The Postman collection is missing its item list.");
  }

  const collectionInfo = getRecord(collectionRecord.info);
  const inheritedAuth = getRecord(collectionRecord.auth);
  const parsedItems = parseItemGroup(items, inheritedAuth);

  return {
    projectName: sanitizeName(collectionInfo?.name, DEFAULT_PROJECT_NAME),
    envVars: parseCollectionVariables(collectionRecord.variable),
    folders: parsedItems.folders,
    requests: parsedItems.requests,
  };
}
