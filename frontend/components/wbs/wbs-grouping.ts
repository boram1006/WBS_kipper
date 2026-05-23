export type WbsGroupingTask = {
  wbsId?: string;
  id?: string;
  category?: string;
  phase?: string;
  parent_wbs_id?: string;
};

export type WbsGroupRow<TTask> = {
  type: "group";
  groupKey: string;
  label: string;
  taskCount: number;
};

export type WbsTaskRow<TTask> = {
  type: "task";
  groupKey: string;
  task: TTask;
};

export type WbsDisplayRow<TTask> = WbsGroupRow<TTask> | WbsTaskRow<TTask>;

const GROUP_LABELS: Record<string, string> = {
  "0": "기본 작업",
  "0.5": "컴포넌트 준비",
  DR: "라이브러리 / 명세"
};

function taskId(task: WbsGroupingTask) {
  return String(task.wbsId || task.id || "").trim();
}

export function getGroupKey(task: WbsGroupingTask) {
  const explicitGroup = String(task.phase || task.category || task.parent_wbs_id || "").trim();
  if (explicitGroup) return explicitGroup;

  const id = taskId(task);
  if (!id) return "misc";
  const parts = id.split(".").filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}.${parts[1]}`;
  if (parts.length === 2) return parts[0];
  return parts[0] || "misc";
}

export function getGroupLabel(groupKey: string) {
  return GROUP_LABELS[groupKey] || "기타 작업";
}

export function groupWbsTasks<TTask extends WbsGroupingTask>(tasks: TTask[]): WbsDisplayRow<TTask>[] {
  const grouped = new Map<string, TTask[]>();
  for (const task of tasks) {
    const groupKey = getGroupKey(task);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), task]);
  }

  return Array.from(grouped.entries()).flatMap(([groupKey, groupTasks]) => [
    { type: "group" as const, groupKey, label: getGroupLabel(groupKey), taskCount: groupTasks.length },
    ...groupTasks.map((task) => ({ type: "task" as const, groupKey, task }))
  ]);
}

export function flattenVisibleRows<TTask>(displayRows: WbsDisplayRow<TTask>[], collapsedGroupKeys: Set<string>) {
  return displayRows.filter((row) => row.type === "group" || !collapsedGroupKeys.has(row.groupKey));
}

export function isGroupRow<TTask>(row: WbsDisplayRow<TTask>): row is WbsGroupRow<TTask> {
  return row.type === "group";
}

export function isTaskRow<TTask>(row: WbsDisplayRow<TTask>): row is WbsTaskRow<TTask> {
  return row.type === "task";
}
