"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type ReviewShellContextValue = {
  projectId: string;
  pendingCount: number;
  setPendingCount: (count: number) => void;
};

const ReviewShellContext = createContext<ReviewShellContextValue | null>(null);

export function ReviewShellProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const value = useMemo(() => ({ projectId, pendingCount, setPendingCount }), [projectId, pendingCount]);

  return <ReviewShellContext.Provider value={value}>{children}</ReviewShellContext.Provider>;
}

export function useReviewShell() {
  const ctx = useContext(ReviewShellContext);
  if (!ctx) throw new Error("useReviewShell must be used within ReviewShellProvider");
  return ctx;
}
