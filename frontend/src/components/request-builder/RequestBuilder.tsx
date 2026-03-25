import type { ExecuteRequestPayload, ProjectEnvVar, RequestDoc } from "@restify/shared";
import { Save } from "lucide-react";
import { useMemo } from "react";
import { useCtrlEnter } from "../../hooks/use-ctrl-enter";
import { createHeaderRow, createQueryParamRow } from "../../lib/request-helpers";
import {
  buildParamsFromUrl,
  mergeParamsIntoUrl,
  resolveVariables,
} from "../../lib/var-resolver";
import type { BuilderTab } from "../../types";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { KeyValueTable } from "./KeyValueTable";
import { MethodSelector } from "./MethodSelector";
import { URLBar } from "./URLBar";

interface RequestBuilderProps {
  draft: RequestDoc | null;
  envVars: ProjectEnvVar[];
  activeTab: BuilderTab;
  isSending: boolean;
  onDraftChange: (draft: RequestDoc) => void;
  onActiveTabChange: (tab: BuilderTab) => void;
  onSave: () => void;
  onSend: (payload: ExecuteRequestPayload) => void;
}

export function RequestBuilder({
  draft,
  envVars,
  activeTab,
  isSending,
  onDraftChange,
  onActiveTabChange,
  onSave,
  onSend,
}: RequestBuilderProps) {
  const resolution = useMemo(
    () => resolveVariables(draft?.url ?? "", envVars),
    [draft?.url, envVars],
  );

  const sendPayload = useMemo<ExecuteRequestPayload | null>(() => {
    if (!draft) {
      return null;
    }

    const resolvedUrl = resolveVariables(
      mergeParamsIntoUrl(draft.url, draft.params),
      envVars,
    ).output;
    const resolvedHeaders = draft.headers.map((header) => ({
      ...header,
      value: resolveVariables(header.value, envVars).output,
    }));
    const resolvedBody =
      draft.body.type === "json" || draft.body.type === "text"
        ? {
            ...draft.body,
            content: resolveVariables(draft.body.content ?? "", envVars).output,
          }
        : {
            ...draft.body,
            values: draft.body.values?.map((row) => ({
              ...row,
              value: resolveVariables(row.value, envVars).output,
            })),
          };

    return {
      workspaceId: draft.workspaceId,
      projectId: draft.projectId,
      requestId: draft._id,
      method: draft.method,
      url: resolvedUrl,
      headers: resolvedHeaders,
      params: draft.params,
      body: resolvedBody,
      auth: draft.auth,
    };
  }, [draft, envVars]);

  useCtrlEnter(() => {
    if (sendPayload) {
      onSend(sendPayload);
    }
  }, Boolean(sendPayload));

  if (!draft) {
    return (
      <Card className="flex h-full min-h-0 flex-col">
        <CardContent className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
          Select or create a request to start building.
        </CardContent>
      </Card>
    );
  }

  const updateDraft = (patch: Partial<RequestDoc>) =>
    onDraftChange({
      ...draft,
      ...patch,
      updatedAt: new Date().toISOString(),
    });

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>Request Builder</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Ctrl+Enter sends the active request from any request input.
            </p>
          </div>
          <Button
            variant="secondary"
            className="h-9 w-9 shrink-0 rounded-lg p-0"
            onClick={onSave}
            aria-label="Save request"
            title="Save request"
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex min-w-0 flex-nowrap items-start gap-3">
          <MethodSelector
            value={draft.method}
            onChange={(method) => updateDraft({ method })}
          />
          <div className="min-w-0 flex-1">
            <URLBar
              value={draft.url}
              resolution={resolution}
              onChange={(url) =>
                updateDraft({ url, params: buildParamsFromUrl(url) })
              }
              onSend={() => sendPayload && onSend(sendPayload)}
              isSending={isSending}
            />
          </div>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(value) => onActiveTabChange(value as BuilderTab)}
          className="flex min-h-0 w-full flex-1 flex-col"
        >
          <TabsList className="shrink-0 self-start">
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            <TabsTrigger value="auth">Auth</TabsTrigger>
            <TabsTrigger value="params">Params</TabsTrigger>
          </TabsList>
          <TabsContent value="body" className="flex min-h-0 w-full flex-1 pt-4">
            <BodyEditor
              value={draft.body}
              onChange={(body) => updateDraft({ body })}
            />
          </TabsContent>
          <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto pt-4">
            <KeyValueTable
              rows={draft.headers}
              onChange={(headers) => updateDraft({ headers })}
              createRow={createHeaderRow}
            />
          </TabsContent>
          <TabsContent value="auth" className="min-h-0 flex-1 overflow-auto pt-4">
            <AuthEditor
              value={draft.auth}
              onChange={(auth) => updateDraft({ auth })}
            />
          </TabsContent>
          <TabsContent value="params" className="min-h-0 flex-1 overflow-auto pt-4">
            <KeyValueTable
              rows={draft.params}
              onChange={(params) =>
                updateDraft({
                  params,
                  url: mergeParamsIntoUrl(draft.url, params),
                })
              }
              createRow={createQueryParamRow}
              keyLabel="Query"
              valueLabel="Value"
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}