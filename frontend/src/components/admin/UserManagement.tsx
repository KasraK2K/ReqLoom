import type { User, WorkspaceMeta } from "@restify/shared";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  DropdownSelect,
  type DropdownOption,
} from "../ui/DropdownSelect";
import { Input } from "../ui/input";

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

const ROLE_OPTIONS: Array<DropdownOption<UserRole>> = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

function RoleSelector({
  value,
  onChange,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
}) {
  return (
    <DropdownSelect
      value={value}
      options={ROLE_OPTIONS}
      onChange={onChange}
      ariaLabel="Select user role"
      getItemClassName={(_option, isSelected) =>
        isSelected
          ? "bg-accent text-slate-950"
          : "text-foreground hover:bg-white/[0.06]"
      }
    />
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