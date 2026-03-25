import * as React from "react";
import { cn } from "../../lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/60 focus:bg-white/8 focus-visible:ring-1 focus-visible:ring-accent/40",
        className
      )}
      {...props}
    />
  );
});
