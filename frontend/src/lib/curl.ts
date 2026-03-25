import type {
  ExecuteRequestPayload,
  FormValueRow,
  HeaderRow,
} from "@restify/shared";

function escapeShellValue(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function getEnabledHeaders(rows: HeaderRow[]) {
  return rows.filter((row) => row.enabled && row.key.trim());
}

function getEnabledBodyRows(rows: FormValueRow[] = []) {
  return rows.filter((row) => row.enabled && row.key.trim());
}

function buildComputedHeaders(payload: ExecuteRequestPayload) {
  const headers = new Headers();

  getEnabledHeaders(payload.headers).forEach((header) => {
    headers.set(header.key, header.value);
  });

  if (payload.auth.type === "bearer" && payload.auth.token) {
    headers.set("authorization", `Bearer ${payload.auth.token}`);
  }

  if (payload.auth.type === "basic" && payload.auth.username) {
    const token = btoa(`${payload.auth.username}:${payload.auth.password ?? ""}`);
    headers.set("authorization", `Basic ${token}`);
  }

  if (!headers.has("content-type")) {
    if (payload.body.type === "json") {
      headers.set("content-type", "application/json");
    }

    if (payload.body.type === "x-www-form-urlencoded") {
      headers.set(
        "content-type",
        "application/x-www-form-urlencoded;charset=UTF-8",
      );
    }
  }

  return headers;
}

export function buildCurlCommand(payload: ExecuteRequestPayload) {
  const parts: string[] = ["curl", "-X", payload.method, escapeShellValue(payload.url)];
  const headers = buildComputedHeaders(payload);

  Array.from(headers.entries()).forEach(([key, value]) => {
    parts.push("-H", escapeShellValue(`${key}: ${value}`));
  });

  if (payload.body.type === "json" || payload.body.type === "text") {
    const content = payload.body.content ?? "";
    if (content) {
      parts.push("--data-raw", escapeShellValue(content));
    }
  }

  if (payload.body.type === "x-www-form-urlencoded") {
    const content = getEnabledBodyRows(payload.body.values).map(
      (row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`,
    ).join("&");

    if (content) {
      parts.push("--data-raw", escapeShellValue(content));
    }
  }

  if (payload.body.type === "form-data") {
    getEnabledBodyRows(payload.body.values).forEach((row) => {
      parts.push("-F", escapeShellValue(`${row.key}=${row.value}`));
    });
  }

  return parts.join(" ");
}
