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
  Shield,
  ShieldCheck,
  User as UserIcon,
  Workflow,
} from "lucide-react";
import type { AdminUser, User } from "@restify/shared";
import httpClientLogo from "../../assets/httpclient-logo.svg";
import { cn } from "../../lib/cn";
import type { ThemeId } from "../../lib/themes";
import { Button } from "../ui/button";
import { ThemeSelector } from "./ThemeSelector";

const SIDEBAR_WIDTH_KEY = "httpclient.sidebar-width";
const INSPECTOR_WIDTH_KEY = "httpclient.inspector-width";
const INSPECTOR_COLLAPSED_KEY = "httpclient.inspector-collapsed";
const BUILDER_HEIGHT_KEY = "httpclient.builder-height";
const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 260;
const MAX_SIDEBAR_WIDTH = 560;
const DEFAULT_INSPECTOR_WIDTH = 336;
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 520;
const COLLAPSED_INSPECTOR_WIDTH = 52;
const DEFAULT_BUILDER_HEIGHT = 420;
const MIN_BUILDER_HEIGHT = 320;
const MIN_RESPONSE_HEIGHT = 240;
const CENTER_SECTION_GAP = 16;

interface AppShellProps {
  user: AdminUser | User;
  activeWorkspaceName?: string;
  activeProjectName?: string;
  activeRequestName?: string;
  themeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
  onThemePreview: (themeId: ThemeId) => void;
  onThemePreviewEnd: () => void;
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

function clampInspectorWidth(width: number, maxWidth = MAX_INSPECTOR_WIDTH) {
  return Math.min(
    maxWidth,
    Math.max(MIN_INSPECTOR_WIDTH, Math.round(width)),
  );
}

function clampBuilderHeight(
  height: number,
  maxHeight = Number.POSITIVE_INFINITY,
) {
  const resolvedMaxHeight = Math.max(MIN_BUILDER_HEIGHT, Math.round(maxHeight));
  return Math.min(
    resolvedMaxHeight,
    Math.max(MIN_BUILDER_HEIGHT, Math.round(height)),
  );
}

function getSidebarMaxWidth(containerWidth: number, inspectorWidth: number) {
  const reservedWidth = inspectorWidth + 284;
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, containerWidth - reservedWidth),
  );
}

function getInspectorMaxWidth(containerWidth: number, sidebarWidth: number) {
  return Math.min(
    MAX_INSPECTOR_WIDTH,
    Math.max(MIN_INSPECTOR_WIDTH, containerWidth - sidebarWidth - 360),
  );
}

function getBuilderMaxHeight(sectionHeight: number) {
  return Math.max(
    MIN_BUILDER_HEIGHT,
    sectionHeight - MIN_RESPONSE_HEIGHT - CENTER_SECTION_GAP,
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
      className="flex min-w-0 max-w-full items-center gap-1.5"
      title={`${label}: ${displayValue}`}
      aria-current={isCurrent ? "page" : undefined}
    >
      <span
        className={cn(
          "shrink-0 text-muted/75",
          isCurrent && "text-accent",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "truncate text-sm leading-5",
          value
            ? isCurrent
              ? "font-medium text-foreground"
              : "text-foreground/72"
            : "text-muted",
        )}
      >
        {displayValue}
      </span>
    </div>
  );
}

function RoleBadge({ role }: { role: AdminUser["role"] | User["role"] }) {
  let label = "Member";
  let icon = <UserIcon className="h-3 w-3" />;
  let badgeClassName =
    "border-border/55 bg-[rgb(var(--surface-2)/0.72)] text-foreground/82";

  if (role === "superadmin") {
    label = "Super Admin";
    icon = <ShieldCheck className="h-3 w-3" />;
    badgeClassName = "border-sky-400/20 bg-sky-400/10 text-sky-200";
  } else if (role === "admin") {
    label = "Admin";
    icon = <Shield className="h-3 w-3" />;
    badgeClassName = "border-emerald-400/18 bg-emerald-400/10 text-emerald-200";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        badgeClassName,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

export function AppShell({
  user,
  activeWorkspaceName,
  activeProjectName,
  activeRequestName,
  themeId,
  onThemeChange,
  onThemePreview,
  onThemePreviewEnd,
  sidebar,
  builder,
  response,
  inspector,
  onLogout,
}: AppShellProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const centerSectionRef = useRef<HTMLElement | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const [builderHeight, setBuilderHeight] = useState(DEFAULT_BUILDER_HEIGHT);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingInspector, setIsResizingInspector] = useState(false);
  const [isResizingCenter, setIsResizingCenter] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [hasLoadedLayoutPrefs, setHasLoadedLayoutPrefs] = useState(false);

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

      const storedInspectorWidth = window.localStorage.getItem(
        INSPECTOR_WIDTH_KEY,
      );
      if (storedInspectorWidth) {
        const parsedWidth = Number(storedInspectorWidth);
        if (!Number.isNaN(parsedWidth)) {
          setInspectorWidth(clampInspectorWidth(parsedWidth));
        }
      }

      const storedBuilderHeight = window.localStorage.getItem(
        BUILDER_HEIGHT_KEY,
      );
      if (storedBuilderHeight) {
        const parsedHeight = Number(storedBuilderHeight);
        if (!Number.isNaN(parsedHeight)) {
          setBuilderHeight(clampBuilderHeight(parsedHeight));
        }
      }

      const storedInspectorState = window.localStorage.getItem(
        INSPECTOR_COLLAPSED_KEY,
      );
      if (storedInspectorState) {
        setIsInspectorCollapsed(storedInspectorState === "true");
      }
    } catch {
      setHasLoadedLayoutPrefs(true);
      return;
    }

    setHasLoadedLayoutPrefs(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedLayoutPrefs) {
      return;
    }

    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      return;
    }
  }, [hasLoadedLayoutPrefs, sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedLayoutPrefs) {
      return;
    }

    try {
      window.localStorage.setItem(
        INSPECTOR_WIDTH_KEY,
        String(inspectorWidth),
      );
    } catch {
      return;
    }
  }, [hasLoadedLayoutPrefs, inspectorWidth]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedLayoutPrefs) {
      return;
    }

    try {
      window.localStorage.setItem(BUILDER_HEIGHT_KEY, String(builderHeight));
    } catch {
      return;
    }
  }, [builderHeight, hasLoadedLayoutPrefs]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedLayoutPrefs) {
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
  }, [hasLoadedLayoutPrefs, isInspectorCollapsed]);

  useEffect(() => {
    const clampToViewport = () => {
      const containerWidth = mainRef.current?.getBoundingClientRect().width;
      if (containerWidth) {
        const nextInspectorWidth = isInspectorCollapsed
          ? inspectorWidth
          : clampInspectorWidth(
              inspectorWidth,
              getInspectorMaxWidth(containerWidth, sidebarWidth),
            );

        if (!isInspectorCollapsed && nextInspectorWidth !== inspectorWidth) {
          setInspectorWidth(nextInspectorWidth);
        }

        setSidebarWidth((currentWidth) =>
          clampSidebarWidth(
            currentWidth,
            getSidebarMaxWidth(
              containerWidth,
              isInspectorCollapsed
                ? COLLAPSED_INSPECTOR_WIDTH
                : nextInspectorWidth,
            ),
          ),
        );
      }

      const sectionHeight = centerSectionRef.current?.getBoundingClientRect().height;
      if (sectionHeight) {
        setBuilderHeight((currentHeight) =>
          clampBuilderHeight(currentHeight, getBuilderMaxHeight(sectionHeight)),
        );
      }
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [inspectorWidth, isInspectorCollapsed, sidebarWidth]);

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
          getSidebarMaxWidth(
            bounds.width,
            isInspectorCollapsed
              ? COLLAPSED_INSPECTOR_WIDTH
              : inspectorWidth,
          ),
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
  }, [inspectorWidth, isInspectorCollapsed, isResizingSidebar]);

  useEffect(() => {
    if (!isResizingInspector || isInspectorCollapsed) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = mainRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextWidth = bounds.right - event.clientX;
      setInspectorWidth(
        clampInspectorWidth(
          nextWidth,
          getInspectorMaxWidth(bounds.width, sidebarWidth),
        ),
      );
    };

    const stopResizing = () => setIsResizingInspector(false);

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
  }, [isInspectorCollapsed, isResizingInspector, sidebarWidth]);

  useEffect(() => {
    if (!isResizingCenter) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = centerSectionRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextHeight = event.clientY - bounds.top;
      setBuilderHeight(
        clampBuilderHeight(nextHeight, getBuilderMaxHeight(bounds.height)),
      );
    };

    const stopResizing = () => setIsResizingCenter(false);

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [isResizingCenter]);

  const mainStyle = useMemo(
    () =>
      ({
        "--sidebar-width": `${sidebarWidth}px`,
        "--inspector-width": isInspectorCollapsed
          ? `${COLLAPSED_INSPECTOR_WIDTH}px`
          : `${inspectorWidth}px`,
      }) as CSSProperties,
    [inspectorWidth, isInspectorCollapsed, sidebarWidth],
  );

  const centerStyle = useMemo(
    () => ({
      "--builder-height": `${builderHeight}px`,
    }) as CSSProperties,
    [builderHeight],
  );

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (typeof window !== "undefined" && window.innerWidth <= 1280) {
      return;
    }

    event.preventDefault();
    setIsResizingSidebar(true);
  };

  const handleInspectorResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (
      isInspectorCollapsed ||
      (typeof window !== "undefined" && window.innerWidth <= 1280)
    ) {
      return;
    }

    event.preventDefault();
    setIsResizingInspector(true);
  };

  const handleCenterResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (typeof window !== "undefined" && window.innerWidth <= 1280) {
      return;
    }

    event.preventDefault();
    setIsResizingCenter(true);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/60 bg-[rgb(var(--header-bg)/0.94)] px-4 py-2.5 shadow-[0_14px_32px_rgb(var(--shadow)/0.12),inset_0_-1px_0_rgb(var(--header-border)/0.42)] backdrop-blur-xl sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img
              src={httpClientLogo}
              alt="HttpClient"
              className="h-8 w-auto max-w-[180px] shrink-0 sm:h-9 sm:max-w-[208px]"
            />
            <span className="hidden h-6 w-px shrink-0 bg-border/60 sm:block" aria-hidden="true" />
            <nav
              className="hidden min-w-0 flex-wrap items-center gap-2.5 sm:flex"
              aria-label="Current request context"
            >
              <ContextCrumb
                icon={<Layers3 className="h-3.5 w-3.5" />}
                label="Workspace"
                value={activeWorkspaceName}
                emptyLabel="Select workspace"
              />
              <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden="true" />
              <ContextCrumb
                icon={<Workflow className="h-3.5 w-3.5" />}
                label="Project"
                value={activeProjectName}
                emptyLabel="Select project"
              />
              <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden="true" />
              <ContextCrumb
                icon={<Send className="h-3.5 w-3.5" />}
                label="Request"
                value={activeRequestName}
                emptyLabel="Select request"
                isCurrent
              />
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <ThemeSelector
              value={themeId}
              onChange={onThemeChange}
              onPreviewTheme={onThemePreview}
              onClearPreview={onThemePreviewEnd}
            />
            <RoleBadge role={user.role} />
            <span className="hidden h-6 w-px shrink-0 bg-border/60 sm:block" aria-hidden="true" />
            <span className="hidden truncate text-sm font-medium text-foreground sm:block max-[900px]:hidden">
              {user.username}
            </span>
            <Button
              className="h-8 rounded-lg px-2.5"
              variant="ghost"
              onClick={onLogout}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="max-[640px]:hidden">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main
        ref={mainRef}
        style={mainStyle}
        className="grid min-h-0 flex-1 grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--inspector-width)] gap-4 overflow-hidden p-3 sm:gap-5 sm:p-5 max-[1280px]:grid-cols-1 max-[1280px]:overflow-y-auto"
      >
        <aside className="relative min-h-0 overflow-hidden">
          {sidebar}
          <button
            className="group absolute inset-y-3 -right-4 flex w-8 cursor-col-resize items-center justify-center max-[1280px]:hidden"
            onPointerDown={handleResizeStart}
            type="button"
            aria-label="Resize sidebar"
          >
            <span
              className={cn(
                "h-full w-px transition",
                isResizingSidebar ? "bg-accent/80" : "bg-border/75",
              )}
            />
            <span
              className={cn(
                "absolute left-1/2 top-1/2 h-14 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/60 bg-[rgb(var(--surface-3)/0.94)] opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100",
                isResizingSidebar && "border-accent/30 bg-accent/20 opacity-100",
              )}
            />
          </button>
        </aside>
        <section
          ref={centerSectionRef}
          style={centerStyle}
          className="grid min-h-0 grid-rows-[var(--builder-height)_minmax(240px,1fr)] gap-4 overflow-hidden"
        >
          <div className="min-h-0 overflow-hidden">{builder}</div>
          <div className="relative min-h-0 overflow-hidden">
            <button
              className="group absolute left-0 -top-4 z-10 flex h-8 w-full cursor-row-resize items-center justify-center max-[1280px]:hidden"
              onPointerDown={handleCenterResizeStart}
              type="button"
              aria-label="Resize request builder and response viewer"
            >
              <span
                className={cn(
                  "h-px w-full transition",
                  isResizingCenter ? "bg-accent/80" : "bg-border/75",
                )}
              />
              <span
                className={cn(
                  "absolute left-1/2 top-1/2 h-2 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/60 bg-[rgb(var(--surface-3)/0.94)] opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100",
                  isResizingCenter && "border-accent/30 bg-accent/20 opacity-100",
                )}
              />
            </button>
            {response}
          </div>
        </section>
        <aside
          className={cn(
            "relative min-h-0 overflow-hidden",
            isInspectorCollapsed && "max-[1280px]:w-[52px] max-[1280px]:justify-self-end",
          )}
        >
          {!isInspectorCollapsed ? (
            <button
              className="group absolute inset-y-3 -left-4 z-10 flex w-8 cursor-col-resize items-center justify-center max-[1280px]:hidden"
              onPointerDown={handleInspectorResizeStart}
              type="button"
              aria-label="Resize right sidebar"
            >
              <span
                className={cn(
                  "h-full w-px transition",
                  isResizingInspector ? "bg-accent/80" : "bg-border/75",
                )}
              />
              <span
                className={cn(
                  "absolute left-1/2 top-1/2 h-14 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/60 bg-[rgb(var(--surface-3)/0.94)] opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100",
                  isResizingInspector && "border-accent/30 bg-accent/20 opacity-100",
                )}
              />
            </button>
          ) : null}
          <div className="flex h-full min-h-0 overflow-hidden rounded-[1.1rem] border border-border/55 bg-card/86 shadow-glow backdrop-blur-xl">
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
                "flex w-[52px] shrink-0 flex-col items-center gap-3 bg-[rgb(var(--surface-2)/0.56)] px-2 py-3",
                !isInspectorCollapsed && "border-l border-border/40",
              )}
            >
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/55 bg-[rgb(var(--surface-1)/0.74)] text-muted transition hover:bg-[rgb(var(--surface-2)/0.84)] hover:text-foreground"
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

