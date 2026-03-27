import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

function renderValue(value: unknown): ReactNode {
  if (value === null) {
    return <span className="json-token-null">null</span>;
  }
  if (typeof value === "string") {
    return <span className="json-token-string">"{value}"</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="json-token-number">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <div className="pl-4">
        <span className="json-punctuation">[</span>
        {value.map((item, index) => (
          <div key={index} className="pl-4">
            {renderValue(item)}
          </div>
        ))}
        <span className="json-punctuation">]</span>
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="pl-4">
        <span className="json-punctuation">{"{"}</span>
        {Object.entries(value as Record<string, unknown>).map(
          ([key, nestedValue]) => (
            <div key={key} className="pl-4">
              <span className="json-token-key">{key}</span>: {renderValue(nestedValue)}
            </div>
          ),
        )}
        <span className="json-punctuation">{"}"}</span>
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
          "code-surface rounded-xl p-4 font-mono text-sm break-words",
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
          "code-surface rounded-xl p-4 font-mono text-sm whitespace-pre-wrap break-all",
          scrollable && "h-full min-h-0 overflow-auto",
          className,
        )}
      >
        {value}
      </pre>
    );
  }
}
