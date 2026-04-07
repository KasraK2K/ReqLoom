import type {
  AdminUser,
  ChangeMyPasswordPayload,
  UpdateProfilePayload,
  User,
} from "@restify/shared";
import { KeyRound, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  showErrorToast,
  showSuccessToast,
  showWarningToast,
} from "../../store/toasts";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";

interface AccountSettingsProps {
  user: AdminUser | User;
  onUpdateProfile: (payload: UpdateProfilePayload) => Promise<void>;
  onChangePassword: (payload: ChangeMyPasswordPayload) => Promise<void>;
}

function getRoleLabel(role: AdminUser["role"] | User["role"]) {
  if (role === "superadmin") {
    return "Super Admin";
  }

  return role === "admin" ? "Admin" : "Member";
}

export function AccountSettings({
  user,
  onUpdateProfile,
  onChangePassword,
}: AccountSettingsProps) {
  const initialName = useMemo(
    () => user.name?.trim() || user.username,
    [user.name, user.username],
  );
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const trimmedName = name.trim();
  const profileChanged = trimmedName !== initialName;

  const handleProfileSave = async () => {
    if (!trimmedName) {
      showWarningToast("Name is required", "Missing Information");
      return;
    }

    setIsSavingProfile(true);
    try {
      await onUpdateProfile({ name: trimmedName });
      showSuccessToast("Saved your name successfully.", "Profile Updated");
    } catch (saveError) {
      showErrorToast(saveError, {
        title: "Profile Update Failed",
        fallbackMessage: "Unable to update your profile",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showWarningToast(
        "Current password, new password, and confirm password are required",
        "Missing Information",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      showWarningToast("Passwords do not match", "Check Passwords");
      return;
    }

    setIsSavingPassword(true);
    try {
      await onChangePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showSuccessToast("Updated your password successfully.", "Password Changed");
    } catch (saveError) {
      if (
        saveError instanceof Error &&
        saveError.message === "Current password is incorrect"
      ) {
        showWarningToast(saveError.message, "Check Password");
      } else {
        showErrorToast(saveError, {
          title: "Password Change Failed",
          fallbackMessage: "Unable to change your password",
        });
      }
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted">
              <UserRound className="h-3.5 w-3.5" />
              Account Profile
            </div>
            <CardTitle className="mt-2">Profile</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted">
              Update the name shown in the app while keeping your username for login.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Name
            </div>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Username
              </div>
              <Input value={user.username} readOnly className="text-muted" />
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Role
              </div>
              <Input value={getRoleLabel(user.role)} readOnly className="text-muted" />
            </div>
          </div>
          <Button
            className="h-10 w-full justify-center shadow-none"
            onClick={() => void handleProfileSave()}
            disabled={isSavingProfile || !trimmedName || !profileChanged}
          >
            {isSavingProfile ? "Saving Profile..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted">
              <KeyRound className="h-3.5 w-3.5" />
              Password Security
            </div>
            <CardTitle className="mt-2">Change Password</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted">
              Enter your current password before choosing a new one.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Current Password
            </div>
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                New Password
              </div>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
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
                placeholder="Confirm new password"
              />
            </div>
          </div>
          <Button
            className="h-10 w-full justify-center shadow-none"
            onClick={() => void handlePasswordSave()}
            disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword}
          >
            {isSavingPassword ? "Updating Password..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}



