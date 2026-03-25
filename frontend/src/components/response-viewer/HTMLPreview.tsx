import { cn } from "../../lib/cn";

interface HTMLPreviewProps {
  value: string;
  className?: string;
}

export function HTMLPreview({ value, className }: HTMLPreviewProps) {
  return (
    <iframe
      className={cn(
        "h-full min-h-0 w-full rounded-xl border border-white/10 bg-white",
        className,
      )}
      sandbox="allow-same-origin"
      srcDoc={value}
      title="HTML preview"
    />
  );
}
