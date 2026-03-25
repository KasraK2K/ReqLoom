import type { HttpMethod } from "@restify/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { METHOD_OPTIONS, METHOD_STYLES } from "../../lib/methods";
import { cn } from "../../lib/cn";

interface MethodSelectorProps {
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
}

const MENU_WIDTH = 132;
const MENU_HEIGHT = 260;
const VIEWPORT_GAP = 8;

export function MethodSelector({ value, onChange }: MethodSelectorProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
      const availableBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP;
      const desiredHeight = Math.min(MENU_HEIGHT, availableBelow);
      const showAbove = desiredHeight < 180 && rect.top > availableBelow;
      const top = showAbove
        ? Math.max(VIEWPORT_GAP, rect.top - Math.min(MENU_HEIGHT, rect.top - VIEWPORT_GAP) - 4)
        : rect.bottom + 4;
      const left = Math.max(
        VIEWPORT_GAP,
        Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP),
      );

      setMenuPosition({ top, left });
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
  }, [open]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPosition.top, left: menuPosition.left, width: MENU_WIDTH }}
            className="fixed z-[100] overflow-hidden rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-2xl"
          >
            <div className="max-h-[260px] overflow-y-auto">
              {METHOD_OPTIONS.map((method) => (
                <button
                  key={method}
                  className={cn(
                    "flex h-9 w-full items-center rounded-lg px-2.5 text-sm font-semibold transition",
                    method === value
                      ? METHOD_STYLES[method]
                      : "text-foreground hover:bg-white/[0.06]",
                  )}
                  onClick={() => {
                    onChange(method);
                    setOpen(false);
                  }}
                  type="button"
                >
                  {method}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div ref={rootRef} className="shrink-0">
        <button
          ref={triggerRef}
          className={cn(
            "flex h-11 w-[108px] items-center justify-between rounded-xl border px-3 text-sm font-semibold outline-none transition",
            METHOD_STYLES[value],
          )}
          onClick={() => setOpen((current) => !current)}
          type="button"
          aria-label="Select request method"
          aria-expanded={open}
        >
          <span>{value}</span>
          <ChevronDown
            className={cn("h-4 w-4 transition", open && "rotate-180")}
          />
        </button>
      </div>
      {menu}
    </>
  );
}
