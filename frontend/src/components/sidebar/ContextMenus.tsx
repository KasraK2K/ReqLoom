import { Copy, EllipsisVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";

interface ContextMenusProps {
  onCreate?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

const MENU_WIDTH = 152;
const MENU_HEIGHT = 116;
const VIEWPORT_GAP = 8;

export function ContextMenus({
  onCreate,
  onDuplicate,
  onDelete,
}: ContextMenusProps) {
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
      const fitsBelow =
        window.innerHeight - rect.bottom >= MENU_HEIGHT + VIEWPORT_GAP;
      const top = fitsBelow
        ? rect.bottom + 4
        : Math.max(VIEWPORT_GAP, rect.top - MENU_HEIGHT - 4);
      const left = Math.max(
        VIEWPORT_GAP,
        Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP),
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

  if (!onCreate && !onDuplicate && !onDelete) {
    return null;
  }

  const runAction = (action?: () => void) => {
    setOpen(false);
    action?.();
  };

  const menu = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          style={{ top: menuPosition.top, left: menuPosition.left, width: MENU_WIDTH }}
          className="fixed z-[100] rounded-lg border border-white/10 bg-slate-950 p-1 shadow-2xl"
        >
          {onCreate ? (
            <Button
              variant="ghost"
              className="h-8 w-full justify-start rounded-md px-2 text-xs text-foreground"
              onClick={() => runAction(onCreate)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create
            </Button>
          ) : null}
          {onDuplicate ? (
            <Button
              variant="ghost"
              className="h-8 w-full justify-start rounded-md px-2 text-xs text-foreground"
              onClick={() => runAction(onDuplicate)}
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              variant="ghost"
              className="h-8 w-full justify-start rounded-md px-2 text-xs text-rose-200 hover:text-rose-100"
              onClick={() => runAction(onDelete)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        ref={rootRef}
        className="absolute right-0 top-1/2 z-20 -translate-y-1/2"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={triggerRef}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition hover:bg-white/[0.08] hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
          type="button"
          aria-label="Open item actions"
        >
          <EllipsisVertical className="h-3.5 w-3.5" />
        </button>
      </div>
      {menu}
    </>
  );
}

