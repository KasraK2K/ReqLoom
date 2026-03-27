import {
  Copy,
  EllipsisVertical,
  PenSquare,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";

export interface ContextMenuAction {
  key: string;
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  className?: string;
}

interface ContextMenusProps {
  createActions?: ContextMenuAction[];
  customActions?: ContextMenuAction[];
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  leadingAccessory?: ReactNode;
}

const MENU_WIDTH = 172;
const VIEWPORT_GAP = 8;

export function ContextMenus({
  createActions,
  customActions,
  onRename,
  onDuplicate,
  onDelete,
  leadingAccessory,
}: ContextMenusProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const actions = useMemo(
    () =>
      [
        ...(createActions ?? []).map((action) => ({
          ...action,
          icon: action.icon ?? Plus,
          className: action.className ?? "text-foreground",
        })),
        ...(customActions ?? []).map((action) => ({
          ...action,
          icon: action.icon ?? Plus,
          className: action.className ?? "text-foreground",
        })),
        onRename
          ? {
              key: "rename",
              label: "Rename",
              icon: PenSquare,
              className: "text-foreground",
              onClick: onRename,
            }
          : null,
        onDuplicate
          ? {
              key: "duplicate",
              label: "Duplicate",
              icon: Copy,
              className: "text-foreground",
              onClick: onDuplicate,
            }
          : null,
        onDelete
          ? {
              key: "delete",
              label: "Delete",
              icon: Trash2,
              className: "",
              onClick: onDelete,
            }
          : null,
      ].filter(Boolean),
    [createActions, customActions, onDelete, onDuplicate, onRename],
  ) as Array<{
    key: string;
    label: string;
    icon: LucideIcon;
    className: string;
    onClick: () => void;
  }>;

  const menuHeight = actions.length * 32 + 8;

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
        window.innerHeight - rect.bottom >= menuHeight + VIEWPORT_GAP;
      const top = fitsBelow
        ? rect.bottom + 4
        : Math.max(VIEWPORT_GAP, rect.top - menuHeight - 4);
      const left = Math.max(
        VIEWPORT_GAP,
        Math.min(
          rect.right - MENU_WIDTH,
          window.innerWidth - MENU_WIDTH - VIEWPORT_GAP,
        ),
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
  }, [menuHeight, open]);

  if (actions.length === 0) {
    return null;
  }

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: MENU_WIDTH,
            }}
            className="app-dropdown-surface rounded-lg"
          >
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.key}
                  variant="ghost"
                  data-danger={action.key === "delete" ? "true" : undefined}
                  className={`app-dropdown-item h-8 justify-start rounded-md px-2 text-xs ${action.className}`}
                  onClick={() => runAction(action.onClick)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </Button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={rootRef}
        className="pointer-events-none absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        {leadingAccessory ? <div className="flex items-center">{leadingAccessory}</div> : null}
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


