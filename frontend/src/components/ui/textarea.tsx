import * as React from "react";
import { cn } from "../../lib/cn";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[120px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/60 focus:bg-white/8 focus-visible:ring-1 focus-visible:ring-accent/40",
        className
      )}
      {...props}
    />
  );
});
