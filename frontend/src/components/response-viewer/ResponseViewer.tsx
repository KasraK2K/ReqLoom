import type { ExecuteRequestResult } from "@restify/shared";
import { Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { StatusBadge } from "./StatusBadge";
import { JSONTree } from "./JSONTree";
import { HTMLPreview } from "./HTMLPreview";

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
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Response Viewer</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusBadge status={response?.status} />
              {response ? <span>{response.durationMs} ms</span> : null}
              {response ? <span>{response.sizeBytes} bytes</span> : null}
              {response ? <span>{response.contentType}</span> : null}
            </div>
          </div>
          <Button variant="secondary" onClick={copyResponse} disabled={!response}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {!response ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted">Send a request to inspect status, headers, cookies, and the response body.</div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="cookies">Cookies</TabsTrigger>
            </TabsList>
            <TabsContent value="body" className="pt-4">
              {response.contentKind === "json" ? <JSONTree value={response.textBody ?? ""} /> : null}
              {response.contentKind === "html" ? <HTMLPreview value={response.textBody ?? ""} /> : null}
              {response.contentKind === "xml" || response.contentKind === "text" ? (
                <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200">{response.textBody}</pre>
              ) : null}
              {response.contentKind === "image" && imageSrc ? <img alt="Response preview" className="max-h-[360px] rounded-xl border border-white/10" src={imageSrc} /> : null}
              {response.contentKind === "binary" ? (
                <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-xs text-muted">{response.base64Body}</pre>
              ) : null}
            </TabsContent>
            <TabsContent value="headers" className="pt-4">
              <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200">{JSON.stringify(response.headers, null, 2)}</pre>
            </TabsContent>
            <TabsContent value="cookies" className="pt-4">
              <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200">{JSON.stringify(response.cookies, null, 2)}</pre>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

