export type DependencyTask = {
  id: string;
  taskName: string;
  dependency?: unknown;
};

export type DependencyLayoutItem = {
  left: number;
  width: number;
  centerY: number;
};

export type DependencyLink = {
  id: string;
  sourceId: string;
  targetId: string;
  sourceTaskName: string;
  targetTaskName: string;
};

export type DependencyLinePoints = {
  startX: number;
  startY: number;
  midX: number;
  endX: number;
  endY: number;
};

export function parseDependencies(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseDependencies(item));
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && item !== "-");
}

export function resolveDependencyLinks(tasks: DependencyTask[]): DependencyLink[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return tasks.flatMap((task) =>
    parseDependencies(task.dependency)
      .map((dependencyId) => {
        const source = taskById.get(dependencyId);
        if (!source) return null;
        return {
          id: `${source.id}->${task.id}`,
          sourceId: source.id,
          targetId: task.id,
          sourceTaskName: source.taskName,
          targetTaskName: task.taskName
        };
      })
      .filter((link): link is DependencyLink => link != null)
  );
}

export function getDependencyLinePoints(
  sourceLayout: DependencyLayoutItem,
  targetLayout: DependencyLayoutItem
): DependencyLinePoints {
  const startX = sourceLayout.left + sourceLayout.width;
  const endX = targetLayout.left;
  const startY = sourceLayout.centerY;
  const endY = targetLayout.centerY;
  const midX = endX >= startX ? startX + Math.max(18, (endX - startX) / 2) : startX + 18;
  return { startX, startY, midX, endX, endY };
}
