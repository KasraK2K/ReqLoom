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
  const headersJson = useMemo(
    () => JSON.stringify(response?.headers ?? {}, null, 2),
    [response?.headers],
  );
  const cookiesJson = useMemo(
    () => JSON.stringify(response?.cookies ?? [], null, 2),
    [response?.cookies],
  );

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
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <CardTitle className="shrink-0">Response</CardTitle>
            <StatusBadge status={response?.status} />
            {response ? (
              <div className="hidden min-w-0 items-center gap-1 text-xs text-muted sm:flex">
                <span>{response.durationMs} ms</span>
                <span className="text-white/25">&middot;</span>
                <span>{response.sizeBytes} B</span>
                <span className="text-white/25">&middot;</span>
                <span className="truncate">{response.contentType}</span>
              </div>
            ) : null}
          </div>
          <Button
            variant="ghost"
            className="h-8 w-8 shrink-0 rounded-lg p-0"
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
            <TabsList className="shrink-0 max-w-full flex-wrap self-start">
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="cookies">Cookies</TabsTrigger>
            </TabsList>
            <TabsContent value="body" className="min-h-0 flex-1 pt-4">
              <div className="flex h-full min-h-0 flex-col overflow-auto">
                {response.contentKind === "json" ? (
                  <JSONTree value={response.textBody ?? ""} className="flex-1" />
                ) : null}
                {response.contentKind === "html" ? (
                  <HTMLPreview value={response.textBody ?? ""} />
                ) : null}
                {response.contentKind === "xml" || response.contentKind === "text" ? (
                  <pre className="h-full min-h-0 overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200 whitespace-pre-wrap break-all">
                    {response.textBody}
                  </pre>
                ) : null}
                {response.contentKind === "image" && imageSrc ? (
                  <div className="flex h-full min-h-0 items-start justify-center overflow-auto rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <img
                      alt="Response preview"
                      className="max-w-full rounded-lg"
                      src={imageSrc}
                    />
                  </div>
                ) : null}
                {response.contentKind === "binary" ? (
                  <pre className="h-full min-h-0 overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-xs text-muted whitespace-pre-wrap break-all">
                    {response.base64Body}
                  </pre>
                ) : null}
              </div>
            </TabsContent>
            <TabsContent value="headers" className="min-h-0 flex-1 pt-4">
              <JSONTree value={headersJson} className="flex-1" />
            </TabsContent>
            <TabsContent value="cookies" className="min-h-0 flex-1 pt-4">
              <JSONTree value={cookiesJson} className="flex-1" />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
