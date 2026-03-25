import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownSelectProps<T extends string> {
  value: T;
  options: Array<DropdownOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  rootClassName?: string;
  triggerClassName?: string;
  menuClassName?: string;
  itemClassName?: string;
  menuWidth?: number;
  menuMaxHeight?: number;
  useDefaultTriggerStyle?: boolean;
  getTriggerClassName?: (option: DropdownOption<T>) => string | undefined;
  getItemClassName?: (
    option: DropdownOption<T>,
    selected: boolean,
  ) => string | undefined;
  renderOption?: (option: DropdownOption<T>) => ReactNode;
}

const VIEWPORT_GAP = 8;

export function DropdownSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  rootClassName,
  triggerClassName,
  menuClassName,
  itemClassName,
  menuWidth,
  menuMaxHeight = 260,
  useDefaultTriggerStyle = true,
  getTriggerClassName,
  getItemClassName,
  renderOption,
}: DropdownSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: menuWidth ?? 0,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const width = menuWidth ?? rect.width;
      const availableBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP;
      const desiredHeight = Math.min(menuMaxHeight, availableBelow);
      const showAbove = desiredHeight < 180 && rect.top > availableBelow;
      const top = showAbove
        ? Math.max(
            VIEWPORT_GAP,
            rect.top - Math.min(menuMaxHeight, rect.top - VIEWPORT_GAP) - 4,
          )
        : rect.bottom + 4;
      const left = Math.max(
        VIEWPORT_GAP,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_GAP),
      );

      setMenuPosition({ top, left, width });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuMaxHeight, menuWidth, open]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
            className={cn("app-dropdown-surface", menuClassName)}
          >
            <div style={{ maxHeight: menuMaxHeight }} className="overflow-y-auto">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    className={cn(
                      "app-dropdown-item",
                      itemClassName,
                      getItemClassName?.(option, isSelected),
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    {renderOption ? renderOption(option) : option.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div ref={rootRef} className={cn("min-w-0", rootClassName)}>
        <button
          ref={triggerRef}
          className={cn(
            useDefaultTriggerStyle && "app-dropdown-trigger",
            triggerClassName,
            selectedOption ? getTriggerClassName?.(selectedOption) : undefined,
          )}
          onClick={() => setOpen((current) => !current)}
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : value}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition", open && "rotate-180")} />
        </button>
      </div>
      {menu}
    </>
  );
}