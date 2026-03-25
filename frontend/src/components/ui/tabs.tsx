import * as React from "react";
import { cn } from "../../lib/cn";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: React.PropsWithChildren<{
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}>) {
  const baseId = React.useId();

  return (
    <TabsContext.Provider value={{ value, onValueChange, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  onClick,
  onKeyDown,
  type,
  disabled,
  ...props
}: React.PropsWithChildren<{
  value: string;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsTrigger must be used inside Tabs");
  }

  const active = context.value === value;
  const triggerId = `${context.baseId}-trigger-${value}`;
  const panelId = `${context.baseId}-panel-${value}`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    const tabList = event.currentTarget.closest('[role="tablist"]');
    const triggers = Array.from(
      tabList?.querySelectorAll<HTMLButtonElement>(
        'button[data-tabs-trigger="true"]:not(:disabled)',
      ) ?? [],
    );

    if (triggers.length === 0) {
      return;
    }

    event.preventDefault();

    const currentIndex = triggers.findIndex(
      (trigger) => trigger === event.currentTarget,
    );

    if (currentIndex === -1) {
      return;
    }

    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % triggers.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + triggers.length) % triggers.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = triggers.length - 1;
    }

    const nextTrigger = triggers[nextIndex];
    const nextValue = nextTrigger.dataset.tabsValue;
    if (!nextValue) {
      return;
    }

    nextTrigger.focus();
    context.onValueChange(nextValue);
  };

  return (
    <button
      role="tab"
      id={triggerId}
      aria-selected={active}
      aria-controls={panelId}
      data-tabs-trigger="true"
      data-tabs-value={value}
      disabled={disabled}
      className={cn(
        "rounded-[6px] px-3 py-1.5 text-[13px] leading-5 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "bg-accent text-slate-950"
          : "text-muted hover:bg-white/6 hover:text-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
          context.onValueChange(value);
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={active ? 0 : -1}
      type={type ?? "button"}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: React.PropsWithChildren<{ value: string; className?: string }>) {
  const context = React.useContext(TabsContext);
  if (!context || context.value !== value) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`${context.baseId}-panel-${value}`}
      aria-labelledby={`${context.baseId}-trigger-${value}`}
      className={className}
    >
      {children}
    </div>
  );
}
