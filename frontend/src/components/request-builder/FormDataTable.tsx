import type { ChangeEvent } from "react";
import type { FormValueRow, ProjectEnvVar } from "@restify/shared";
import { FileUp, Plus, Trash2, X } from "lucide-react";
import { resolveKeyValueRowsResolution } from "../../lib/var-resolver";
import { createFormValueRow } from "../../lib/request-helpers";
import { Button } from "../ui/button";
import {
  DropdownSelect,
  type DropdownOption,
} from "../ui/DropdownSelect";
import { Input } from "../ui/input";
import { VariableBadges } from "./VariableBadges";

interface FormDataTableProps {
  rows: FormValueRow[];
  envVars: ProjectEnvVar[];
  onChange: (rows: FormValueRow[]) => void;
}

const VALUE_KIND_OPTIONS: Array<
  DropdownOption<NonNullable<FormValueRow["valueKind"]>>
> = [
  { value: "text", label: "Text" },
  { value: "file", label: "File" },
];

function formatBytes(sizeBytes?: number) {
  if (!sizeBytes) {
    return null;
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

export function FormDataTable({ rows, envVars, onChange }: FormDataTableProps) {
  const updateRow = (index: number, patch: Partial<FormValueRow>) => {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const removeRow = (index: number) =>
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));

  const updateValueKind = (
    index: number,
    valueKind: NonNullable<FormValueRow["valueKind"]>,
  ) => {
    if (valueKind === "file") {
      updateRow(index, {
        valueKind,
        value: "",
      });
      return;
    }

    updateRow(index, {
      valueKind,
      fileName: undefined,
      fileContentBase64: undefined,
      fileContentType: undefined,
      fileSizeBytes: undefined,
    });
  };

  const handleFileChange = async (index: number, file?: File | null) => {
    if (!file) {
      return;
    }

    const fileContentBase64 = arrayBufferToBase64(await file.arrayBuffer());
    updateRow(index, {
      valueKind: "file",
      value: "",
      fileName: file.name,
      fileContentBase64,
      fileContentType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
    });
  };

  const clearFile = (index: number) => {
    updateRow(index, {
      fileName: undefined,
      fileContentBase64: undefined,
      fileContentType: undefined,
      fileSizeBytes: undefined,
    });
  };

  const variableResolution = resolveKeyValueRowsResolution(rows, envVars);

  return (
    <div className="space-y-3">
      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_78px_44px] md:gap-2 md:px-1 text-xs uppercase tracking-wide text-muted">
        <span>Field</span>
        <span>Type</span>
        <span>Value</span>
        <span className="text-center">Enabled</span>
        <span className="sr-only">Actions</span>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => {
          const valueKind = row.valueKind ?? "text";
          const fileSizeLabel = formatBytes(row.fileSizeBytes);

          return (
            <div
              key={row.id}
              className="rounded-lg border border-white/8 bg-slate-950/30 p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0"
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_78px_44px] md:items-center md:gap-2">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:hidden">
                    Field
                  </div>
                  <Input
                    value={row.key}
                    onChange={(event) => updateRow(index, { key: event.target.value })}
                    placeholder="Field"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:hidden">
                    Type
                  </div>
                  <DropdownSelect
                    value={valueKind}
                    options={VALUE_KIND_OPTIONS}
                    onChange={(nextValueKind) => updateValueKind(index, nextValueKind)}
                    ariaLabel="Select form-data field type"
                    triggerClassName="h-10 rounded-xl px-3 text-sm"
                    getItemClassName={(_option, isSelected) =>
                      isSelected
                        ? "bg-accent text-slate-950"
                        : "text-foreground hover:bg-white/[0.06]"
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:hidden">
                    Value
                  </div>
                  {valueKind === "text" ? (
                    <Input
                      value={row.value}
                      onChange={(event) =>
                        updateRow(index, { value: event.target.value })
                      }
                      placeholder="Value"
                      className="h-10"
                    />
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-foreground transition hover:bg-slate-900">
                          <input
                            type="file"
                            className="hidden"
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                              void handleFileChange(index, event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                          <FileUp className="h-4 w-4" />
                          {row.fileName ? "Change File" : "Choose File"}
                        </label>
                        {row.fileName ? (
                          <Button
                            variant="ghost"
                            className="h-9 w-9 rounded-lg p-0"
                            onClick={() => clearFile(index)}
                            aria-label="Clear selected file"
                            title="Clear selected file"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-2 min-h-[1.25rem] text-xs text-muted">
                        {row.fileName ? (
                          <>
                            <span className="font-medium text-foreground">{row.fileName}</span>
                            {row.fileContentType ? <><span className="mx-1 text-white/30">&middot;</span>{row.fileContentType}</> : null}
                            {fileSizeLabel ? <><span className="mx-1 text-white/30">&middot;</span>{fileSizeLabel}</> : null}
                          </>
                        ) : (
                          "No file selected"
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 md:self-center">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted md:hidden">
                    Enabled
                  </div>
                  <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-muted transition hover:bg-white/8">
                    <input
                      checked={row.enabled}
                      onChange={(event) =>
                        updateRow(index, { enabled: event.target.checked })
                      }
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <span className="md:hidden">Enabled</span>
                  </label>
                </div>
                <div className="flex items-end justify-end md:self-center md:justify-center">
                  <Button
                    variant="ghost"
                    className="h-10 w-10 rounded-lg p-0 text-rose-300 hover:text-rose-200"
                    onClick={() => removeRow(index)}
                    aria-label={`Remove form-data row ${index + 1}`}
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <VariableBadges resolution={variableResolution} />
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => onChange([...rows, createFormValueRow()])}
      >
        <Plus className="h-4 w-4" />
        Add Row
      </Button>
    </div>
  );
}


