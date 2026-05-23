const DAY_MS = 24 * 60 * 60 * 1000;

export type WbsStatusKind = "planned" | "progress" | "completed" | "hold" | "cancelled" | "unknown";
export type WbsScheduleState = "normal" | "due-today" | "delayed" | "unknown-date";

export type WbsStatusTask = {
  status?: string;
  dueDate?: string;
  startDate?: string;
};

function dayStart(value: string | number | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function normalizeWbsStatus(status = ""): WbsStatusKind {
  const text = status.trim().toLowerCase();
  if (text.includes("완료") || text.includes("done") || text.includes("complete")) return "completed";
  if (text.includes("취소") || text.includes("cancel")) return "cancelled";
  if (text.includes("보류") || text.includes("hold") || text.includes("제외")) return "hold";
  if (text.includes("진행") || text.includes("progress")) return "progress";
  if (text.includes("예정") || text.includes("planned") || text.includes("todo")) return "planned";
  return "unknown";
}

export function getWbsStatusLabel(status = "") {
  const kind = normalizeWbsStatus(status);
  if (kind === "completed") return "완료";
  if (kind === "cancelled") return "취소";
  if (kind === "hold") return "보류";
  if (kind === "progress") return "진행중";
  if (kind === "planned") return "예정";
  return status.trim() || "미정";
}

export function getWbsStatusBadgeClass(status = "") {
  const kind = normalizeWbsStatus(status);
  if (kind === "completed") return "border-zinc-300 bg-zinc-100 text-zinc-600";
  if (kind === "cancelled") return "border-zinc-200 bg-zinc-50 text-zinc-500";
  if (kind === "hold") return "border-amber-200 bg-amber-50 text-amber-800";
  if (kind === "progress") return "border-zinc-300 bg-zinc-50 text-zinc-700";
  if (kind === "planned") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-white text-zinc-600";
}

export function getDelayDays(dueDate = "", today: string | number | Date = new Date()) {
  const due = dayStart(dueDate);
  const base = dayStart(today);
  if (due == null || base == null || due >= base) return 0;
  return Math.round((base - due) / DAY_MS);
}

export function getScheduleState(task: WbsStatusTask, today: string | number | Date = new Date()): WbsScheduleState {
  const due = dayStart(task.dueDate || "");
  const base = dayStart(today);
  if (due == null || base == null) return "unknown-date";
  const status = normalizeWbsStatus(task.status);
  if (status === "completed" || status === "cancelled") return "normal";
  if (due < base) return "delayed";
  if (due === base) return "due-today";
  return "normal";
}

export function getGanttBarClass(task: WbsStatusTask, today: string | number | Date = new Date()) {
  const status = normalizeWbsStatus(task.status);
  const scheduleState = getScheduleState(task, today);
  if (status === "completed") return "bg-zinc-200 opacity-70";
  if (status === "cancelled") return "bg-zinc-200 opacity-50";
  if (scheduleState === "delayed") return "border border-red-300/80 bg-red-200/60 ring-1 ring-red-200/70";
  if (status === "hold") return "border border-amber-300/90 bg-amber-100";
  if (status === "progress") return "bg-zinc-400/85";
  if (status === "planned") return "border border-amber-300/60 bg-amber-200/60";
  return "bg-zinc-300/90";
}

export function getScheduleBadge(task: WbsStatusTask, today: string | number | Date = new Date()) {
  const state = getScheduleState(task, today);
  if (state === "unknown-date") {
    return { label: "날짜 미정", className: "border-zinc-200 bg-zinc-50 text-zinc-600" };
  }
  if (state === "due-today") {
    return { label: "오늘 마감", className: "border-[#FD312E]/25 bg-[#FD312E]/5 text-[#FD312E]" };
  }
  if (state === "delayed") {
    return { label: `지연 D+${getDelayDays(task.dueDate, today)}`, className: "border-[#FD312E]/30 bg-[#FD312E]/5 text-[#FD312E]" };
  }
  return null;
}

export function getScheduleStateLabel(task: WbsStatusTask, today: string | number | Date = new Date()) {
  const badge = getScheduleBadge(task, today);
  return badge?.label || "정상";
}
