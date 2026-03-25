import { AlertTriangle, CheckCircle2, SendHorizontal } from "lucide-react";
import type { VariableResolution } from "../../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface URLBarProps {
  value: string;
  resolution: VariableResolution;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
}

export function URLBar({
  value,
  resolution,
  onChange,
  onSend,
  isSending,
}: URLBarProps) {
  return (
    <div className="min-w-0 flex-1 space-y-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-0 flex-1 font-mono text-sm"
          placeholder="https://api.example.com/users/{{userId}}"
        />
        <Button
          className="h-11 shrink-0"
          onClick={onSend}
          disabled={isSending || !value.trim()}
        >
          <SendHorizontal className="h-4 w-4" />
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {resolution.resolved.map((variable) => (
          <Badge
            key={variable}
            className="border-emerald-400/20 bg-emerald-500/12 text-emerald-300"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {variable}
          </Badge>
        ))}
        {resolution.unresolved.map((variable) => (
          <Badge
            key={variable}
            className="border-rose-400/20 bg-rose-500/12 text-rose-300"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {variable}
          </Badge>
        ))}
      </div>
    </div>
  );
}
