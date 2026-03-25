import type { HttpMethod } from "@restify/shared";
import { METHOD_OPTIONS, METHOD_STYLES } from "../../lib/methods";
import { cn } from "../../lib/cn";
import {
  DropdownSelect,
  type DropdownOption,
} from "../ui/DropdownSelect";

interface MethodSelectorProps {
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
}

const METHOD_DROPDOWN_OPTIONS: Array<DropdownOption<HttpMethod>> = METHOD_OPTIONS.map(
  (method) => ({ value: method, label: method }),
);

export function MethodSelector({ value, onChange }: MethodSelectorProps) {
  return (
    <DropdownSelect
      value={value}
      options={METHOD_DROPDOWN_OPTIONS}
      onChange={onChange}
      ariaLabel="Select request method"
      rootClassName="shrink-0"
      useDefaultTriggerStyle={false}
      triggerClassName={cn(
        "flex h-11 w-[108px] items-center justify-between rounded-xl border px-3 text-sm font-semibold outline-none transition",
        METHOD_STYLES[value],
      )}
      menuWidth={132}
      menuMaxHeight={260}
      getItemClassName={(option, isSelected) =>
        isSelected
          ? METHOD_STYLES[option.value]
          : "text-foreground hover:bg-white/[0.06]"
      }
    />
  );
}