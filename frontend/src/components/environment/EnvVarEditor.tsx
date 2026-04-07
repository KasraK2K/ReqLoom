import type { ProjectEnvVar } from "@restify/shared";
import { Plus, Save, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";

interface EnvVarEditorProps {
  projectName?: string;
  envVars: ProjectEnvVar[];
  onChange: (envVars: ProjectEnvVar[]) => void;
  onSave: () => void;
}

export function EnvVarEditor({
  projectName,
  envVars,
  onChange,
  onSave,
}: EnvVarEditorProps) {
  const pendingFocusIndexRef = useRef<number | null>(null);

  const focusPendingKeyInput = (
    index: number,
    element: HTMLInputElement | null,
  ) => {
    if (!element || pendingFocusIndexRef.current !== index) {
      return;
    }

    pendingFocusIndexRef.current = null;
    window.requestAnimationFrame(() => {
      element.focus();
      element.select();
    });
  };

  const updateRow = (index: number, patch: Partial<ProjectEnvVar>) => {
    onChange(
      envVars.map((envVar, envIndex) =>
        envIndex === index ? { ...envVar, ...patch } : envVar,
      ),
    );
  };

  const addVariable = () => {
    pendingFocusIndexRef.current = envVars.length;
    onChange([...envVars, { key: "", value: "" }]);
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div>
          <CardTitle>Environment</CardTitle>
          <p className="mt-1 text-xs text-muted">
            {projectName
              ? `${projectName} variables`
              : "Select a project to edit environment variables."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {envVars.map((envVar, index) => (
          <div
            key={index}
            className="rounded-xl border border-white/8 bg-slate-950/30 p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] sm:items-end sm:gap-2">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted sm:hidden">
                  Key
                </div>
                <Input
                  ref={(element) => focusPendingKeyInput(index, element)}
                  value={envVar.key}
                  onChange={(event) =>
                    updateRow(index, { key: event.target.value })
                  }
                  placeholder="API_BASE_URL"
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted sm:hidden">
                  Value
                </div>
                <Input
                  value={envVar.value}
                  onChange={(event) =>
                    updateRow(index, { value: event.target.value })
                  }
                  placeholder="https://api.example.com"
                />
              </div>
              <div className="flex justify-end sm:justify-center">
                <Button
                  variant="ghost"
                  className="h-10 w-10 rounded-xl p-0 text-rose-300"
                  onClick={() =>
                    onChange(
                      envVars.filter((_, envIndex) => envIndex !== index),
                    )
                  }
                  aria-label={`Remove environment variable ${index + 1}`}
                  title="Remove variable"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={addVariable}
            disabled={!projectName}
          >
            <Plus className="h-4 w-4" />
            Add Variable
          </Button>
          <Button
            variant="secondary"
            className="h-9 w-9 shrink-0 rounded-lg p-0"
            onClick={onSave}
            disabled={!projectName}
            aria-label="Save environment variables"
            title="Save environment variables"
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

