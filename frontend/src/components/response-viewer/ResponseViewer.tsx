import type { ExecuteRequestResult } from "@restify/shared";
import { Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { HTMLPreview } from "./HTMLPreview";
import { JSONTree } from "./JSONTree";
import { StatusBadge } from "./StatusBadge";

interface ResponseViewerProps {
  response: ExecuteRequestResult | null;
}

export function ResponseViewer({ response }: ResponseViewerProps) {
  const [tab, setTab] = useState("body");

  const imageSrc = useMemo(() => {
    if (!response?.base64Body || !response.contentType.startsWith("image/")) {
      return null;
    }
    return `data:${response.contentType};base64,${response.base64Body}`;
  }, [response]);

  const copyResponse = async () => {
    const value = response?.textBody ?? response?.base64Body;
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
  };

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader>
        <div className="flex w-full items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle>Response Viewer</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusBadge status={response?.status} />
              {response ? <span>{response.durationMs} ms</span> : null}
              {response ? <span>{response.sizeBytes} bytes</span> : null}
              {response ? <span>{response.contentType}</span> : null}
            </div>
          </div>
          <Button
            variant="secondary"
            className="h-9 w-9 shrink-0 rounded-lg p-0"
            onClick={copyResponse}
            disabled={!response}
            aria-label="Copy response"
            title="Copy response"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!response ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-muted">
            Send a request to inspect status, headers, cookies, and the response body.
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="shrink-0 self-start">
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="cookies">Cookies</TabsTrigger>
            </TabsList>
            <TabsContent value="body" className="min-h-0 flex-1 overflow-auto pt-4">
              {response.contentKind === "json" ? (
                <JSONTree value={response.textBody ?? ""} />
              ) : null}
              {response.contentKind === "html" ? (
                <HTMLPreview value={response.textBody ?? ""} />
              ) : null}
              {response.contentKind === "xml" || response.contentKind === "text" ? (
                <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200">
                  {response.textBody}
                </pre>
              ) : null}
              {response.contentKind === "image" && imageSrc ? (
                <img
                  alt="Response preview"
                  className="max-h-[360px] rounded-xl border border-white/10"
                  src={imageSrc}
                />
              ) : null}
              {response.contentKind === "binary" ? (
                <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-xs text-muted">
                  {response.base64Body}
                </pre>
              ) : null}
            </TabsContent>
            <TabsContent value="headers" className="min-h-0 flex-1 overflow-auto pt-4">
              <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200">
                {JSON.stringify(response.headers, null, 2)}
              </pre>
            </TabsContent>
            <TabsContent value="cookies" className="min-h-0 flex-1 overflow-auto pt-4">
              <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200">
                {JSON.stringify(response.cookies, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}