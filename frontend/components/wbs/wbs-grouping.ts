export type WbsGroupingTask = {
  wbsId?: string;
  id?: string;
  groupKey?: string;
  group_key?: string;
  groupName?: string;
  group_name?: string;
  category?: string;
  phase?: string;
  parent_wbs_id?: string;
};

export type WbsGroup = {
  groupKey: string;
  label: string;
  order: number;
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
  const explicitGroup = String(task.groupKey || task.group_key || task.phase || task.category || task.parent_wbs_id || "").trim();
  if (explicitGroup) return explicitGroup;

  const id = taskId(task);
  if (!id) return "misc";
  const parts = id.split(".").filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}.${parts[1]}`;
  if (parts.length === 2) return parts[0];
  return parts[0] || "misc";
}

export function getGroupLabel(groupKey: string, groups: WbsGroup[] = []) {
  const savedGroup = groups.find((group) => group.groupKey === groupKey);
  if (savedGroup) return savedGroup.label;
  return GROUP_LABELS[groupKey] || "기타 작업";
}

export function groupWbsTasks<TTask extends WbsGroupingTask>(tasks: TTask[], groups: WbsGroup[] = []): WbsDisplayRow<TTask>[] {
  const grouped = new Map<string, TTask[]>();
  for (const task of tasks) {
    const groupKey = getGroupKey(task);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), task]);
  }

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const orderedGroupKeys = [
    ...sortedGroups.map((group) => group.groupKey),
    ...Array.from(grouped.keys()).filter((groupKey) => !groups.some((group) => group.groupKey === groupKey))
  ];

  return orderedGroupKeys.flatMap((groupKey) => {
    const groupTasks = grouped.get(groupKey) ?? [];
    return [
      { type: "group" as const, groupKey, label: getGroupLabel(groupKey, groups), taskCount: groupTasks.length },
      ...groupTasks.map((task) => ({ type: "task" as const, groupKey, task }))
    ];
  });
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

export function inferGroupsFromTasks<TTask extends WbsGroupingTask>(tasks: TTask[], existingGroups: WbsGroup[] = []): WbsGroup[] {
  const groupKeys = Array.from(new Set(tasks.map(getGroupKey)));
  const existingByKey = new Map(existingGroups.map((group) => [group.groupKey, group]));
  const inferred = groupKeys.map((groupKey, index) => existingByKey.get(groupKey) ?? { groupKey, label: getGroupLabel(groupKey, existingGroups), order: index });
  const taskGroupSet = new Set(groupKeys);
  const emptyExistingGroups = existingGroups.filter((group) => !taskGroupSet.has(group.groupKey));
  return [...inferred, ...emptyExistingGroups].sort((a, b) => a.order - b.order);
}

export function createNewGroup(existingGroups: WbsGroup[]): WbsGroup {
  const used = new Set(existingGroups.map((group) => group.groupKey));
  let index = 1;
  while (used.has(`G${index}`)) index += 1;
  return { groupKey: `G${index}`, label: "새 그룹", order: existingGroups.length };
}

export function renameGroup(groups: WbsGroup[], groupKey: string, label: string) {
  return groups.map((group) => (group.groupKey === groupKey ? { ...group, label } : group));
}

export function deleteGroup(groups: WbsGroup[], groupKey: string) {
  return groups.filter((group) => group.groupKey !== groupKey);
}

export function getNextWbsIdForGroup<TTask extends WbsGroupingTask>(tasks: TTask[], groupKey: string) {
  const prefix = groupKey === "misc" ? "G" : groupKey;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\.(\\d+)$`);
  const max = tasks.reduce((currentMax, task) => {
    const match = pattern.exec(taskId(task));
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `${prefix}.${max + 1}`;
}

export function moveTaskToGroup<TTask extends WbsGroupingTask & { clientId?: string }>(tasks: TTask[], taskIdValue: string, targetGroupKey: string) {
  const nextId = getNextWbsIdForGroup(tasks, targetGroupKey);
  return tasks.map((task) => {
    const id = task.clientId || taskId(task);
    if (id !== taskIdValue) return task;
    return { ...task, groupKey: targetGroupKey, wbsId: nextId, id: nextId };
  });
}

export function createTaskInGroup<TTask extends WbsGroupingTask>(tasks: TTask[], groupKey: string, createTask: (wbsId: string) => TTask) {
  return createTask(getNextWbsIdForGroup(tasks, groupKey));
}

export function groupsFromRawRows(rows: Array<Record<string, string>>): WbsGroup[] {
  const seen = new Map<string, string>();
  const order: string[] = [];
  for (const row of rows) {
    const groupKey = (row.group_key ?? "").trim();
    if (!groupKey) continue;
    if (!seen.has(groupKey)) {
      order.push(groupKey);
      seen.set(groupKey, (row.group_label ?? "").trim() || groupKey);
    }
  }
  return order.map((groupKey, index) => ({ groupKey, label: seen.get(groupKey)!, order: index }));
}
