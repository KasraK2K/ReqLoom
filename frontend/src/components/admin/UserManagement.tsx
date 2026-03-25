import type { User, WorkspaceMeta } from "@restify/shared";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { cn } from "../../lib/cn";

interface UserManagementProps {
  users: User[];
  workspaces: WorkspaceMeta[];
  onCreate: (payload: {
    username: string;
    password: string;
    role: "admin" | "member";
    workspaceIds: string[];
  }) => Promise<void>;
  onUpdate: (
    userId: string,
    payload: { role?: "admin" | "member"; workspaceIds?: string[] },
  ) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}

type UserRole = "admin" | "member";

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

const MENU_WIDTH = 152;
const MENU_HEIGHT = 96;
const VIEWPORT_GAP = 8;

function RoleSelector({
  value,
  onChange,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
}) {
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

  const selectedOption =
    ROLE_OPTIONS.find((option) => option.value === value) ?? ROLE_OPTIONS[0];

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPosition.top, left: menuPosition.left, width: MENU_WIDTH }}
            className="fixed z-[100] overflow-hidden rounded-xl border border-white/10 bg-slate-950 p-1 shadow-2xl"
          >
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={cn(
                  "flex h-9 w-full items-center rounded-lg px-2.5 text-sm transition",
                  option.value === value
                    ? "bg-accent text-slate-950"
                    : "text-foreground hover:bg-white/[0.06]",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div ref={rootRef} className="min-w-0">
        <button
          ref={triggerRef}
          className="flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-foreground outline-none transition hover:border-white/20 hover:bg-slate-900"
          onClick={() => setOpen((current) => !current)}
          type="button"
          aria-label="Select user role"
          aria-expanded={open}
        >
          <span>{selectedOption.label}</span>
          <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
      </div>
      {menu}
    </>
  );
}

export function UserManagement({
  users,
  workspaces,
  onCreate,
  onUpdate,
  onDelete,
}: UserManagementProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username)),
    [users],
  );

  const toggleWorkspace = (workspaceId: string) => {
    setWorkspaceIds((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId],
    );
  };

  const handleCreate = async () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password || !confirmPassword) {
      setError("Username, password, and confirm password are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await onCreate({
        username: trimmedUsername,
        password,
        role,
        workspaceIds,
      });
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setRole("member");
      setWorkspaceIds([]);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create user",
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-2xl border border-white/8 bg-white/4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
            />
            <RoleSelector value={role} onChange={setRole} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {workspaces.map((workspace) => (
              <label
                key={workspace._id}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-muted"
              >
                <input
                  checked={workspaceIds.includes(workspace._id)}
                  onChange={() => toggleWorkspace(workspace._id)}
                  type="checkbox"
                />
                {workspace.name}
              </label>
            ))}
          </div>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <Button
            onClick={() => void handleCreate()}
            disabled={isCreating || !username || !password || !confirmPassword}
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Creating User..." : "Create User"}
          </Button>
        </div>
        <div className="space-y-3">
          {sortedUsers.map((user) => (
            <div
              key={user._id}
              className="rounded-2xl border border-white/8 bg-white/4 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">
                    {user.username}
                  </div>
                  <div className="text-xs text-muted">Role: {user.role}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      onUpdate(user._id, {
                        role: user.role === "admin" ? "member" : "admin",
                      })
                    }
                  >
                    Toggle Role
                  </Button>
                  <Button variant="destructive" onClick={() => onDelete(user._id)}>
                    Delete
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {workspaces.map((workspace) => {
                  const checked = user.workspaceIds.includes(workspace._id);
                  return (
                    <label
                      key={`${user._id}-${workspace._id}`}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-muted"
                    >
                      <input
                        checked={checked}
                        onChange={() =>
                          onUpdate(user._id, {
                            workspaceIds: checked
                              ? user.workspaceIds.filter(
                                  (id) => id !== workspace._id,
                                )
                              : [...user.workspaceIds, workspace._id],
                          })
                        }
                        type="checkbox"
                      />
                      {workspace.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
