import type {
  FormValueRow,
  HeaderRow,
  ProjectEnvVar,
  QueryParamRow,
} from "@restify/shared";
import { Plus, Trash2 } from "lucide-react";
import { resolveKeyValueRowsResolution } from "../../lib/var-resolver";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { VariableBadges } from "./VariableBadges";

type Row = HeaderRow | QueryParamRow | FormValueRow;

interface KeyValueTableProps<T extends Row> {
  rows: T[];
  onChange: (rows: T[]) => void;
  createRow: () => T;
  keyLabel?: string;
  valueLabel?: string;
  showEnabled?: boolean;
  envVars?: ProjectEnvVar[];
}

export function KeyValueTable<T extends Row>({
  rows,
  onChange,
  createRow,
  keyLabel = "Key",
  valueLabel = "Value",
  showEnabled = true,
  envVars,
}: KeyValueTableProps<T>) {
  const updateRow = (index: number, patch: Partial<T>) => {
    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
    onChange(nextRows);
  };

  const removeRow = (index: number) =>
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));

  const desktopGridClass = showEnabled
    ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_78px_44px]"
    : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]";
  const variableResolution = envVars
    ? resolveKeyValueRowsResolution(rows, envVars)
    : { output: "", resolved: [], unresolved: [] };

  return (
    <div className="space-y-3">
      <div
        className={`hidden gap-2 px-1 text-xs uppercase tracking-wide text-muted md:grid ${desktopGridClass}`}
      >
        <span>{keyLabel}</span>
        <span>{valueLabel}</span>
        {showEnabled ? <span className="text-center">Enabled</span> : null}
        <span className="sr-only">Actions</span>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="rounded-lg border border-white/8 bg-slate-950/30 p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0"
          >
            <div className={`grid gap-3 md:items-center md:gap-2 ${desktopGridClass}`}>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:hidden">
                  {keyLabel}
                </div>
                <Input
                  value={row.key}
                  onChange={(event) =>
                    updateRow(index, { key: event.target.value } as Partial<T>)
                  }
                  placeholder={keyLabel}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:hidden">
                  {valueLabel}
                </div>
                <Input
                  value={row.value}
                  onChange={(event) =>
                    updateRow(index, { value: event.target.value } as Partial<T>)
                  }
                  placeholder={valueLabel}
                  className="h-10"
                />
              </div>
              {showEnabled ? (
                <div className="space-y-1.5 md:space-y-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:hidden">
                    Enabled
                  </div>
                  <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-muted transition hover:bg-white/8">
                    <input
                      checked={row.enabled}
                      onChange={(event) =>
                        updateRow(
                          index,
                          { enabled: event.target.checked } as Partial<T>,
                        )
                      }
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <span className="md:hidden">Enabled</span>
                  </label>
                </div>
              ) : null}
              <div className="flex items-end justify-end md:justify-center">
                <Button
                  variant="ghost"
                  className="h-10 w-10 rounded-lg p-0 text-rose-300 hover:text-rose-200"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove ${keyLabel.toLowerCase()} row ${index + 1}`}
                  title="Remove row"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <VariableBadges resolution={variableResolution} />
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => onChange([...rows, createRow()])}
      >
        <Plus className="h-4 w-4" />
        Add Row
      </Button>
    </div>
  );
}
