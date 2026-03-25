import { useEffect, useRef, useState } from "react";
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

const DEFAULT_BODY_EDITOR_HEIGHT = 240;
const MIN_BODY_EDITOR_HEIGHT = 180;
const MAX_BODY_EDITOR_HEIGHT = 720;

function clampBodyEditorHeight(height: number) {
  return Math.min(
    MAX_BODY_EDITOR_HEIGHT,
    Math.max(MIN_BODY_EDITOR_HEIGHT, Math.round(height)),
  );
}

export function BodyEditor({ value, onChange }: BodyEditorProps) {
  const editorFrameRef = useRef<HTMLDivElement | null>(null);
  const [editorHeight, setEditorHeight] = useState(DEFAULT_BODY_EDITOR_HEIGHT);

  useEffect(() => {
    const frame = editorFrameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateHeight = (height: number) => {
      setEditorHeight(clampBodyEditorHeight(height));
    };

    updateHeight(frame.getBoundingClientRect().height);

    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height;
      if (nextHeight) {
        updateHeight(nextHeight);
      }
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, [value.type]);

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
        <div
          ref={editorFrameRef}
          className="min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] shadow-inner shadow-black/20"
        >
          <CodeMirror
            className="request-body-editor h-full w-full text-sm"
            theme={oneDark}
            value={value.content ?? ""}
            height={`${editorHeight}px`}
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