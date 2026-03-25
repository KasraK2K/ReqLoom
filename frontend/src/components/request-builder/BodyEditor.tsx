import type { RequestBodyConfig } from "@restify/shared";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { createFormValueRow } from "../../lib/request-helpers";
import {
  DropdownSelect,
  type DropdownOption,
} from "../ui/DropdownSelect";
import { KeyValueTable } from "./KeyValueTable";

interface BodyEditorProps {
  value: RequestBodyConfig;
  onChange: (value: RequestBodyConfig) => void;
}

const BODY_TYPE_OPTIONS: Array<DropdownOption<RequestBodyConfig["type"]>> = [
  { value: "none", label: "None" },
  { value: "json", label: "Raw JSON" },
  { value: "text", label: "Raw Text" },
  { value: "form-data", label: "Form Data" },
  {
    value: "x-www-form-urlencoded",
    label: "x-www-form-urlencoded",
  },
];

export function BodyEditor({ value, onChange }: BodyEditorProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3">
      <DropdownSelect
        value={value.type}
        options={BODY_TYPE_OPTIONS}
        onChange={(type) => onChange({ ...value, type })}
        ariaLabel="Select request body type"
        triggerClassName="max-w-full sm:w-[220px]"
        getItemClassName={(_option, isSelected) =>
          isSelected
            ? "bg-accent text-slate-950"
            : "text-foreground hover:bg-white/[0.06]"
        }
      />
      {value.type === "json" || value.type === "text" ? (
        <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] shadow-inner shadow-black/20">
          <CodeMirror
            className="request-body-editor h-full w-full text-sm"
            theme={oneDark}
            value={value.content ?? ""}
            height="100%"
            extensions={value.type === "json" ? [json()] : []}
            onChange={(content) => onChange({ ...value, content })}
          />
        </div>
      ) : null}
      {value.type === "form-data" || value.type === "x-www-form-urlencoded" ? (
        <KeyValueTable
          rows={value.values ?? [createFormValueRow()]}
          onChange={(rows) => onChange({ ...value, values: rows })}
          createRow={createFormValueRow}
          keyLabel="Field"
          valueLabel="Value"
        />
      ) : null}
    </div>
  );
}
