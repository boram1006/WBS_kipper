import * as React from "react";
import { cn } from "@/lib/utils";

export function ScrollArea({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("overflow-y-auto overflow-x-hidden", className)} {...props}>
      {children}
    </div>
  );
}
