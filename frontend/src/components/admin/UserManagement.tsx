import type { ChangeUserPasswordPayload, User, WorkspaceMeta } from "@restify/shared";
import { KeyRound, Plus, Shield, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from "../../store/toasts";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Dialog } from "../ui/dialog";
import {
  DropdownSelect,
  type DropdownOption,
} from "../ui/DropdownSelect";
import { Input } from "../ui/input";

interface UserManagementProps {
  users: User[];
  workspaces: WorkspaceMeta[];
  onCreate: (payload: {
    name: string;
    username: string;
    password: string;
    role: "admin" | "member";
    workspaceIds: string[];
  }) => Promise<void>;
  onUpdate: (
    userId: string,
    payload: { role?: "admin" | "member"; workspaceIds?: string[] },
  ) => Promise<void>;
  onChangePassword: (
    userId: string,
    payload: ChangeUserPasswordPayload,
  ) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}

type UserRole = "admin" | "member";

const ROLE_OPTIONS: Array<DropdownOption<UserRole>> = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  member: "border-white/10 bg-white/[0.05] text-slate-200",
  admin: "border-sky-400/20 bg-sky-500/10 text-sky-200",
};

function getUserDisplayName(user: Pick<User, "name" | "username">) {
  return user.name?.trim() || user.username;
}

function RoleSelector({
  value,
  onChange,
  compact = false,
  disabled = false,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownSelect
      value={value}
      options={ROLE_OPTIONS}
      onChange={onChange}
      ariaLabel="Select user role"
      triggerClassName={cn(
        "bg-slate-950/70",
        compact && "h-9 rounded-lg px-2.5 text-xs",
        disabled && "pointer-events-none opacity-60",
      )}
      menuWidth={compact ? 132 : 152}
      getItemClassName={(_option, isSelected) =>
        isSelected
          ? "bg-accent text-slate-950"
          : "text-foreground hover:bg-white/[0.06]"
      }
    />
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        ROLE_BADGE_STYLES[role],
      )}
    >
      {role === "admin" ? "Admin" : "Member"}
    </span>
  );
}

function WorkspaceAccessPicker({
  workspaces,
  selectedIds,
  onToggle,
  disabled = false,
}: {
  workspaces: WorkspaceMeta[];
  selectedIds: string[];
  onToggle: (workspaceId: string) => void;
  disabled?: boolean;
}) {
  if (workspaces.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-slate-950/35 px-3 py-3 text-xs text-muted">
        No workspaces available yet.
      </div>
    );
  }

  return (
    <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
      {workspaces.map((workspace) => {
        const checked = selectedIds.includes(workspace._id);
        return (
          <label
            key={workspace._id}
            className={cn(
              "flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition",
              disabled && "pointer-events-none opacity-60",
              checked
                ? "border-sky-400/25 bg-sky-500/10 text-sky-100"
                : "border-white/10 bg-slate-950/40 text-muted hover:border-white/18 hover:bg-white/[0.04]",
            )}
          >
            <input
              checked={checked}
              onChange={() => onToggle(workspace._id)}
              type="checkbox"
              className="sr-only"
              disabled={disabled}
            />
            <span className="truncate">{workspace.name}</span>
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                checked ? "bg-sky-300" : "bg-white/20",
              )}
            />
          </label>
        );
      })}
    </div>
  );
}

export function UserManagement({
  users,
  workspaces,
  onCreate,
  onUpdate,
  onChangePassword,
  onDelete,
}: UserManagementProps) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const nameComparison = getUserDisplayName(a).localeCompare(
          getUserDisplayName(b),
        );
        if (nameComparison !== 0) {
          return nameComparison;
        }

        return a.username.localeCompare(b.username);
      }),
    [users],
  );

  const toggleWorkspace = (workspaceId: string) => {
    setWorkspaceIds((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId],
    );
  };

  const setUserPending = (userId: string, pending: boolean) => {
    setPendingUserIds((current) => {
      if (pending) {
        return current.includes(userId) ? current : [...current, userId];
      }
      return current.filter((id) => id !== userId);
    });
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();

    if (!trimmedName || !trimmedUsername || !password || !confirmPassword) {
      showWarningToast(
        "Name, username, password, and confirm password are required",
        "Missing Information",
      );
      return;
    }

    if (password !== confirmPassword) {
      showWarningToast("Passwords do not match", "Check Passwords");
      return;
    }

    setIsCreating(true);

    try {
      await onCreate({
        name: trimmedName,
        username: trimmedUsername,
        password,
        role,
        workspaceIds,
      });
      setName("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setRole("member");
      setWorkspaceIds([]);
    } catch (createError) {
      showErrorToast(createError, {
        title: "Create User Failed",
        fallbackMessage: "Unable to create user",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (
    userId: string,
    payload: { role?: UserRole; workspaceIds?: string[] },
  ) => {
    setUserPending(userId, true);
    try {
      await onUpdate(userId, payload);
    } catch (updateError) {
      showErrorToast(updateError, {
        title: "Update User Failed",
        fallbackMessage: "Unable to update user",
      });
    } finally {
      setUserPending(userId, false);
    }
  };

  const handleDelete = async (userId: string) => {
    setUserPending(userId, true);
    try {
      await onDelete(userId);
    } catch (deleteError) {
      showErrorToast(deleteError, {
        title: "Delete User Failed",
        fallbackMessage: "Unable to delete user",
      });
    } finally {
      setUserPending(userId, false);
    }
  };

  const openPasswordReset = (user: User) => {
    setPasswordResetUser(user);
    setNewPassword("");
    setNewPasswordConfirm("");
  };

  const closePasswordReset = (force = false) => {
    if (isResettingPassword && !force) {
      return;
    }

    setPasswordResetUser(null);
    setNewPassword("");
    setNewPasswordConfirm("");
  };

  const handlePasswordReset = async () => {
    if (!passwordResetUser) {
      return;
    }

    if (!newPassword || !newPasswordConfirm) {
      showWarningToast(
        "New password and confirm password are required",
        "Missing Information",
      );
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      showWarningToast("Passwords do not match", "Check Passwords");
      return;
    }

    setIsResettingPassword(true);
    try {
      await onChangePassword(passwordResetUser._id, {
        newPassword,
        confirmPassword: newPasswordConfirm,
      });
      showSuccessToast(
        `Password updated for ${getUserDisplayName(passwordResetUser)}.`,
        "Password Reset",
      );
      closePasswordReset(true);
    } catch (resetError) {
      showErrorToast(resetError, {
        title: "Password Reset Failed",
        fallbackMessage: "Unable to reset password",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <Card className="border-white/8 bg-white/[0.035] shadow-none">
          <CardHeader className="items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted">
                <Shield className="h-3.5 w-3.5" />
                Access Control
              </div>
              <CardTitle className="mt-2">Create User</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted">
                Add a new member or admin, assign a display name, and choose the workspaces they can use.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Name
                </div>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Jane Member"
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Username
                </div>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="jane.member"
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Role
                </div>
                <RoleSelector value={role} onChange={setRole} />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Password
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Confirm Password
                </div>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Workspace Access
                </div>
                <div className="text-xs text-muted">
                  {workspaceIds.length} selected
                </div>
              </div>
              <WorkspaceAccessPicker
                workspaces={workspaces}
                selectedIds={workspaceIds}
                onToggle={toggleWorkspace}
                disabled={isCreating}
              />
            </div>

            <Button
              className="h-10 w-full justify-center shadow-none"
              onClick={() => void handleCreate()}
              disabled={isCreating || !name || !username || !password || !confirmPassword}
            >
              <Plus className="h-4 w-4" />
              {isCreating ? "Creating User..." : "Create User"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/8 bg-white/[0.035] shadow-none">
          <CardHeader className="items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted">
                <Users className="h-3.5 w-3.5" />
                Team Access
              </div>
              <CardTitle className="mt-2">Users</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted">
                Review roles, workspace access, and password reset access for each account.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-xs text-muted">
              {sortedUsers.length}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedUsers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/30 px-4 py-8 text-center text-sm text-muted">
                No users created yet.
              </div>
            ) : null}

            {sortedUsers.map((user) => {
              const isPending = pendingUserIds.includes(user._id);
              const displayName = getUserDisplayName(user);

              return (
                <div
                  key={user._id}
                  className="rounded-2xl border border-white/8 bg-slate-950/35 p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-sm font-semibold text-foreground">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {displayName}
                          </div>
                          <div className="truncate text-xs text-muted">
                            @{user.username}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <RoleBadge role={user.role} />
                            <span>{user.workspaceIds.length} workspaces</span>
                            {isPending ? <span>Updating...</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="secondary"
                            className="h-9 rounded-lg px-3"
                            onClick={() => openPasswordReset(user)}
                            disabled={isPending}
                            aria-label={`Reset password for ${displayName}`}
                            title={`Reset password for ${displayName}`}
                          >
                            <KeyRound className="h-4 w-4" />
                            Reset Password
                          </Button>
                          <Button
                            variant="destructive"
                            className="h-9 w-9 shrink-0 rounded-lg p-0"
                            onClick={() => void handleDelete(user._id)}
                            disabled={isPending}
                            aria-label={`Delete ${displayName}`}
                            title={`Delete ${displayName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                          Role
                        </div>
                        <RoleSelector
                          compact
                          value={user.role}
                          disabled={isPending}
                          onChange={(nextRole) => {
                            if (nextRole === user.role || isPending) {
                              return;
                            }
                            void handleUpdate(user._id, { role: nextRole });
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                            Workspace Access
                          </div>
                          <div className="text-xs text-muted">
                            {user.workspaceIds.length} selected
                          </div>
                        </div>
                        <WorkspaceAccessPicker
                          workspaces={workspaces}
                          selectedIds={user.workspaceIds}
                          disabled={isPending}
                          onToggle={(workspaceId) =>
                            void handleUpdate(user._id, {
                              workspaceIds: user.workspaceIds.includes(workspaceId)
                                ? user.workspaceIds.filter((id) => id !== workspaceId)
                                : [...user.workspaceIds, workspaceId],
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(passwordResetUser)}
        onOpenChange={(open) => !open && closePasswordReset()}
        title="Reset User Password"
        description={
          passwordResetUser
            ? `Choose a new password for ${getUserDisplayName(passwordResetUser)} (@${passwordResetUser.username}).`
            : undefined
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              data-autofocus="true"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted">Confirm Password</label>
            <Input
              type="password"
              value={newPasswordConfirm}
              onChange={(event) => setNewPasswordConfirm(event.target.value)}
              placeholder="Confirm password"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => closePasswordReset()}
              disabled={isResettingPassword}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handlePasswordReset()}
              disabled={isResettingPassword || !newPassword || !newPasswordConfirm}
            >
              {isResettingPassword ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}



