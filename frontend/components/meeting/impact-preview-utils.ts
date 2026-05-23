import { parseDependencies } from "@/components/wbs/gantt-dependencies";
import type { WbsChangeCandidate } from "@/lib/types";

export type ImpactPreviewRow = Record<string, string>;

export type ApplyImpactPreview = {
  selectedCount: number;
  newTaskCount: number;
  scheduleChangeCount: number;
  ownerStatusChangeCount: number;
  dependencyChangeCount: number;
  confirmationNeededCount: number;
  downstreamTasks: Array<{ wbsId: string; taskName: string }>;
};

function rowId(row: ImpactPreviewRow) {
  return row.wbs_id || row["wbs id"] || row.id || "";
}

function rowTaskName(row: ImpactPreviewRow) {
  return row.task_name || row["task name"] || row.name || rowId(row) || "Untitled task";
}

function rowDependency(row: ImpactPreviewRow) {
  return row.dependency || row["depends on"] || "";
}

function candidateTargetId(candidate: WbsChangeCandidate) {
  return candidate.matched_wbs_id || candidate.proposed_wbs_id || "";
}

function isScheduleChange(candidate: WbsChangeCandidate) {
  return candidate.change_type === "schedule_change" || candidate.field === "start_date" || candidate.field === "due_date";
}

function isDependencyChange(candidate: WbsChangeCandidate) {
  return candidate.change_type === "dependency_change" || candidate.field === "dependency" || Boolean(candidate.proposed_dependency);
}

export function buildApplyImpactPreview(candidates: WbsChangeCandidate[], rows: ImpactPreviewRow[]): ApplyImpactPreview {
  const selectedIds = new Set(candidates.map(candidateTargetId).filter(Boolean));
  const downstreamMap = new Map<string, { wbsId: string; taskName: string }>();

  for (const row of rows) {
    const dependencies = parseDependencies(rowDependency(row));
    if (!dependencies.some((dependency) => selectedIds.has(dependency))) continue;
    const id = rowId(row);
    if (id) downstreamMap.set(id, { wbsId: id, taskName: rowTaskName(row) });
  }

  return {
    selectedCount: candidates.length,
    newTaskCount: candidates.filter((candidate) => candidate.change_type === "new_task" || !candidate.current_value).length,
    scheduleChangeCount: candidates.filter(isScheduleChange).length,
    ownerStatusChangeCount: candidates.filter((candidate) => candidate.change_type === "owner_change" || candidate.change_type === "status_change" || candidate.field === "owner" || candidate.field === "status").length,
    dependencyChangeCount: candidates.filter(isDependencyChange).length,
    confirmationNeededCount: candidates.filter((candidate) => candidate.requires_confirmation).length,
    downstreamTasks: Array.from(downstreamMap.values()).slice(0, 5)
  };
}
