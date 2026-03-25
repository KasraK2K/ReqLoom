import type { ExecuteRequestPayload, ProjectEnvVar, RequestDoc } from "@restify/shared";
import { Save, TerminalSquare } from "lucide-react";
import { useMemo } from "react";
import { useCtrlEnter } from "../../hooks/use-ctrl-enter";
import { buildCurlCommand } from "../../lib/curl";
import { createHeaderRow, createQueryParamRow } from "../../lib/request-helpers";
import {
  buildExecuteRequestPayload,
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

    return buildExecuteRequestPayload(draft, envVars);
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

  const copyCurl = async () => {
    if (!sendPayload) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildCurlCommand(sendPayload));
    } catch {
      return;
    }
  };

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>Request Builder</CardTitle>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            className="h-8 w-8 rounded-lg p-0"
            onClick={() => void copyCurl()}
            disabled={!sendPayload}
            aria-label="Copy cURL command"
            title="Copy cURL command"
          >
            <TerminalSquare className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            className="h-8 w-8 rounded-lg p-0"
            onClick={onSave}
            aria-label="Save request"
            title="Save request"
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex min-w-0 flex-col items-stretch gap-3 min-[860px]:flex-row min-[860px]:items-start">
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
          <TabsList className="shrink-0 max-w-full flex-wrap self-start">
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            <TabsTrigger value="auth">Auth</TabsTrigger>
            <TabsTrigger value="params">Params</TabsTrigger>
          </TabsList>
          <TabsContent value="body" className="flex min-h-0 w-full flex-1 pt-4">
            <BodyEditor
              value={draft.body}
              envVars={envVars}
              onChange={(body) => updateDraft({ body })}
            />
          </TabsContent>
          <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto pt-4">
            <KeyValueTable
              rows={draft.headers}
              onChange={(headers) => updateDraft({ headers })}
              createRow={createHeaderRow}
              envVars={envVars}
            />
          </TabsContent>
          <TabsContent value="auth" className="min-h-0 flex-1 overflow-auto pt-4">
            <AuthEditor
              value={draft.auth}
              envVars={envVars}
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
              envVars={envVars}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
