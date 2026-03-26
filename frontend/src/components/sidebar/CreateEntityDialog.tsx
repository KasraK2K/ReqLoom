import { useEffect, useState } from "react";
import { showErrorToast, showWarningToast } from "../../store/toasts";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";

interface CreateEntityDialogProps {
  open: boolean;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  actionVerb?: "create" | "rename";
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}

export function CreateEntityDialog({
  open,
  title,
  description,
  label,
  placeholder,
  submitLabel,
  initialValue,
  actionVerb = "create",
  onOpenChange,
  onSubmit,
}: CreateEntityDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialValue ?? "");
      setIsSubmitting(false);
      return;
    }

    setName("");
    setIsSubmitting(false);
  }, [initialValue, open]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showWarningToast(`${label} name is required`, "Missing Information");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(trimmedName);
      onOpenChange(false);
    } catch (submitError) {
      showErrorToast(submitError, {
        title: actionVerb === "rename" ? "Rename Failed" : "Create Failed",
        fallbackMessage: `Unable to ${actionVerb} ${label.toLowerCase()}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted">{label} Name</label>
          <Input
            autoFocus
            data-autofocus="true"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={placeholder}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting
              ? actionVerb === "rename"
                ? "Renaming..."
                : "Creating..."
              : submitLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
