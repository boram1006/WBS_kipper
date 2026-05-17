"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { useReviewShell } from "@/components/app-shell/review-shell-context";

export function ReviewAppShell({ children }: { children: ReactNode }) {
  const { projectId, pendingCount } = useReviewShell();

  return (
    <div className="fixed inset-0 z-50 flex bg-[#fafaf9] font-sans text-zinc-950">
      <AppSidebar projectId={projectId} pendingCount={pendingCount} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
