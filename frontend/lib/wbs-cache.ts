import type { WbsColumnMapping, WbsUploadResponse } from "@/lib/types";

const WBS_SNAPSHOT_KEY = "wbs_keeper_wbs_snapshot";

export type CachedWbsSnapshot = WbsUploadResponse & {
  mapping?: Partial<WbsColumnMapping>;
  saved_at: string;
};

function key(projectId: string | number) {
  return `${WBS_SNAPSHOT_KEY}:${projectId}`;
}

export function saveWbsSnapshot(projectId: string | number, snapshot: WbsUploadResponse, mapping?: Partial<WbsColumnMapping>) {
  if (typeof window === "undefined") return;
  const payload: CachedWbsSnapshot = {
    ...snapshot,
    mapping,
    saved_at: new Date().toISOString()
  };
  window.localStorage.setItem(key(projectId), JSON.stringify(payload));
}

export function loadWbsSnapshot(projectId: string | number): CachedWbsSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(projectId));
    return raw ? (JSON.parse(raw) as CachedWbsSnapshot) : null;
  } catch {
    return null;
  }
}
