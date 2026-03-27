import { useEffect, useState } from "react";
import { showErrorToast, showWarningToast } from "../../store/toasts";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";

interface ImportPostmanDialogProps {
  open: boolean;
  workspaceName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { collectionJson: string; projectName?: string }) => Promise<void>;
}

export function ImportPostmanDialog({
  open,
  workspaceName,
  onOpenChange,
  onSubmit,
}: ImportPostmanDialogProps) {
  const [projectName, setProjectName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setProjectName("");
      setFile(null);
      setIsSubmitting(false);
      return;
    }

    setProjectName("");
    setFile(null);
    setIsSubmitting(false);
  }, [open]);

  const handleSubmit = async () => {
    if (!file) {
      showWarningToast(
        "Select a Postman collection JSON file to import.",
        "Missing File",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const collectionJson = await file.text();
      if (!collectionJson.trim()) {
        showWarningToast(
          "The selected file is empty.",
          "Missing Data",
        );
        return;
      }

      await onSubmit({
        collectionJson,
        projectName: projectName.trim() || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      showErrorToast(error, {
        title: "Import Failed",
        fallbackMessage: "Unable to import the Postman collection",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import Postman Collection"
      description={
        workspaceName
          ? `Create a new project inside ${workspaceName} from an exported Postman collection.`
          : "Create a new project from an exported Postman collection."
      }
      className="max-w-xl"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted">Project Name</label>
          <Input
            data-autofocus="true"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Leave blank to use the collection name"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted">Postman Export</label>
          <Input
            type="file"
            accept=".json,application/json"
            className="h-auto cursor-pointer px-2 py-2 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent/15 file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent/20"
            onChange={(event) =>
              setFile(event.target.files?.[0] ?? null)
            }
          />
          <p className="text-xs text-muted">
            Importing also brings collection variables into the project environment.
          </p>
          {file ? (
            <p className="text-xs text-foreground/80">Selected: {file.name}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Importing..." : "Import Collection"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
