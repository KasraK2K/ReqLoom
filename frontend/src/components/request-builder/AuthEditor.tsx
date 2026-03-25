import type { RequestAuthConfig } from "@restify/shared";
import {
  DropdownSelect,
  type DropdownOption,
} from "../ui/DropdownSelect";
import { Input } from "../ui/input";

interface AuthEditorProps {
  value: RequestAuthConfig;
  onChange: (value: RequestAuthConfig) => void;
}

const AUTH_TYPE_OPTIONS: Array<DropdownOption<RequestAuthConfig["type"]>> = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
];

export function AuthEditor({ value, onChange }: AuthEditorProps) {
  return (
    <div className="space-y-3">
      <DropdownSelect
        value={value.type}
        options={AUTH_TYPE_OPTIONS}
        onChange={(type) => onChange({ type })}
        ariaLabel="Select request auth type"
        triggerClassName="max-w-full sm:w-[220px]"
        getItemClassName={(_option, isSelected) =>
          isSelected
            ? "bg-accent text-slate-950"
            : "text-foreground hover:bg-white/[0.06]"
        }
      />
      {value.type === "bearer" ? (
        <Input
          value={value.token ?? ""}
          onChange={(event) =>
            onChange({ ...value, token: event.target.value })
          }
          placeholder="Bearer token"
        />
      ) : null}
      {value.type === "basic" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={value.username ?? ""}
            onChange={(event) =>
              onChange({ ...value, username: event.target.value })
            }
            placeholder="Username"
          />
          <Input
            type="password"
            value={value.password ?? ""}
            onChange={(event) =>
              onChange({ ...value, password: event.target.value })
            }
            placeholder="Password"
          />
        </div>
      ) : null}
    </div>
  );
}