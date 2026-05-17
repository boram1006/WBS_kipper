import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "danger";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium tracking-tight",
        variant === "default" && "bg-zinc-900 text-white",
        variant === "secondary" && "bg-zinc-100 text-zinc-700",
        variant === "outline" && "border border-zinc-200 bg-white text-zinc-700",
        variant === "success" && "bg-emerald-50 text-emerald-800",
        variant === "warning" && "bg-amber-50 text-amber-900",
        variant === "danger" && "bg-red-50 text-red-700",
        className
      )}
      {...props}
    />
  );
}
