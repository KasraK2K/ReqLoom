import type { ReactNode } from "react";
import type { HistoryDoc } from "@restify/shared";
import { Copy, TerminalSquare } from "lucide-react";
import { METHOD_STYLES } from "../../lib/methods";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { JSONTree } from "../response-viewer/JSONTree";

interface HistoryDetailsDialogProps {
  entry: HistoryDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DetailSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

type HistoryResponseSnapshot = NonNullable<HistoryDoc["responseSnapshot"]>;

function DetailSection({
  title,
  description,
  actions,
  children,
}: DetailSectionProps) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/45 bg-[rgb(var(--surface-2)/0.58)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function formatAuthTypeLabel(
  type: NonNullable<HistoryDoc["requestSnapshot"]>["auth"]["type"],
) {
  switch (type) {
    case "bearer":
      return "Bearer Token";
    case "basic":
      return "Basic Auth";
    default:
      return "No Auth";
  }
}

function formatBodyTypeLabel(
  type: NonNullable<HistoryDoc["requestSnapshot"]>["body"]["type"],
) {
  switch (type) {
    case "form-data":
      return "Form Data";
    case "x-www-form-urlencoded":
      return "URL Encoded";
    case "json":
      return "JSON";
    case "text":
      return "Text";
    default:
      return "No Body";
  }
}

function formatContentKindLabel(type: HistoryResponseSnapshot["contentKind"]) {
  switch (type) {
    case "json":
      return "JSON";
    case "html":
      return "HTML";
    case "xml":
      return "XML";
    case "image":
      return "Image";
    case "binary":
      return "Binary";
    default:
      return "Text";
  }
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderEmptyDetail(message: string) {
  return (
    <div className="rounded-xl border border-dashed border-border/55 bg-[rgb(var(--surface-1)/0.58)] px-4 py-6 text-sm text-muted">
      {message}
    </div>
  );
}

function renderKeyValueList(
  items: Array<{ key: string; value: string; meta?: string }>,
  emptyLabel: string,
) {
  if (items.length === 0) {
    return renderEmptyDetail(emptyLabel);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/45 bg-[rgb(var(--surface-1)/0.78)]">
      {items.map((item, index) => (
        <div
          key={`${item.key}-${item.value}-${item.meta ?? ""}-${index}`}
          className="grid grid-cols-[minmax(96px,140px)_minmax(0,1fr)] gap-3 border-b border-border/40 px-4 py-3 last:border-b-0"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {item.key || "(empty)"}
          </div>
          <div className="min-w-0">
            <div className="break-all font-mono text-xs text-foreground">
              {item.value || "(empty)"}
            </div>
            {item.meta ? (
              <div className="mt-1 text-[11px] text-muted">{item.meta}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function getEnabledBodyRows(
  snapshot: NonNullable<HistoryDoc["requestSnapshot"]>,
) {
  return (snapshot.body.values ?? []).filter(
    (row) => row.enabled && row.key.trim(),
  );
}

function getBodyListItems(
  snapshot: NonNullable<HistoryDoc["requestSnapshot"]>,
) {
  return getEnabledBodyRows(snapshot).map((row) => {
    if (row.valueKind === "file") {
      return {
        key: row.key,
        value: row.fileName || "(file)",
        meta: [
          row.fileContentType,
          row.fileSizeBytes != null ? formatBytes(row.fileSizeBytes) : undefined,
        ]
          .filter(Boolean)
          .join(" | "),
      };
    }

    return {
      key: row.key,
      value: row.value,
    };
  });
}

function getBodyCopyValue(
  snapshot: NonNullable<HistoryDoc["requestSnapshot"]>,
) {
  switch (snapshot.body.type) {
    case "json":
    case "text":
      return snapshot.body.content ?? "";
    case "form-data":
      return getEnabledBodyRows(snapshot)
        .map((row) =>
          row.valueKind === "file"
            ? `${row.key}: @${row.fileName || "file"}`
            : `${row.key}: ${row.value}`,
        )
        .join("\n");
    case "x-www-form-urlencoded":
      return getEnabledBodyRows(snapshot)
        .map(
          (row) =>
            `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`,
        )
        .join("&");
    default:
      return "";
  }
}

function getResponseBodyValue(response?: HistoryResponseSnapshot) {
  return response?.textBody ?? "";
}

function renderResponseBody(response: HistoryResponseSnapshot) {
  const bodyValue = getResponseBodyValue(response);

  if (!bodyValue) {
    return renderEmptyDetail(
      response.contentKind === "binary" || response.contentKind === "image"
        ? "Binary and image response bodies are not saved in history."
        : "The response body was empty.",
    );
  }

  if (response.contentKind === "json") {
    return (
      <JSONTree
        value={bodyValue}
        scrollable={false}
        className="border border-border/45 text-xs"
      />
    );
  }

  return (
    <pre className="code-surface rounded-xl border border-border/45 p-4 font-mono text-xs whitespace-pre-wrap break-all">
      {bodyValue}
    </pre>
  );
}

export function HistoryDetailsDialog({
  entry,
  open,
  onOpenChange,
}: HistoryDetailsDialogProps) {
  if (!entry) {
    return null;
  }

  const snapshot = entry.requestSnapshot;
  const responseSnapshot = entry.responseSnapshot;
  const sentHeaders = snapshot
    ? Object.entries(snapshot.computedHeaders).map(([key, value]) => ({
        key,
        value,
      }))
    : [];
  const sentParams = snapshot
    ? snapshot.params
        .filter((param) => param.enabled && param.key.trim())
        .map((param) => ({ key: param.key, value: param.value }))
    : [];
  const configuredHeaders = snapshot
    ? snapshot.headers
        .filter((header) => header.key.trim() || header.value.trim())
        .map((header) => ({
          key: header.key,
          value: header.value,
          meta: header.enabled ? "Enabled" : "Disabled",
        }))
    : [];
  const bodyCopyValue = snapshot ? getBodyCopyValue(snapshot) : "";
  const canCopyBody = Boolean(bodyCopyValue);
  const responseCopyValue = getResponseBodyValue(responseSnapshot);
  const canCopyResponse = Boolean(responseCopyValue);

  const copyBody = async () => {
    if (!canCopyBody) {
      return;
    }

    try {
      await navigator.clipboard.writeText(bodyCopyValue);
    } catch {
      return;
    }
  };

  const copyResponse = async () => {
    if (!canCopyResponse) {
      return;
    }

    try {
      await navigator.clipboard.writeText(responseCopyValue);
    } catch {
      return;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="History Details"
      description="Snapshot of the executed request for this history item."
      className="max-h-[85vh] max-w-4xl overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border/45 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={METHOD_STYLES[entry.method]}>{entry.method}</Badge>
            <Badge>{entry.status}</Badge>
            <Badge>{entry.durationMs} ms</Badge>
            <Badge>{formatBytes(entry.sizeBytes)}</Badge>
          </div>
          <div className="code-surface mt-3 rounded-xl border border-border/45 px-4 py-3 font-mono text-xs break-all">
            {entry.url}
          </div>
          <div className="mt-2 text-xs text-muted">
            Executed {new Date(entry.createdAt).toLocaleString()}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!snapshot ? (
            <div className="rounded-2xl border border-dashed border-border/55 bg-[rgb(var(--surface-1)/0.58)] px-4 py-8 text-sm text-muted">
              This history item was created before full request snapshots were stored. Run the request again to capture sent headers, auth, params, and body details.
            </div>
          ) : (
            <>
              <DetailSection
                title="Sent Headers"
                description="Includes headers generated from auth and request body settings."
              >
                {renderKeyValueList(
                  sentHeaders,
                  "No headers were sent with this request.",
                )}
              </DetailSection>

              <DetailSection title="Configured Header Rows">
                {renderKeyValueList(
                  configuredHeaders,
                  "No configured header rows were saved for this request.",
                )}
              </DetailSection>

              <DetailSection title="Auth">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{formatAuthTypeLabel(snapshot.auth.type)}</Badge>
                </div>
                {snapshot.secretsRedacted ? (
                  <div className="text-xs text-muted">
                    Sensitive auth and header values are redacted from history for security.
                  </div>
                ) : null}
                {snapshot.auth.type === "none" ? (
                  <div className="rounded-xl border border-dashed border-border/55 bg-[rgb(var(--surface-1)/0.58)] px-4 py-6 text-sm text-muted">
                    This request was sent without auth.
                  </div>
                ) : null}
                {snapshot.auth.type === "bearer" ? (
                  <div className="space-y-3">
                    {renderKeyValueList(
                      [
                        { key: "Token", value: snapshot.auth.token ?? "" },
                        {
                          key: "Authorization",
                          value: snapshot.computedHeaders.authorization ?? "",
                        },
                      ],
                      "No bearer token was saved for this request.",
                    )}
                  </div>
                ) : null}
                {snapshot.auth.type === "basic" ? (
                  <div className="space-y-3">
                    {renderKeyValueList(
                      [
                        { key: "Username", value: snapshot.auth.username ?? "" },
                        { key: "Password", value: snapshot.auth.password ?? "" },
                        {
                          key: "Authorization",
                          value: snapshot.computedHeaders.authorization ?? "",
                        },
                      ],
                      "No basic auth credentials were saved for this request.",
                    )}
                  </div>
                ) : null}
              </DetailSection>

              <DetailSection title="Query Parameters">
                {renderKeyValueList(
                  sentParams,
                  "No enabled query parameters were sent with this request.",
                )}
              </DetailSection>

              <DetailSection
                title="Body"
                actions={
                  snapshot.body.type !== "none" ? (
                    <Button
                      variant="secondary"
                      className="h-8 w-8 rounded-lg p-0"
                      onClick={() => void copyBody()}
                      disabled={!canCopyBody}
                      aria-label="Copy request body"
                      title="Copy request body"
                    >
                      <TerminalSquare className="h-4 w-4" />
                    </Button>
                  ) : null
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{formatBodyTypeLabel(snapshot.body.type)}</Badge>
                </div>
                {snapshot.body.type === "none" ? (
                  <div className="rounded-xl border border-dashed border-border/55 bg-[rgb(var(--surface-1)/0.58)] px-4 py-6 text-sm text-muted">
                    This request was sent without a body.
                  </div>
                ) : null}
                {snapshot.body.type === "json" ? (
                  <JSONTree
                    value={snapshot.body.content ?? ""}
                    scrollable={false}
                    className="border border-border/45 text-xs"
                  />
                ) : null}
                {snapshot.body.type === "text" ? (
                  <pre className="code-surface rounded-xl border border-border/45 p-4 font-mono text-xs whitespace-pre-wrap break-all">
                    {snapshot.body.content || "(empty)"}
                  </pre>
                ) : null}
                {snapshot.body.type === "form-data"
                  ? renderKeyValueList(
                      getBodyListItems(snapshot),
                      "No enabled body fields were sent with this request.",
                    )
                  : null}
                {snapshot.body.type === "x-www-form-urlencoded"
                  ? renderKeyValueList(
                      getEnabledBodyRows(snapshot).map((row) => ({
                        key: row.key,
                        value: row.value,
                      })),
                      "No enabled body fields were sent with this request.",
                    )
                  : null}
              </DetailSection>
            </>
          )}

          <DetailSection
            title="Response"
            description="Saved response body from this execution."
            actions={
              responseSnapshot ? (
                <Button
                  variant="secondary"
                  className="h-8 w-8 rounded-lg p-0"
                  onClick={() => void copyResponse()}
                  disabled={!canCopyResponse}
                  aria-label="Copy response body"
                  title="Copy response body"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              ) : null
            }
          >
            {responseSnapshot ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{formatContentKindLabel(responseSnapshot.contentKind)}</Badge>
                  <Badge className="max-w-full break-all text-left">
                    {responseSnapshot.contentType}
                  </Badge>
                </div>
                {renderResponseBody(responseSnapshot)}
              </>
            ) : (
              renderEmptyDetail(
                "No response body was saved for this history item. Run the request again to capture it.",
              )
            )}
          </DetailSection>
        </div>
      </div>
    </Dialog>
  );
}




