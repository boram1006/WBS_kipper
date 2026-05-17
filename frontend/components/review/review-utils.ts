import type { WbsChangeCandidate } from "@/lib/types";

export const MEETING_CONTEXT_KEY = "wbs-review-meeting";

export type MeetingContext = {
  meeting_date: string;
  meeting_title: string;
  meeting_note: string;
};

export const DEFAULT_MEETING_CONTEXT: MeetingContext = {
  meeting_date: "2026-05-17",
  meeting_title: "Weekly Project Sync",
  meeting_note: `Meeting date: 2026-05-17
Meeting title: Weekly Project Sync

지난 액션 아이템 진행률은 70% 수준입니다.
GUI 초안은 다음 주 수요일까지 연장하기로 했습니다.
개발 구현은 민수님이 담당하기로 했습니다.
Jira 연동은 이번 1차 MVP 범위에서 제외하고 2차로 미룹니다.
법무 검토가 런칭 전 필요하다는 의견이 있었습니다.
OpenAI API 응답이 JSON 형식으로 안정적으로 오지 않을 경우 앱 오류가 발생할 수 있습니다.`
};

export function loadMeetingContext(projectId: string): MeetingContext {
  if (typeof window === "undefined") return DEFAULT_MEETING_CONTEXT;
  try {
    const raw = sessionStorage.getItem(`${MEETING_CONTEXT_KEY}:${projectId}`);
    if (raw) return JSON.parse(raw) as MeetingContext;
  } catch {
    /* ignore malformed session data */
  }
  return DEFAULT_MEETING_CONTEXT;
}

export function meetingNoteForDisplay(context: MeetingContext, candidates: WbsChangeCandidate[]): MeetingContext {
  if (candidates.length === 0) return context;
  const linked = candidates.some((c) => c.evidence && context.meeting_note.toLowerCase().includes(c.evidence.toLowerCase().slice(0, 24)));
  if (linked) return context;
  const lines = candidates.map((c, i) => `${String(i + 1).padStart(2, "0")} ${c.evidence}`).join("\n");
  return {
    ...context,
    meeting_note: `${context.meeting_note.trim()}\n\n--- Evidence detected by analysis ---\n${lines}`
  };
}

export function saveMeetingContext(projectId: string, context: MeetingContext) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(`${MEETING_CONTEXT_KEY}:${projectId}`, JSON.stringify(context));
}

export type ChangeTypeFilter = "all" | string;

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  schedule_change: "Schedule",
  owner_change: "Owner",
  status_change: "Status",
  new_task: "New Task",
  dependency_change: "Dependency",
  hold_or_drop: "Hold / Drop",
  risk: "Risk",
  decision: "Decision",
  clarification_needed: "Clarification"
};

export const CHANGE_TYPE_COLORS: Record<string, string> = {
  schedule_change: "border-zinc-200 bg-white text-zinc-700",
  owner_change: "border-zinc-200 bg-white text-zinc-700",
  status_change: "border-zinc-200 bg-white text-zinc-700",
  new_task: "border-zinc-200 bg-white text-zinc-700",
  dependency_change: "border-zinc-200 bg-white text-zinc-700",
  hold_or_drop: "border-zinc-200 bg-white text-zinc-700",
  risk: "border-zinc-200 bg-white text-zinc-700",
  decision: "border-zinc-200 bg-white text-zinc-700",
  clarification_needed: "border-zinc-200 bg-white text-zinc-700"
};

export function changeTypeLabel(type: string) {
  return CHANGE_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function changeTypeDotClass(type: string) {
  const map: Record<string, string> = {
    schedule_change: "bg-violet-700",
    owner_change: "bg-sky-700",
    status_change: "bg-orange-700",
    new_task: "bg-emerald-700",
    dependency_change: "bg-orange-800",
    hold_or_drop: "bg-slate-600",
    risk: "bg-red-600",
    decision: "bg-blue-700",
    clarification_needed: "bg-amber-600"
  };
  return map[type] ?? "bg-zinc-500";
}

export function confidenceLabel(confidence: WbsChangeCandidate["confidence"]) {
  const map = { high: "High", medium: "Medium", low: "Low" } as const;
  return map[confidence] ?? confidence;
}

export function confidenceScore(candidate: WbsChangeCandidate) {
  const base = candidate.confidence === "high" ? 92 : candidate.confidence === "medium" ? 68 : 56;
  const tweak = (parseInt(candidate.id.replace(/\D/g, ""), 10) || 0) % 7;
  return Math.min(99, base + tweak);
}

export function fieldLabel(field: string | null) {
  if (!field) return "Field";
  const map: Record<string, string> = {
    due_date: "Due date",
    start_date: "Start date",
    owner: "Owner",
    status: "Status",
    dependency: "Depends on",
    task_name: "Task",
    description: "Description",
    notes: "Notes"
  };
  return map[field] ?? field;
}

export function computeSummary(candidates: WbsChangeCandidate[]) {
  return {
    total: candidates.length,
    new_tasks: candidates.filter((c) => c.change_type === "new_task").length,
    schedule_changes: candidates.filter((c) => c.change_type === "schedule_change").length,
    confirmation_needed: candidates.filter((c) => c.requires_confirmation).length,
    risks: candidates.filter((c) => c.change_type === "risk").length,
    owner_changes: candidates.filter((c) => c.change_type === "owner_change").length,
    status_changes: candidates.filter((c) => c.change_type === "status_change").length
  };
}

export function tabCounts(candidates: WbsChangeCandidate[]) {
  return {
    all: candidates.length,
    new_task: candidates.filter((c) => c.change_type === "new_task").length,
    schedule_change: candidates.filter((c) => c.change_type === "schedule_change").length,
    owner_change: candidates.filter((c) => c.change_type === "owner_change").length,
    status_change: candidates.filter((c) => c.change_type === "status_change").length,
    risk: candidates.filter((c) => c.change_type === "risk").length
  };
}

export type MeetingSection = {
  index: number;
  title: string;
  paragraphs: { speaker?: string; text: string }[];
};

export function parseMeetingSections(note: string): MeetingSection[] {
  const lines = note
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Meeting date:") && !line.startsWith("Meeting title:"));

  if (lines.length === 0) {
    return [{ index: 1, title: "Meeting notes", paragraphs: [{ text: note }] }];
  }

  return lines.map((line, i) => ({
    index: i + 1,
    title: `Item ${String(i + 1).padStart(2, "0")}`,
    paragraphs: [{ text: line }]
  }));
}

export function buildEvidenceMap(candidates: WbsChangeCandidate[]) {
  const map = new Map<string, number>();
  candidates.forEach((candidate, i) => map.set(candidate.id, i + 1));
  return map;
}

export function matchesFilter(
  candidate: WbsChangeCandidate,
  tab: ChangeTypeFilter,
  query: string,
  minConfidence: "all" | "high" | "medium"
) {
  if (tab !== "all" && candidate.change_type !== tab) return false;
  if (minConfidence === "high" && candidate.confidence !== "high") return false;
  if (minConfidence === "medium" && candidate.confidence === "low") return false;
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    candidate.task_name.toLowerCase().includes(q) ||
    candidate.evidence.toLowerCase().includes(q) ||
    (candidate.matched_wbs_id ?? "").toLowerCase().includes(q)
  );
}

export function highlightEvidenceInText(text: string, evidences: string[], activeEvidence?: string) {
  if (!evidences.length) return [{ type: "text" as const, value: text }];

  const sorted = [...evidences].filter(Boolean).sort((a, b) => b.length - a.length);
  const segments: { type: "text" | "evidence"; value: string; active?: boolean }[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let found: { index: number; value: string } | null = null;
    for (const evidence of sorted) {
      const idx = remaining.toLowerCase().indexOf(evidence.toLowerCase());
      if (idx >= 0 && (!found || idx < found.index)) found = { index: idx, value: evidence };
    }
    if (!found) {
      segments.push({ type: "text", value: remaining });
      break;
    }
    if (found.index > 0) segments.push({ type: "text", value: remaining.slice(0, found.index) });
    segments.push({
      type: "evidence",
      value: remaining.slice(found.index, found.index + found.value.length),
      active: activeEvidence ? found.value.toLowerCase() === activeEvidence.toLowerCase() : false
    });
    remaining = remaining.slice(found.index + found.value.length);
  }

  return segments;
}
