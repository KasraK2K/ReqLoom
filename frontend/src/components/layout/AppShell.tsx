import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Layers3,
  LogOut,
  Send,
  Workflow,
} from "lucide-react";
import type { AdminUser, User } from "@restify/shared";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

const SIDEBAR_WIDTH_KEY = "httpclient.sidebar-width";
const INSPECTOR_COLLAPSED_KEY = "httpclient.inspector-collapsed";
const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 260;
const MAX_SIDEBAR_WIDTH = 560;
const INSPECTOR_WIDTH = 336;
const COLLAPSED_INSPECTOR_WIDTH = 52;

interface AppShellProps {
  user: AdminUser | User;
  activeWorkspaceName?: string;
  activeProjectName?: string;
  activeRequestName?: string;
  sidebar: ReactNode;
  builder: ReactNode;
  response: ReactNode;
  inspector: ReactNode;
  onLogout: () => Promise<void>;
}

interface ContextCrumbProps {
  icon: ReactNode;
  label: string;
  value?: string;
  emptyLabel: string;
  isCurrent?: boolean;
}

function clampSidebarWidth(width: number, maxWidth = MAX_SIDEBAR_WIDTH) {
  return Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

function getSidebarMaxWidth(
  containerWidth: number,
  isInspectorCollapsed: boolean,
) {
  const reservedWidth = isInspectorCollapsed ? 328 : 620;
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, containerWidth - reservedWidth),
  );
}

function ContextCrumb({
  icon,
  label,
  value,
  emptyLabel,
  isCurrent = false,
}: ContextCrumbProps) {
  const displayValue = value ?? emptyLabel;

  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      title={`${label}: ${displayValue}`}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-accent",
          isCurrent && "border-accent/25 bg-accent/10",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "truncate text-sm leading-6",
          value
            ? isCurrent
              ? "font-medium text-foreground"
              : "text-slate-300"
            : "text-muted",
        )}
      >
        {displayValue}
      </span>
    </div>
  );
}

export function AppShell({
  user,
  activeWorkspaceName,
  activeProjectName,
  activeRequestName,
  sidebar,
  builder,
  response,
  inspector,
  onLogout,
}: AppShellProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
      if (storedWidth) {
        const parsedWidth = Number(storedWidth);
        if (!Number.isNaN(parsedWidth)) {
          setSidebarWidth(clampSidebarWidth(parsedWidth));
        }
      }

      const storedInspectorState = window.localStorage.getItem(
        INSPECTOR_COLLAPSED_KEY,
      );
      if (storedInspectorState) {
        setIsInspectorCollapsed(storedInspectorState === "true");
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      return;
    }
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        INSPECTOR_COLLAPSED_KEY,
        String(isInspectorCollapsed),
      );
    } catch {
      return;
    }
  }, [isInspectorCollapsed]);

  useEffect(() => {
    const clampToViewport = () => {
      const containerWidth = mainRef.current?.getBoundingClientRect().width;
      if (!containerWidth) {
        return;
      }

      setSidebarWidth((currentWidth) =>
        clampSidebarWidth(
          currentWidth,
          getSidebarMaxWidth(containerWidth, isInspectorCollapsed),
        ),
      );
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [isInspectorCollapsed]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = mainRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextWidth = event.clientX - bounds.left;
      setSidebarWidth(
        clampSidebarWidth(
          nextWidth,
          getSidebarMaxWidth(bounds.width, isInspectorCollapsed),
        ),
      );
    };

    const stopResizing = () => setIsResizingSidebar(false);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [isInspectorCollapsed, isResizingSidebar]);

  const mainStyle = useMemo(
    () =>
      ({
        "--sidebar-width": `${sidebarWidth}px`,
        "--inspector-width": isInspectorCollapsed
          ? `${COLLAPSED_INSPECTOR_WIDTH}px`
          : `${INSPECTOR_WIDTH}px`,
      }) as CSSProperties,
    [isInspectorCollapsed, sidebarWidth],
  );

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (typeof window !== "undefined" && window.innerWidth <= 1280) {
      return;
    }

    event.preventDefault();
    setIsResizingSidebar(true);
  };

  return (
    <div className="flex h-screen overflow-hidden flex-col">
      <header className="shrink-0 border-b border-white/10 bg-slate-950/70 px-5 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] uppercase tracking-[0.28em] text-accent">
                HttpClient
              </div>
              <Badge className="border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-muted">
                {user.role}
              </Badge>
            </div>
            <nav
              className="mt-2 flex min-w-0 flex-wrap items-center gap-2"
              aria-label="Current request context"
            >
              <ContextCrumb
                icon={<Layers3 className="h-3.5 w-3.5" />}
                label="Workspace"
                value={activeWorkspaceName}
                emptyLabel="Select workspace"
              />
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/60" />
              <ContextCrumb
                icon={<Workflow className="h-3.5 w-3.5" />}
                label="Project"
                value={activeProjectName}
                emptyLabel="Select project"
              />
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/60" />
              <ContextCrumb
                icon={<Send className="h-3.5 w-3.5" />}
                label="Request"
                value={activeRequestName}
                emptyLabel="Select request"
                isCurrent
              />
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="min-w-0 text-right text-xs text-muted">
              <div className="truncate font-medium text-foreground">
                {user.username}
              </div>
              <div>Secure cookie session</div>
            </div>
            <Button
              className="h-9 rounded-full px-3"
              variant="secondary"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main
        ref={mainRef}
        style={mainStyle}
        className="grid min-h-0 flex-1 overflow-hidden grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--inspector-width)] gap-5 p-5 max-[1280px]:overflow-y-auto max-[1280px]:grid-cols-1"
      >
        <aside className="relative min-h-0 overflow-hidden">
          {sidebar}
          <button
            className="group absolute -right-4 top-0 flex h-full w-8 cursor-col-resize items-center justify-center max-[1280px]:hidden"
            onPointerDown={handleResizeStart}
            type="button"
            aria-label="Resize sidebar"
          >
            <span
              className={cn(
                "h-full w-px transition",
                isResizingSidebar ? "bg-accent/80" : "bg-white/10",
              )}
            />
            <span
              className={cn(
                "absolute left-1/2 top-1/2 h-14 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/90 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100",
                isResizingSidebar && "border-accent/30 bg-accent/20 opacity-100",
              )}
            />
          </button>
        </aside>
        <section className="grid min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)_minmax(260px,40%)] gap-4">
          {builder}
          {response}
        </section>
        <aside
          className={cn(
            "min-h-0 overflow-hidden",
            isInspectorCollapsed && "max-[1280px]:w-[52px] max-[1280px]:justify-self-end",
          )}
        >
          <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-card/85 shadow-glow backdrop-blur">
            <div
              className={cn(
                "min-w-0 flex-1 overflow-hidden transition-[width,opacity] duration-200",
                isInspectorCollapsed
                  ? "w-0 opacity-0"
                  : "w-[calc(100%-52px)] opacity-100",
              )}
            >
              {!isInspectorCollapsed ? (
                <div className="h-full overflow-y-auto p-3">{inspector}</div>
              ) : null}
            </div>
            <div
              className={cn(
                "flex w-[52px] shrink-0 flex-col items-center gap-3 bg-white/[0.02] px-2 py-3",
                !isInspectorCollapsed && "border-l border-white/8",
              )}
            >
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-muted transition hover:bg-white/[0.08] hover:text-foreground"
                onClick={() => setIsInspectorCollapsed((value) => !value)}
                type="button"
                aria-label={
                  isInspectorCollapsed
                    ? "Expand right sidebar"
                    : "Collapse right sidebar"
                }
                title={
                  isInspectorCollapsed
                    ? "Expand right sidebar"
                    : "Collapse right sidebar"
                }
              >
                {isInspectorCollapsed ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <span className="text-[10px] uppercase tracking-[0.24em] text-muted [writing-mode:vertical-rl]">
                Tools
              </span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}


