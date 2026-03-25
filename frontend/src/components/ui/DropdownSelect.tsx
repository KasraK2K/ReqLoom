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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: menuWidth ?? 0,
    maxHeight: menuMaxHeight,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selectedOption = useMemo(
    () => options[selectedIndex] ?? options[0],
    [options, selectedIndex],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }

    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

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
      const availableBelow = Math.max(
        0,
        window.innerHeight - rect.bottom - VIEWPORT_GAP - 4,
      );
      const availableAbove = Math.max(0, rect.top - VIEWPORT_GAP - 4);
      const showAbove = availableBelow < 180 && availableAbove > availableBelow;
      const maxHeight = Math.max(
        72,
        Math.min(menuMaxHeight, showAbove ? availableAbove : availableBelow),
      );
      const top = showAbove
        ? Math.max(VIEWPORT_GAP, rect.top - maxHeight - 4)
        : Math.min(rect.bottom + 4, window.innerHeight - VIEWPORT_GAP - maxHeight);
      const left = Math.max(
        VIEWPORT_GAP,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_GAP),
      );

      setMenuPosition({ top, left, width, maxHeight });
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
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === "Tab") {
        setOpen(false);
        return;
      }

      if (options.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((current) => (current + 1) % options.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((current) =>
          (current - 1 + options.length) % options.length,
        );
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setHighlightedIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setHighlightedIndex(options.length - 1);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = options[highlightedIndex];
        if (!option) {
          return;
        }
        onChange(option.value);
        setOpen(false);
        triggerRef.current?.focus();
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
  }, [highlightedIndex, menuMaxHeight, menuWidth, onChange, open, options]);

  useEffect(() => {
    if (open) {
      menuRef.current?.focus();
    }
  }, [open]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
            className={cn("app-dropdown-surface", menuClassName)}
          >
            <div
              style={{ maxHeight: menuPosition.maxHeight }}
              className="overflow-y-auto"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <button
                    key={option.value}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "app-dropdown-item",
                      isHighlighted && !isSelected && "bg-white/[0.08] text-foreground",
                      itemClassName,
                      getItemClassName?.(option, isSelected),
                    )}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      triggerRef.current?.focus();
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
          onKeyDown={(event) => {
            if (options.length === 0) {
              return;
            }

            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex(
                event.key === "ArrowUp"
                  ? Math.max(options.length - 1, 0)
                  : selectedIndex >= 0
                    ? selectedIndex
                    : 0,
              );
            }
          }}
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : value}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition", open && "rotate-180")}
          />
        </button>
      </div>
      {menu}
    </>
  );
}
