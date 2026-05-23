export type GanttMilestoneInput = {
  id: string;
  label: string;
  dateLabel: string;
  left: number;
  type?: "today" | "milestone";
};

export type GanttMilestoneDisplay = GanttMilestoneInput & {
  priority: number;
  display: "full" | "short" | "hidden";
  displayLabel: string;
  title: string;
};

export function getMilestonePosition(dateTime: number, timelineStart: number, pxPerDay: number, timelineWidth: number) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.min(timelineWidth, ((dateTime - timelineStart) / dayMs) * pxPerDay));
}

export function getMilestonePriority(milestone: Pick<GanttMilestoneInput, "label" | "type">) {
  const label = milestone.label.toLowerCase();
  if (milestone.type === "today" || label.includes("today") || label.includes("오늘")) return 1;
  if (label.includes("최종보고") || label.includes("final")) return 2;
  if (label.includes("mvp")) return 3;
  if (label.includes("보고") || label.includes("report")) return 4;
  return 5;
}

export function getMilestoneDisplayLabel(milestone: GanttMilestoneInput, mode: "full" | "short" | "hidden") {
  if (mode === "hidden") return "";
  if (mode === "short") return milestone.label;
  return `${milestone.label} (${milestone.dateLabel})`;
}

export function resolveMilestoneLabelVisibility(milestones: GanttMilestoneInput[], minGap = 72): GanttMilestoneDisplay[] {
  const byPriority = [...milestones]
    .map((milestone, index) => ({ ...milestone, index, priority: getMilestonePriority(milestone) }))
    .sort((a, b) => a.priority - b.priority || a.left - b.left);
  const accepted: Array<{ left: number; priority: number }> = [];
  const displayById = new Map<string, "full" | "short" | "hidden">();

  for (const milestone of byPriority) {
    const nearest = accepted.find((item) => Math.abs(item.left - milestone.left) < minGap);
    let display: "full" | "short" | "hidden" = "full";
    if (nearest) {
      display = milestone.priority <= 2 ? "short" : "hidden";
    }
    if (display !== "hidden") accepted.push({ left: milestone.left, priority: milestone.priority });
    displayById.set(milestone.id, display);
  }

  return milestones.map((milestone) => {
    const display = displayById.get(milestone.id) ?? "hidden";
    return {
      ...milestone,
      priority: getMilestonePriority(milestone),
      display,
      displayLabel: getMilestoneDisplayLabel(milestone, display),
      title: `${milestone.label}\n${milestone.dateLabel}`
    };
  });
}
