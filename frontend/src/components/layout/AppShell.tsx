import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layers3, LogOut, Send, Workflow } from "lucide-react";
import type { AdminUser, User } from "@restify/shared";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

const SIDEBAR_WIDTH_KEY = "restify.sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 380;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 620;

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

interface ActiveContextPanelProps {
  icon: ReactNode;
  label: string;
  value?: string;
  emptyLabel: string;
}

function clampSidebarWidth(width: number, maxWidth = MAX_SIDEBAR_WIDTH) {
  return Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

function getSidebarMaxWidth(containerWidth: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, containerWidth - 520));
}

function ActiveContextPanel({
  icon,
  label,
  value,
  emptyLabel,
}: ActiveContextPanelProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted">
        <span className="text-accent">{icon}</span>
        <span>{label}</span>
      </div>
      <div
        className="mt-2 min-w-0 break-words text-sm font-medium leading-5 text-foreground"
        title={value ?? emptyLabel}
      >
        {value ?? emptyLabel}
      </div>
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
      if (!storedWidth) {
        return;
      }

      const parsedWidth = Number(storedWidth);
      if (!Number.isNaN(parsedWidth)) {
        setSidebarWidth(clampSidebarWidth(parsedWidth));
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
    const clampToViewport = () => {
      const containerWidth = mainRef.current?.getBoundingClientRect().width;
      if (!containerWidth) {
        return;
      }

      setSidebarWidth((currentWidth) =>
        clampSidebarWidth(currentWidth, getSidebarMaxWidth(containerWidth)),
      );
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

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
        clampSidebarWidth(nextWidth, getSidebarMaxWidth(bounds.width)),
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
  }, [isResizingSidebar]);

  const mainStyle = useMemo(
    () =>
      ({
        "--sidebar-width": `${sidebarWidth}px`,
      }) as CSSProperties,
    [sidebarWidth],
  );

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (typeof window !== "undefined" && window.innerWidth <= 1280) {
      return;
    }

    event.preventDefault();
    setIsResizingSidebar(true);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/10 bg-slate-950/70 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs uppercase tracking-[0.28em] text-accent">Restify</div>
              <Badge className="border-white/10 bg-white/4 text-foreground">
                {user.role}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ActiveContextPanel
                icon={<Layers3 className="h-3.5 w-3.5" />}
                label="Workspace"
                value={activeWorkspaceName}
                emptyLabel="No workspace selected"
              />
              <ActiveContextPanel
                icon={<Workflow className="h-3.5 w-3.5" />}
                label="Project"
                value={activeProjectName}
                emptyLabel="No project selected"
              />
              <ActiveContextPanel
                icon={<Send className="h-3.5 w-3.5" />}
                label="Request"
                value={activeRequestName}
                emptyLabel="No request selected"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 xl:min-w-[260px] xl:justify-start">
            <div className="min-w-0 text-sm text-muted xl:text-right">
              <div className="font-medium text-foreground">{user.username}</div>
              <div>Same-origin secure session</div>
            </div>
            <Button variant="secondary" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main
        ref={mainRef}
        style={mainStyle}
        className="grid min-h-0 flex-1 grid-cols-[var(--sidebar-width)_minmax(0,1fr)_340px] gap-5 p-5 max-[1500px]:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_320px] max-[1280px]:grid-cols-1"
      >
        <aside className="relative min-h-0">
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
        <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(280px,40%)] gap-4">
          {builder}
          {response}
        </section>
        <aside className="min-h-0 overflow-y-auto">{inspector}</aside>
      </main>
    </div>
  );
}

