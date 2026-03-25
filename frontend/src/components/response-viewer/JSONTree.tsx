import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

function renderValue(value: unknown): ReactNode {
  if (value === null) {
    return <span className="text-pink-300">null</span>;
  }
  if (typeof value === "string") {
    return <span className="text-emerald-300">"{value}"</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-sky-300">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <div className="pl-4">
        <span className="text-muted">[</span>
        {value.map((item, index) => (
          <div key={index} className="pl-4">
            {renderValue(item)}
          </div>
        ))}
        <span className="text-muted">]</span>
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="pl-4">
        <span className="text-muted">{"{"}</span>
        {Object.entries(value as Record<string, unknown>).map(
          ([key, nestedValue]) => (
            <div key={key} className="pl-4">
              <span className="text-violet-300">{key}</span>: {renderValue(nestedValue)}
            </div>
          ),
        )}
        <span className="text-muted">{"}"}</span>
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

interface JSONTreeProps {
  value: string;
  className?: string;
  scrollable?: boolean;
}

export function JSONTree({
  value,
  className,
  scrollable = true,
}: JSONTreeProps) {
  try {
    const parsed = JSON.parse(value);
    return (
      <div
        className={cn(
          "rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-slate-200 break-words",
          scrollable && "h-full min-h-0 overflow-auto",
          className,
        )}
      >
        {renderValue(parsed)}
      </div>
    );
  } catch {
    return (
      <pre
        className={cn(
          "rounded-xl bg-slate-950/70 p-4 font-mono text-sm text-muted whitespace-pre-wrap break-all",
          scrollable && "h-full min-h-0 overflow-auto",
          className,
        )}
      >
        {value}
      </pre>
    );
  }
}
