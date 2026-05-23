import type { WbsColumnMapping, WbsUploadResponse } from "@/lib/types";
import type { WbsGroup } from "@/components/wbs/wbs-grouping";

const WBS_SNAPSHOT_KEY = "wbs_keeper_wbs_snapshot";
const WBS_MILESTONES_KEY = "wbs_keeper_wbs_milestones";
const WBS_GROUPS_KEY = "wbs_keeper_wbs_groups";
const WBS_GROUP_ASSIGNMENTS_KEY = "wbs_keeper_wbs_group_assignments";

export type WbsMilestone = {
  id: string;
  label: string;
  date: string;
};

export type WbsGroupAssignment = {
  wbsId: string;
  taskName: string;
  groupKey: string;
};

export type CachedWbsSnapshot = WbsUploadResponse & {
  mapping?: Partial<WbsColumnMapping>;
  saved_at: string;
};

function key(projectId: string | number) {
  return `${WBS_SNAPSHOT_KEY}:${projectId}`;
}

function milestoneKey(projectId: string | number) {
  return `${WBS_MILESTONES_KEY}:${projectId}`;
}

function groupsKey(projectId: string | number) {
  return `${WBS_GROUPS_KEY}:${projectId}`;
}

function groupAssignmentsKey(projectId: string | number) {
  return `${WBS_GROUP_ASSIGNMENTS_KEY}:${projectId}`;
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

export function saveWbsMilestones(projectId: string | number, milestones: WbsMilestone[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(milestoneKey(projectId), JSON.stringify(milestones));
}

export function loadWbsMilestones(projectId: string | number): WbsMilestone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(milestoneKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WbsMilestone[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item.id && item.label && item.date)
      : [];
  } catch {
    return [];
  }
}

export function saveWbsGroups(projectId: string | number, groups: WbsGroup[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(groupsKey(projectId), JSON.stringify(groups));
}

export function loadWbsGroups(projectId: string | number): WbsGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(groupsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WbsGroup[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item.groupKey && item.label && Number.isFinite(item.order))
      : [];
  } catch {
    return [];
  }
}

export function saveWbsGroupAssignments(projectId: string | number, assignments: WbsGroupAssignment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(groupAssignmentsKey(projectId), JSON.stringify(assignments));
}

export function loadWbsGroupAssignments(projectId: string | number): WbsGroupAssignment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(groupAssignmentsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WbsGroupAssignment[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item.wbsId && item.groupKey)
      : [];
  } catch {
    return [];
  }
}
