"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileDown,
  GitBranch,
  Info,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Table2,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GanttDependencyLayer } from "@/components/wbs/gantt-dependency-layer";
import { resolveDependencyLinks, type DependencyLayoutItem } from "@/components/wbs/gantt-dependencies";
import { getMilestoneMarkerClass, getMilestonePosition, resolveMilestoneLabelVisibility } from "@/components/wbs/gantt-milestones";
import { flattenVisibleRows, groupWbsTasks, isGroupRow, isTaskRow, type WbsDisplayRow } from "@/components/wbs/wbs-grouping";
import {
  getGanttBarClass,
  getScheduleBadge,
  getScheduleState,
  getScheduleStateLabel,
  getWbsStatusBadgeClass,
  getWbsStatusLabel,
  normalizeWbsStatus
} from "@/components/wbs/wbs-status";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import type { WbsColumnMapping } from "@/lib/types";
import { useActiveProjectId } from "@/lib/use-project-id";
import {
  loadWbsGroupAssignments,
  loadWbsGroups,
  loadWbsMilestones,
  loadWbsSnapshot,
  saveWbsGroupAssignments,
  saveWbsSnapshot,
  type CachedWbsSnapshot,
  type WbsGroupAssignment,
  type WbsMilestone
} from "@/lib/wbs-cache";
import { cn } from "@/lib/utils";

type WbsRow = {
  wbsId: string;
  groupKey?: string;
  taskName: string;
  description: string;
  owner: string;
  startDate: string;
  dueDate: string;
  status: string;
  dependency: string;
  lastUpdated: string;
  badges: WbsBadge[];
  notes: string;
  taskSource: string;
};

type WbsBadge = "recent" | "new" | "schedule" | "owner" | "status" | "confirm";
type ViewMode = "view" | "edit";
type GanttZoom = "fit" | "month" | "week";
type DragAction = "move" | "resize-left" | "resize-right";

const badgeConfig: Record<WbsBadge, { label: string; className: string }> = {
  recent: { label: "Recently updated", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  new: { label: "New task", className: "border-zinc-200 bg-zinc-50 text-zinc-700" },
  schedule: { label: "Schedule changed", className: "border-[#FD312E]/25 bg-[#FD312E]/5 text-[#FD312E]" },
  owner: { label: "Owner changed", className: "border-amber-200 bg-amber-50 text-amber-800" },
  status: { label: "Status changed", className: "border-orange-200 bg-orange-50 text-orange-800" },
  confirm: { label: "Needs confirmation", className: "border-[#FD312E]/25 bg-[#FD312E]/5 text-[#FD312E]" }
};

const changeTypeOptions = [
  { value: "all", label: "All change types" },
  { value: "recent", label: "Recently updated" },
  { value: "new", label: "New task" },
  { value: "schedule", label: "Schedule changed" },
  { value: "owner", label: "Owner changed" },
  { value: "status", label: "Status changed" },
  { value: "confirm", label: "Needs confirmation" }
] as const;

const STANDARD_COLUMNS = ["wbs_id", "task_name", "description", "owner", "start_date", "due_date", "status", "dependency", "notes"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const GANTT_ROW_HEIGHT = 40;
const GANTT_GROUP_ROW_HEIGHT = 34;
const GANTT_GROUP_TOP_GAP = 14;
const GANTT_GROUP_BOTTOM_GAP = 10;
const GANTT_BAR_HEIGHT = 12;

const STANDARD_MAPPING = {
  id: "wbs_id",
  task_name: "task_name",
  description: "description",
  owner: "owner",
  start_date: "start_date",
  due_date: "due_date",
  status: "status",
  dependency: "dependency",
  notes: "notes"
} satisfies WbsColumnMapping;

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function rowsToCsv(rows: WbsRow[]) {
  const body = rows.map((row) =>
    [
      row.wbsId,
      row.taskName,
      row.description,
      row.owner,
      normalizeDateValue(row.startDate),
      normalizeDateValue(row.dueDate),
      row.status,
      row.dependency === "-" ? "" : row.dependency,
      row.notes
    ]
      .map((value) => escapeCsv(String(value ?? "")))
      .join(",")
  );
  return [STANDARD_COLUMNS.join(","), ...body].join("\r\n");
}

function csvFileFromRows(rows: WbsRow[]) {
  return new File([`\uFEFF${rowsToCsv(rows)}`], "wbs-standard-template.csv", { type: "text/csv;charset=utf-8" });
}

async function uploadAndMapStandardWbs(projectId: string, rows: WbsRow[]) {
  const snapshot = await api.uploadWbs(projectId, csvFileFromRows(rows));
  await api.mapWbsColumns(projectId, STANDARD_MAPPING);
  return snapshot;
}

function normalizeDateValue(value: string) {
  return value && value !== "-" ? value : "";
}

function formatDateInputValue(value: string) {
  return normalizeDateValue(value);
}

function isValidDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toTime(value) != null;
}

function addDays(value: string, days: number) {
  const time = toTime(value);
  if (time == null) return value;
  const date = new Date(time + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, dueDate: string) {
  const start = toTime(startDate);
  const due = toTime(dueDate);
  if (start == null || due == null) return 0;
  return Math.max(0, Math.round((due - start) / DAY_MS));
}

function hasKnownDates(row: WbsRow) {
  return isValidDateValue(row.startDate) && isValidDateValue(row.dueDate);
}

function clampResizeDate(action: Exclude<DragAction, "move">, originalStartDate: string, originalDueDate: string, deltaDays: number) {
  const durationDays = daysBetween(originalStartDate, originalDueDate);
  if (action === "resize-left") {
    return {
      startDate: addDays(originalStartDate, Math.min(deltaDays, durationDays)),
      dueDate: originalDueDate
    };
  }
  return {
    startDate: originalStartDate,
    dueDate: addDays(originalDueDate, Math.max(deltaDays, -durationDays))
  };
}

function rowFingerprint(row: WbsRow) {
  return JSON.stringify({
    wbsId: row.wbsId,
    taskName: row.taskName,
    description: row.description,
    owner: row.owner,
    startDate: normalizeDateValue(row.startDate),
    dueDate: normalizeDateValue(row.dueDate),
    status: row.status,
    dependency: row.dependency,
    notes: row.notes
  });
}

function firstValue(row: Record<string, string>, keys: string[], fallback = "") {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value]));
  for (const key of keys) {
    const value = normalized[key.toLowerCase()];
    if (value) return value;
  }
  return fallback;
}

function mappedValue(row: Record<string, string>, mappedColumn: string | undefined, fallbackKeys: string[], fallback = "") {
  if (mappedColumn && row[mappedColumn] != null && String(row[mappedColumn]).trim()) return String(row[mappedColumn]).trim();
  return firstValue(row, fallbackKeys, fallback);
}

function inferTaskSource(raw: Record<string, string>) {
  const source = firstValue(raw, ["source", "created_from", "origin", "source meeting", "meeting"]);
  return source && source !== "-" ? source : "WBS 설정에서 직접 등록 또는 가져온 작업";
}

function groupKeyFromAssignment(wbsId: string, taskName: string, assignments: WbsGroupAssignment[]) {
  return assignments.find((assignment) => assignment.wbsId === wbsId)?.groupKey
    || assignments.find((assignment) => assignment.taskName && assignment.taskName === taskName)?.groupKey;
}

function normalizeRawRows(rows: Record<string, string>[], mapping: CachedWbsSnapshot["mapping"] = {}, assignments: WbsGroupAssignment[] = []): WbsRow[] {
  return rows.map((raw, index) => {
    const wbsId = mappedValue(raw, mapping?.id, ["wbs_id", "wbs id", "wbs코드", "id", "_row_id"], `${index + 1}`);
    const taskName = mappedValue(raw, mapping?.task_name, ["task_name", "task name", "작업명", "task", "name"], `Task ${index + 1}`);
    return {
      wbsId,
      groupKey: groupKeyFromAssignment(wbsId, taskName, assignments),
      taskName,
      description: mappedValue(raw, mapping?.description, ["description", "설명"], ""),
      owner: mappedValue(raw, mapping?.owner, ["owner", "담당자", "assignee"], "미정"),
      startDate: mappedValue(raw, mapping?.start_date, ["start_date", "start date", "시작일"], "-"),
      dueDate: mappedValue(raw, mapping?.due_date, ["due_date", "due date", "마감", "마감일"], "-"),
      status: mappedValue(raw, mapping?.status, ["status", "상태"], "예정"),
      dependency: mappedValue(raw, mapping?.dependency, ["dependency", "depends on", "의존성"], "-"),
      lastUpdated: firstValue(raw, ["updated_at", "last updated"], "-"),
      badges: [],
      notes: mappedValue(raw, mapping?.notes, ["notes", "비고"], ""),
      taskSource: inferTaskSource(raw)
    };
  });
}

function toTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function ganttRange(rows: WbsRow[]) {
  const times = rows.flatMap((row) => [toTime(row.startDate), toTime(row.dueDate)]).filter((time): time is number => time != null);
  if (!times.length) return null;
  return { min: Math.min(...times), max: Math.max(...times) };
}

function ganttTaskScheduleRange(rows: WbsRow[]) {
  const starts = rows.map((row) => toTime(row.startDate)).filter((time): time is number => time != null);
  const dues = rows.map((row) => toTime(row.dueDate)).filter((time): time is number => time != null);
  if (!starts.length && !dues.length) return null;
  return {
    min: starts.length ? Math.min(...starts) : Math.min(...dues),
    max: dues.length ? Math.max(...dues) : Math.max(...starts)
  };
}

function ganttTimelineRange(rows: WbsRow[], milestones: WbsMilestone[]) {
  const times = [
    ...rows.flatMap((row) => [toTime(row.startDate), toTime(row.dueDate)]),
    ...milestones.map((milestone) => toTime(milestone.date))
  ].filter((time): time is number => time != null);
  if (!times.length) return null;
  return { min: Math.min(...times), max: Math.max(...times) };
}

function formatShortDate(time: number) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(time));
}

function timelineLabelClass(left: number, width: number) {
  if (left < 66) return "translate-x-0 text-left";
  if (width - left < 132) return "-translate-x-full text-right";
  return "-translate-x-1/2 text-center";
}

function statusBucket(status: string) {
  const normalized = normalizeWbsStatus(status);
  if (normalized === "completed") return "completed";
  if (normalized === "progress") return "progress";
  return "other";
}

export default function CurrentWbsPage() {
  const [projectId, setProjectId] = useActiveProjectId();
  const router = useRouter();
  const [rows, setRows] = useState<WbsRow[]>([]);
  const [savedRows, setSavedRows] = useState<WbsRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ViewMode>("view");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataSource, setDataSource] = useState<"api" | "cache">("api");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [changeTypeFilter, setChangeTypeFilter] = useState<(typeof changeTypeOptions)[number]["value"]>("all");
  const [showCompletedInGantt, setShowCompletedInGantt] = useState(true);
  const [ganttHeight, setGanttHeight] = useState(320);
  const [ganttZoom, setGanttZoom] = useState<GanttZoom>("fit");
  const [milestones, setMilestones] = useState<WbsMilestone[]>([]);
  const [groups, setGroups] = useState<ReturnType<typeof loadWbsGroups>>([]);
  const tableDetailRef = useRef<HTMLDivElement | null>(null);
  const currentDay = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, []);

  useEffect(() => {
    setMilestones(projectId ? loadWbsMilestones(projectId) : []);
    setGroups(projectId ? loadWbsGroups(projectId) : []);
  }, [projectId]);

  useEffect(() => {
    if (!activeId || mode !== "view") return;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tableDetailRef.current?.contains(target)) return;
      setActiveId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [activeId, mode]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const cached = loadWbsSnapshot(projectId);
      const assignments = loadWbsGroupAssignments(projectId);
      if (cached?.rows_preview?.length) {
        const cachedRows = normalizeRawRows(cached.rows_preview, cached.mapping, assignments);
        setRows(cachedRows);
        setSavedRows(cachedRows);
        setActiveId(null);
        setMode("view");
        setDataSource("cache");
        setError(null);
        setMessage(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        if (!projectId) throw new Error("프로젝트 ID가 없습니다.");
        const snapshot = await api.getWbs(projectId);
        const parsed = normalizeRawRows(snapshot.rows_preview, {}, assignments);
        if (!alive) return;
        setRows(parsed);
        setSavedRows(parsed);
        setActiveId(null);
        setMode("view");
        setDataSource("api");
        setMessage(null);
        saveWbsSnapshot(projectId, snapshot);
      } catch (err) {
        if (!alive) return;
        if (cached?.rows_preview?.length) {
          const cachedRows = normalizeRawRows(cached.rows_preview, cached.mapping, assignments);
          setRows(cachedRows);
          setSavedRows(cachedRows);
          setActiveId(null);
          setMode("view");
          setDataSource("cache");
          setError("서버에서 최신 WBS를 불러오지 못해 이 브라우저에 저장된 WBS를 표시합니다.");
        } else {
          setRows([]);
          setSavedRows([]);
          setActiveId(null);
          setMode("view");
          setDataSource("api");
          setError(err instanceof Error ? err.message : "저장된 WBS를 불러오지 못했습니다. WBS 설정에서 먼저 저장해 주세요.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const statusOptions = useMemo(() => ["all", ...Array.from(new Set(rows.map((row) => row.status).filter(Boolean)))], [rows]);
  const ownerOptions = useMemo(() => ["all", ...Array.from(new Set(rows.map((row) => row.owner).filter(Boolean)))], [rows]);
  const rowByWbsId = useMemo(() => new Map(rows.map((row) => [row.wbsId, row])), [rows]);
  const savedFingerprintByWbsId = useMemo(() => new Map(savedRows.map((row) => [row.wbsId, rowFingerprint(row)])), [savedRows]);
  const modifiedIds = useMemo(() => {
    return new Set(rows.filter((row) => savedFingerprintByWbsId.get(row.wbsId) !== rowFingerprint(row)).map((row) => row.wbsId));
  }, [rows, savedFingerprintByWbsId]);
  const unsavedCount = modifiedIds.size;
  const latestUpdatedLabel = useMemo(() => {
    const values = rows.map((row) => row.lastUpdated).filter((value) => value && value !== "-");
    return values[0] ?? "Not available";
  }, [rows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !needle ||
        [row.wbsId, row.taskName, row.owner, row.description, row.notes].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus =
        statusFilter === "all" ||
        row.status === statusFilter ||
        (statusFilter === "__delayed" && getScheduleState(row, currentDay) === "delayed");
      const matchesOwner = ownerFilter === "all" || row.owner === ownerFilter;
      const matchesChangeType = changeTypeFilter === "all" || row.badges.includes(changeTypeFilter as WbsBadge);
      return matchesQuery && matchesStatus && matchesOwner && matchesChangeType;
    });
  }, [changeTypeFilter, currentDay, ownerFilter, query, rows, statusFilter]);
  const groupedRows = useMemo(() => groupWbsTasks(filteredRows, groups), [filteredRows, groups]);
  const visibleGroupedRows = useMemo(() => flattenVisibleRows(groupedRows, collapsedGroupKeys), [collapsedGroupKeys, groupedRows]);

  const activeRow = activeId ? rows.find((row) => row.wbsId === activeId) ?? null : null;
  const summary = useMemo(
    () => ({
      total: rows.length,
      progress: rows.filter((row) => statusBucket(row.status) === "progress").length,
      completed: rows.filter((row) => statusBucket(row.status) === "completed").length,
      delayed: rows.filter((row) => getScheduleState(row, currentDay) === "delayed").length
    }),
    [currentDay, rows]
  );
  const activeSummaryFilter =
    statusFilter === "all" && changeTypeFilter === "all"
        ? "total"
      : statusOptions.find((status) => statusFilter === status && statusBucket(status) === "progress")
          ? "progress"
          : statusOptions.find((status) => statusFilter === status && statusBucket(status) === "completed")
            ? "completed"
            : statusFilter === "__delayed"
              ? "delayed"
              : null;

  function applySummaryFilter(filter: "total" | "progress" | "completed" | "delayed") {
    if (filter === "total") {
      setStatusFilter("all");
      setChangeTypeFilter("all");
      return;
    }
    setChangeTypeFilter("all");
    const matchingStatus = statusOptions.find((status) => status !== "all" && statusBucket(status) === filter);
    setStatusFilter(filter === "delayed" ? "__delayed" : matchingStatus ?? "all");
  }

  function downloadCsv() {
    if (!projectId) return;
    window.location.href = api.downloadWbsUrl(projectId);
  }

  function updateRowDates(wbsId: string, dates: Partial<Pick<WbsRow, "startDate" | "dueDate">>) {
    setRows((current) => current.map((row) => (row.wbsId === wbsId ? { ...row, ...dates } : row)));
  }

  function toggleGroup(groupKey: string) {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  function enterEditMode() {
    setMode("edit");
    setActiveId(null);
    setMessage(null);
    setError(null);
  }

  function resetChanges() {
    setRows(savedRows);
    setMessage("변경사항을 마지막 저장 상태로 되돌렸습니다.");
    setError(null);
  }

  function cancelEdit() {
    if (unsavedCount > 0 && !window.confirm("저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 View mode로 돌아갈까요?")) {
      return;
    }
    setRows(savedRows);
    setMode("view");
    setHoveredId(null);
    setMessage(null);
    setError(null);
  }

  async function saveWbs() {
    if (!projectId || saving || unsavedCount === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const snapshot = await uploadAndMapStandardWbs(projectId, rows);
      saveWbsSnapshot(projectId, snapshot, STANDARD_MAPPING);
      const assignments = rows.map((row) => ({ wbsId: row.wbsId, taskName: row.taskName, groupKey: row.groupKey || "" })).filter((assignment) => assignment.groupKey);
      saveWbsGroupAssignments(projectId, assignments);
      const parsed = normalizeRawRows(snapshot.rows_preview, STANDARD_MAPPING, assignments);
      setRows(parsed);
      setSavedRows(parsed);
      setMode("view");
      setMessage("WBS 변경사항이 저장되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "WBS 변경사항을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[#fafaf9] font-sans text-zinc-950">
      <AppSidebar projectId={projectId} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 bg-white px-8 pb-6 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <nav className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                <span>WBS Keeper</span>
                <span>/</span>
                <span className="text-zinc-700">WBS 현황</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-[-0.024em] text-zinc-950">
                WBS 현황
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-zinc-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
                  프로젝트별 최신 WBS
                </span>
              </h1>
              <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.01em] text-zinc-500">
                선택한 프로젝트에 저장된 WBS 일정과 작업 상태를 확인합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProjectSelector projectId={projectId} onChange={setProjectId} allowCreate={false} preferDefaultProject />
              <span className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-500">
                Last updated: <span className="ml-1 text-zinc-700">{latestUpdatedLabel}</span>
              </span>
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={downloadCsv} disabled={!projectId}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download CSV
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-8 py-5">
          {loading ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState onImport={() => router.push(routes.upload(projectId))} />
          ) : (
            <div className="min-w-0 space-y-4">
                {error && (
                  <div className={cn("flex items-start gap-2 rounded-xl border px-4 py-3 text-[12px] leading-5", dataSource === "cache" ? "border-zinc-200 bg-zinc-50 text-zinc-700" : "border-amber-200 bg-amber-50 text-amber-800")}>
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {message && (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] leading-5 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{message}</span>
                  </div>
                )}

                <section className="grid grid-cols-4 gap-3">
                  <SummaryCard icon={Table2} label="Total Tasks" value={summary.total} tone="neutral" active={activeSummaryFilter === "total"} onClick={() => applySummaryFilter("total")} />
                  <SummaryCard icon={Clock3} label="In Progress" value={summary.progress} tone="progress" active={activeSummaryFilter === "progress"} onClick={() => applySummaryFilter("progress")} />
                  <SummaryCard icon={CheckCircle2} label="Completed" value={summary.completed} tone="completed" active={activeSummaryFilter === "completed"} onClick={() => applySummaryFilter("completed")} />
                  <SummaryCard icon={AlertCircle} label="Delayed" value={summary.delayed} tone="delayed" active={activeSummaryFilter === "delayed"} onClick={() => applySummaryFilter("delayed")} />
                </section>

                <GanttChart
                  displayRows={visibleGroupedRows}
                  timelineRows={rows}
                  collapsedGroupKeys={collapsedGroupKeys}
                  milestones={milestones}
                  height={ganttHeight}
                  showCompleted={showCompletedInGantt}
                  mode={mode}
                  zoom={ganttZoom}
                  hoveredId={hoveredId}
                  activeId={activeId}
                  unsavedCount={unsavedCount}
                  saving={saving}
                  onHeightChange={setGanttHeight}
                  onShowCompletedChange={setShowCompletedInGantt}
                  onZoomChange={setGanttZoom}
                  onHover={setHoveredId}
                  onSelect={setActiveId}
                  onRowDatesChange={updateRowDates}
                  onEnterEditMode={enterEditMode}
                  onSave={saveWbs}
                  onReset={resetChanges}
                  onCancel={cancelEdit}
                  onToggleGroup={toggleGroup}
                />

                <div ref={tableDetailRef} className={cn("grid gap-4", activeRow && mode === "view" ? "xl:grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-1")}>
                  <section className="min-w-0 rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
                    <div className="relative min-w-[240px] flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-9 rounded-lg border-zinc-200 pl-9 text-[12.5px]"
                        placeholder="Search task, owner, WBS ID..."
                      />
                    </div>
                    <FilterSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="All status" />
                    <FilterSelect value={ownerFilter} onChange={setOwnerFilter} options={ownerOptions} allLabel="All owners" />
                    <FilterSelect
                      value={changeTypeFilter}
                      onChange={(value) => setChangeTypeFilter(value as typeof changeTypeFilter)}
                      options={changeTypeOptions.map((item) => item.value)}
                      labels={Object.fromEntries(changeTypeOptions.map((item) => [item.value, item.label]))}
                      allLabel="All change types"
                    />
                  </div>

                  <div className="overflow-hidden">
                    <table className="w-full border-collapse text-left text-[12.5px]">
                      <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-500">
                        <tr className="border-b border-zinc-200">
                          <Th>WBS ID</Th>
                          <Th>Task name</Th>
                          <Th>Owner</Th>
                          <Th>Start date</Th>
                          <Th>Due date</Th>
                          <Th>Status</Th>
                          <Th>Dependency</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleGroupedRows.map((displayRow) => {
                          if (isGroupRow(displayRow)) {
                            const collapsed = collapsedGroupKeys.has(displayRow.groupKey);
                            return (
                              <tr key={`group-${displayRow.groupKey}`} className="border-y border-zinc-200 bg-zinc-50">
                                <td colSpan={7} className="px-3 py-2">
                                  <button type="button" onClick={() => toggleGroup(displayRow.groupKey)} className="flex w-full items-center gap-2 text-left">
                                    {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
                                    <span className="text-[12px] font-semibold text-zinc-800">{displayRow.label}</span>
                                    <span className="text-[11px] font-medium text-zinc-400">· {displayRow.taskCount} tasks</span>
                                    {collapsed && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">collapsed</span>}
                                  </button>
                                </td>
                              </tr>
                            );
                          }
                          const row = displayRow.task;
                          const scheduleBadge = getScheduleBadge(row, currentDay);
                          const showTaskMeta = !hasKnownDates(row) || modifiedIds.has(row.wbsId) || row.badges.length > 0;
                          return (
                            <tr
                              key={row.wbsId}
                              onClick={() => {
                                if (mode === "view") setActiveId((current) => (current === row.wbsId ? null : row.wbsId));
                              }}
                              onMouseEnter={() => setHoveredId(row.wbsId)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={cn(
                                "border-b border-zinc-100 transition-colors hover:bg-red-50/40",
                                mode === "view" ? "cursor-pointer" : "cursor-default",
                                (activeRow?.wbsId === row.wbsId || hoveredId === row.wbsId) && "bg-red-50/50"
                              )}
                            >
                              <Td className="font-mono font-semibold text-zinc-700">{row.wbsId}</Td>
                              <Td>
                                <div className="flex min-h-[28px] flex-col justify-center">
                                  <div className="font-semibold leading-tight text-zinc-950">{row.taskName}</div>
                                  {showTaskMeta && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {!hasKnownDates(row) && <DateUnknownBadge />}
                                      {modifiedIds.has(row.wbsId) && (
                                        <span className="inline-flex rounded border border-[#FD312E]/25 bg-[#FD312E]/5 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#FD312E]">
                                          Modified
                                        </span>
                                      )}
                                      {row.badges.map((badge) => (
                                        <StatusBadge key={badge} badge={badge} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </Td>
                              <Td>{row.owner}</Td>
                              <Td>
                                {mode === "edit" ? (
                                  <DateCellInput value={row.startDate} onChange={(value) => updateRowDates(row.wbsId, { startDate: value || "-" })} />
                                ) : (
                                  row.startDate
                                )}
                              </Td>
                              <Td className="min-w-[150px]">
                                {mode === "edit" ? (
                                  <DateCellInput value={row.dueDate} onChange={(value) => updateRowDates(row.wbsId, { dueDate: value || "-" })} />
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="whitespace-nowrap">{row.dueDate}</span>
                                    {scheduleBadge && (
                                      <span
                                        title={scheduleBadge.label}
                                        className={cn("w-fit whitespace-nowrap rounded border px-1.5 py-0.5 text-[10.5px] font-semibold leading-none", scheduleBadge.className)}
                                      >
                                        {scheduleBadge.label.replace(/^지연\s*/, "")}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </Td>
                              <Td>
                                <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", getWbsStatusBadgeClass(row.status))}>{getWbsStatusLabel(row.status)}</span>
                              </Td>
                              <Td className="max-w-[112px]">
                                <DependencyCell
                                  dependency={row.dependency}
                                  dependencyRow={rowByWbsId.get(row.dependency)}
                                  onSelect={(wbsId) => setActiveId(wbsId)}
                                />
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredRows.length === 0 && <div className="px-6 py-12 text-center text-sm text-zinc-500">조건에 맞는 WBS row가 없습니다.</div>}
                  </div>
                  </section>

                  {activeRow && mode === "view" && (
                    <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
                      <TaskDrawer row={activeRow} onClose={() => setActiveId(null)} className="max-h-[calc(100vh-120px)]" />
                    </div>
                  )}
                </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "neutral" | "progress" | "completed" | "delayed";
  active?: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-600",
    progress: "border-zinc-200 bg-white text-zinc-700",
    completed: "border-zinc-300 bg-zinc-100 text-zinc-600",
    delayed: "border-[#FD312E]/25 bg-[#FD312E]/5 text-[#FD312E]"
  }[tone];
  const activeClass = {
    neutral: "border-zinc-500 ring-zinc-200",
    progress: "border-zinc-500 ring-zinc-200",
    completed: "border-zinc-500 ring-zinc-200",
    delayed: "border-[#FD312E] ring-[#FD312E]/15"
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-zinc-300 hover:bg-zinc-50",
        active ? cn("bg-white ring-2", activeClass) : "border-zinc-200"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg border", toneClass, active && "shadow-sm")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[22px] font-semibold tracking-[-0.03em] text-zinc-950">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400">{label}</p>
    </button>
  );
}

function GanttChart({
  displayRows,
  timelineRows,
  collapsedGroupKeys,
  milestones,
  height,
  showCompleted,
  mode,
  zoom,
  hoveredId,
  activeId,
  unsavedCount,
  saving,
  onHeightChange,
  onShowCompletedChange,
  onZoomChange,
  onHover,
  onSelect,
  onRowDatesChange,
  onEnterEditMode,
  onSave,
  onReset,
  onCancel,
  onToggleGroup
}: {
  displayRows: WbsDisplayRow<WbsRow>[];
  timelineRows: WbsRow[];
  collapsedGroupKeys: Set<string>;
  milestones: WbsMilestone[];
  height: number;
  showCompleted: boolean;
  mode: ViewMode;
  zoom: GanttZoom;
  hoveredId: string | null;
  activeId: string | null;
  unsavedCount: number;
  saving: boolean;
  onHeightChange: (height: number) => void;
  onShowCompletedChange: (show: boolean) => void;
  onZoomChange: (zoom: GanttZoom) => void;
  onHover: (wbsId: string | null) => void;
  onSelect: (wbsId: string) => void;
  onRowDatesChange: (wbsId: string, dates: Partial<Pick<WbsRow, "startDate" | "dueDate">>) => void;
  onEnterEditMode: () => void;
  onSave: () => void;
  onReset: () => void;
  onCancel: () => void;
  onToggleGroup: (groupKey: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(960);
  const displayRowsAfterStatus = useMemo(
    () => displayRows.filter((row) => row.type === "group" || showCompleted || statusBucket(row.task.status) !== "completed"),
    [displayRows, showCompleted]
  );
  const visibleRows = useMemo(() => displayRowsAfterStatus.filter((row): row is Extract<WbsDisplayRow<WbsRow>, { type: "task" }> => row.type === "task").map((row) => row.task), [displayRowsAfterStatus]);
  const validMilestones = milestones.filter((milestone) => toTime(milestone.date) != null);
  const taskRange = ganttTaskScheduleRange(timelineRows);
  const range = ganttTimelineRange(timelineRows, validMilestones);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const fitBaseMin = taskRange?.min ?? range?.min ?? todayTime;
  const fitBaseMax = taskRange?.max ?? range?.max ?? todayTime;
  const min = zoom === "fit" ? fitBaseMin - DAY_MS * 3 : (range ? Math.min(range.min, todayTime) : todayTime) - DAY_MS * 3;
  const max = zoom === "fit" ? fitBaseMax + DAY_MS * 7 : (range ? Math.max(range.max, todayTime) : todayTime) + DAY_MS * 7;
  const totalDays = Math.max(1, Math.ceil((max - min) / DAY_MS));
  const timelineViewportWidth = Math.max(360, viewportWidth - 232);
  const pxPerDay = zoom === "week" ? 36 : zoom === "month" ? 14 : Math.max(2, timelineViewportWidth / totalDays);
  const timelineWidth = zoom === "fit" ? timelineViewportWidth : Math.max(720, totalDays * pxPerDay);
  const todayLeft = Math.max(0, Math.min(timelineWidth, ((todayTime - min) / DAY_MS) * pxPerDay));
  const tickEveryDays = zoom === "week" ? 7 : zoom === "fit" ? (totalDays > 90 ? 30 : 7) : 30;
  const ticks = Array.from({ length: Math.floor(totalDays / tickEveryDays) + 1 }, (_, index) => min + index * tickEveryDays * DAY_MS);
  const milestoneMarkers = useMemo(() => {
    const markers = [
      { id: "today", label: "TODAY", dateLabel: formatShortDate(todayTime), left: todayLeft, type: "today" as const },
      ...validMilestones.map((milestone) => ({
        id: milestone.id,
        label: milestone.label,
        dateLabel: formatShortDate(toTime(milestone.date)!),
        left: getMilestonePosition(toTime(milestone.date)!, min, pxPerDay, timelineWidth),
        type: "milestone" as const
      }))
    ].sort((a, b) => a.left - b.left);
    return resolveMilestoneLabelVisibility(markers, zoom === "week" ? 96 : 72);
  }, [min, pxPerDay, timelineWidth, todayLeft, todayTime, validMilestones]);
  const [dragTooltip, setDragTooltip] = useState<{ wbsId: string; text: string; left: number; top: number } | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const updateWidth = () => setViewportWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [zoom]);
  const rowLayouts = useMemo(() => {
    const layouts = new Map<string, DependencyLayoutItem>();
    let cursorY = 0;
    displayRowsAfterStatus.forEach((displayRow, index) => {
      if (isGroupRow(displayRow)) {
        cursorY += (index === 0 ? 0 : GANTT_GROUP_TOP_GAP) + GANTT_GROUP_ROW_HEIGHT + GANTT_GROUP_BOTTOM_GAP;
        return;
      }
      const geometry = barGeometry(displayRow.task);
      if (geometry) {
        layouts.set(displayRow.task.wbsId, {
          left: geometry.left,
          top: cursorY + (GANTT_ROW_HEIGHT - GANTT_BAR_HEIGHT) / 2,
          width: geometry.width,
          height: GANTT_BAR_HEIGHT
        });
      }
      cursorY += GANTT_ROW_HEIGHT;
    });
    return layouts;
  }, [displayRowsAfterStatus, min, pxPerDay]);
  const ganttRowsHeight = useMemo(
    () =>
      displayRowsAfterStatus.reduce((height, row, index) => {
        if (isGroupRow(row)) return height + (index === 0 ? 0 : GANTT_GROUP_TOP_GAP) + GANTT_GROUP_ROW_HEIGHT + GANTT_GROUP_BOTTOM_GAP;
        return height + GANTT_ROW_HEIGHT;
      }, 0),
    [displayRowsAfterStatus]
  );
  const dependencyLinks = useMemo(
    () =>
      resolveDependencyLinks(
        visibleRows
          .filter((row) => rowLayouts.has(row.wbsId))
          .map((row) => ({
            id: row.wbsId,
            taskName: row.taskName,
            dependency: row.dependency
          }))
      ),
    [rowLayouts, visibleRows]
  );

  function barGeometry(row: WbsRow) {
    const start = toTime(row.startDate);
    const due = toTime(row.dueDate);
    if (start == null || due == null) return null;
    const normalizedDue = Math.max(start, due);
    return {
      left: Math.max(0, ((start - min) / DAY_MS) * pxPerDay),
      width: Math.max(24, ((normalizedDue - start) / DAY_MS + 1) * pxPerDay)
    };
  }

  function startGanttDrag(event: ReactPointerEvent<HTMLElement>, row: WbsRow, action: DragAction) {
    if (mode !== "edit" || !isValidDateValue(row.startDate) || !isValidDateValue(row.dueDate)) return;
    if (action === "move" && (event.target as HTMLElement).closest("[data-gantt-resize-handle]")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const barTop = event.currentTarget.getBoundingClientRect().top;
    const originalStartDate = row.startDate;
    const originalDueDate = row.dueDate;
    let lastDeltaDays = 0;
    const applyDelta = (deltaDays: number, clientX: number, clientY: number) => {
      let nextStartDate = originalStartDate;
      let nextDueDate = originalDueDate;
      let tooltipText = "";
      if (action === "move") {
        nextStartDate = addDays(originalStartDate, deltaDays);
        nextDueDate = addDays(originalDueDate, deltaDays);
        tooltipText = `${originalStartDate} ~ ${originalDueDate} → ${nextStartDate} ~ ${nextDueDate}`;
      } else {
        const resized = clampResizeDate(action, originalStartDate, originalDueDate, deltaDays);
        nextStartDate = resized.startDate;
        nextDueDate = resized.dueDate;
        tooltipText =
          action === "resize-left"
            ? `Start: ${originalStartDate} → ${nextStartDate}`
            : `Due: ${originalDueDate} → ${nextDueDate}`;
      }
      if (action === "move") {
        onRowDatesChange(row.wbsId, { startDate: nextStartDate, dueDate: nextDueDate });
      } else if (action === "resize-left") {
        onRowDatesChange(row.wbsId, { startDate: nextStartDate });
      } else {
        onRowDatesChange(row.wbsId, { dueDate: nextDueDate });
      }
      setDragTooltip({ wbsId: row.wbsId, text: tooltipText, left: clientX - startX, top: Math.max(-36, clientY - barTop - 42) });
    };
    applyDelta(0, event.clientX, event.clientY);
    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaDays = Math.round((moveEvent.clientX - startX) / pxPerDay);
      if (deltaDays === lastDeltaDays) return;
      lastDeltaDays = deltaDays;
      applyDelta(deltaDays, moveEvent.clientX, moveEvent.clientY);
    };
    const onPointerUp = () => {
      setDragTooltip(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = Math.max(240, Math.min(760, startHeight + moveEvent.clientY - startY));
      onHeightChange(nextHeight);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="space-y-3 border-b border-zinc-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <Calendar className="h-3.5 w-3.5 text-zinc-500" />
            일정 타임라인
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {mode === "view" ? (
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={onEnterEditMode}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                간트 일정 수정
              </Button>
            ) : (
              <>
                <span className="inline-flex h-8 items-center rounded-lg border border-[#FD312E]/25 bg-[#FD312E]/5 px-3 text-xs font-semibold text-[#FD312E]">
                  {unsavedCount} unsaved
                </span>
                <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={onReset} disabled={saving || unsavedCount === 0}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Reset
                </Button>
                <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={onCancel} disabled={saving}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button className="h-8 rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800" onClick={onSave} disabled={saving || unsavedCount === 0}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {mode === "edit" ? "드래그해서 일정을 조정할 수 있습니다." : "빨간 기준선은 오늘 날짜입니다."}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 rounded-lg border border-zinc-200 bg-white p-0.5">
                {[
                  { value: "fit" as const, label: "전체", title: "전체 일정이 한 화면에 보이도록 맞춤" },
                  { value: "month" as const, label: "월", title: "월 단위로 보기" },
                  { value: "week" as const, label: "주", title: "주 단위로 자세히 보기" }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onZoomChange(item.value)}
                    title={item.title}
                    className={cn(
                      "rounded-md px-2.5 text-[11.5px] font-semibold transition-colors",
                      zoom === item.value ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-5 w-px bg-zinc-200/70" />
            <div className="flex h-8 items-center gap-2 text-[11.5px] font-medium text-zinc-700">
              <span>완료 숨김</span>
              <MiniSwitch checked={!showCompleted} onCheckedChange={(checked) => onShowCompletedChange(!checked)} />
            </div>
          </div>
        </div>
      </div>
      {visibleRows.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-zinc-500">표시할 일정이 없습니다. 완료 숨김을 끄면 완료된 일정도 다시 표시됩니다.</div>
      ) : (
        <>
        <div ref={scrollRef} className={cn("px-4 py-3", zoom === "fit" ? "overflow-y-auto overflow-x-hidden" : "overflow-auto")} style={{ height }}>
          <div className="mb-2 grid gap-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-500" style={{ gridTemplateColumns: `220px ${timelineWidth}px` }}>
            <span className="pt-1">Task</span>
            <div className="relative h-9">
              {ticks.map((tick) => (
                <span key={tick} className="absolute top-0 -translate-x-1/2" style={{ left: `${((tick - min) / DAY_MS) * pxPerDay}px` }}>
                  {formatShortDate(tick)}
                </span>
              ))}
              <div className="absolute left-0 top-5 h-4 w-full">
                {milestoneMarkers.map((marker) => (
                  <div
                    key={marker.id}
                    className={cn(
                      "absolute flex max-w-[132px] items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 text-[10px] font-semibold tracking-normal",
                      marker.variant === "today" ? "px-1" : "border px-2 py-0.5",
                      getMilestoneMarkerClass(marker).label,
                      timelineLabelClass(marker.left, timelineWidth)
                    )}
                    style={{ left: marker.left }}
                    title={marker.title}
                  >
                    {marker.variant === "today" && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", getMilestoneMarkerClass(marker).marker)} />}
                    {marker.display !== "hidden" && <span className="truncate">{marker.displayLabel}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute top-0 z-20" style={{ left: 232, width: timelineWidth, height: ganttRowsHeight }}>
              <GanttDependencyLayer
                links={dependencyLinks}
                layouts={rowLayouts}
                width={timelineWidth}
                height={ganttRowsHeight}
                muted={dragTooltip != null}
              />
            </div>
            {displayRowsAfterStatus.map((displayRow, index) => {
              if (isGroupRow(displayRow)) {
                const collapsed = collapsedGroupKeys.has(displayRow.groupKey);
                return (
                  <div
                    key={`group-${displayRow.groupKey}`}
                    className="grid items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 text-[12px] shadow-[inset_0_-1px_0_rgba(212,212,216,0.55)]"
                    style={{
                      gridTemplateColumns: `220px ${timelineWidth}px`,
                      minHeight: GANTT_GROUP_ROW_HEIGHT,
                      marginTop: index === 0 ? 0 : GANTT_GROUP_TOP_GAP,
                      marginBottom: GANTT_GROUP_BOTTOM_GAP
                    }}
                  >
                    <button type="button" onClick={() => onToggleGroup(displayRow.groupKey)} className="flex min-w-0 items-center gap-2 px-2 text-left">
                      {collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                      <span className="truncate font-semibold text-zinc-800">{displayRow.label}</span>
                      <span className="shrink-0 text-[11px] font-medium text-zinc-400">· {displayRow.taskCount} tasks</span>
                      {collapsed && <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">collapsed</span>}
                    </button>
                    <button type="button" onClick={() => onToggleGroup(displayRow.groupKey)} className="h-full rounded-r-lg bg-zinc-50 text-left hover:bg-zinc-100" aria-label={`${displayRow.label} group toggle`} />
                  </div>
                );
              }
              const row = displayRow.task;
              const geometry = barGeometry(row);
              const highlighted = hoveredId === row.wbsId || activeId === row.wbsId;
              return (
                <div
                  key={row.wbsId}
                  className={cn("grid items-center gap-3 rounded-lg text-[12px] transition-colors", highlighted && "bg-red-50/50")}
                  style={{ gridTemplateColumns: `220px ${timelineWidth}px`, minHeight: GANTT_ROW_HEIGHT }}
                  onMouseEnter={() => onHover(row.wbsId)}
                  onMouseLeave={() => onHover(null)}
                >
                  <div className="flex h-full min-w-0 flex-col justify-center pl-4">
                    <p className="truncate font-semibold leading-tight text-zinc-800">{row.taskName}</p>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 leading-none">
                      <p className="shrink-0 font-mono text-[10.5px] leading-none text-zinc-400">{row.wbsId}</p>
                      <span className="min-w-0 truncate rounded-md bg-zinc-100 px-1.5 py-[1px] text-[10.5px] font-medium leading-tight text-zinc-500">
                        {row.owner && row.owner !== "-" ? row.owner : "담당자 미정"}
                      </span>
                    </div>
                  </div>
                  <div className={cn("relative h-7 rounded-md bg-zinc-50 transition-colors", highlighted && "bg-red-50/40")}>
                    <div
                      className={cn("absolute bottom-0 top-0 z-10 w-px", getMilestoneMarkerClass({ label: "TODAY", type: "today" }).line)}
                      style={{ left: `${todayLeft}px` }}
                    />
                    {validMilestones.map((milestone) => {
                      const milestoneLeft = Math.max(0, Math.min(timelineWidth, ((toTime(milestone.date)! - min) / DAY_MS) * pxPerDay));
                      return (
                        <div
                          key={milestone.id}
                          className={cn("absolute bottom-0 top-0 z-10 border-l", getMilestoneMarkerClass({ label: milestone.label, type: "milestone" }).line)}
                          style={{ left: `${milestoneLeft}px` }}
                          title={`${milestone.label}\n${milestone.date}`}
                        />
                      );
                    })}
                    {geometry ? (
                      <div
                        role={mode === "edit" ? "button" : undefined}
                        tabIndex={mode === "edit" ? 0 : undefined}
                        title={mode === "edit" ? "Drag to move task dates" : `${row.startDate} - ${row.dueDate}`}
                        onPointerDown={(event) => startGanttDrag(event, row, "move")}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (mode === "view") onSelect(row.wbsId);
                        }}
                        className={cn("absolute top-1/2 h-6 -translate-y-1/2 rounded-full", mode === "edit" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
                        style={{ left: `${geometry.left}px`, width: `${geometry.width}px` }}
                      >
                        <span
                          className={cn(
                            "pointer-events-none absolute inset-x-0 top-1/2 h-3.5 -translate-y-1/2 rounded-full border border-white/70 shadow-sm transition-[height,box-shadow]",
                            getGanttBarClass(row, todayTime),
                            highlighted && "h-4 shadow-md ring-2 ring-red-200"
                          )}
                        >
                          {getScheduleState(row, todayTime) === "delayed" && <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-full bg-red-300" />}
                        </span>
                        {mode === "edit" && (
                          <>
                            <span
                              data-gantt-resize-handle="left"
                              className="absolute left-0 top-1/2 z-20 h-5 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-white/80 bg-white/70 shadow-sm"
                              onPointerDown={(event) => startGanttDrag(event, row, "resize-left")}
                              title="Resize start date"
                            />
                            <span
                              data-gantt-resize-handle="right"
                              className="absolute right-0 top-1/2 z-20 h-5 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-white/80 bg-white/70 shadow-sm"
                              onPointerDown={(event) => startGanttDrag(event, row, "resize-right")}
                              title="Resize due date"
                            />
                            {dragTooltip?.wbsId === row.wbsId && (
                              <span
                                className="pointer-events-none absolute z-30 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-800 shadow-lg"
                                style={{ left: `${Math.max(0, Math.min(geometry.width - 8, dragTooltip.left))}px`, top: `${dragTooltip.top}px` }}
                              >
                                {dragTooltip.text}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-dashed border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500">
                        날짜 미정
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {visibleRows.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
                표시할 일정이 없습니다. 완료 숨김을 끄면 완료된 일정도 다시 표시됩니다.
              </div>
            )}
          </div>
        </div>
        <div
          role="separator"
          aria-label="간트 차트 높이 조절"
          onPointerDown={startResize}
          className="group flex h-4 cursor-row-resize items-center justify-center border-t border-zinc-100 bg-white hover:bg-zinc-50"
        >
          <span className="h-1 w-12 rounded-full bg-zinc-300 transition-colors group-hover:bg-zinc-500" />
        </div>
        </>
      )}
    </section>
  );
}

function TaskDrawer({ row, onClose, className }: { row: WbsRow | null; onClose: () => void; className?: string }) {
  if (!row) {
    return <aside className="flex min-h-0 flex-col rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">WBS row를 선택하면 상세 정보가 표시됩니다.</aside>;
  }

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold leading-5 text-zinc-950">Task Detail</h2>
          <p className="font-mono text-[11px] font-medium uppercase text-zinc-400">WBS {row.wbsId}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4">
        <section>
          <h3 className="text-lg font-semibold leading-6 tracking-tight text-zinc-950">{row.taskName}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", getWbsStatusBadgeClass(row.status))}>{getWbsStatusLabel(row.status)}</span>
            {getScheduleBadge(row) && (
              <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", getScheduleBadge(row)!.className)}>{getScheduleBadge(row)!.label}</span>
            )}
            {!hasKnownDates(row) && <DateUnknownBadge />}
            {row.badges.map((badge) => (
              <StatusBadge key={badge} badge={badge} />
            ))}
          </div>
        </section>

        {row.description && (
          <DrawerSection title="Description">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12.5px] leading-5 text-zinc-700">{row.description}</p>
          </DrawerSection>
        )}

        <section className="grid grid-cols-2 gap-2 text-[12px]">
          <DetailItem label="Task ID" value={row.wbsId} icon={Table2} />
          <DetailItem label="Owner" value={row.owner} icon={UserRound} />
          <DetailItem label="Start date" value={row.startDate} icon={Calendar} />
          <DetailItem label="Due date" value={row.dueDate} icon={Calendar} />
          <DetailItem label="Schedule state" value={getScheduleStateLabel(row)} icon={Clock3} />
          <DetailItem label="Dependency" value={row.dependency} icon={GitBranch} />
        </section>

        <DrawerSection title="Task source">
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12.5px] leading-5 text-zinc-700">{row.taskSource}</p>
        </DrawerSection>

        {row.notes && (
          <DrawerSection title="Notes">
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12.5px] leading-5 text-zinc-700">{row.notes}</p>
          </DrawerSection>
        )}
      </div>
    </aside>
  );
}

function DetailItem({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="font-semibold text-zinc-800">{value || "-"}</div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">{title}</h4>
      {children}
    </section>
  );
}

function StatusBadge({ badge }: { badge: WbsBadge }) {
  const config = badgeConfig[badge];
  return <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10.5px] font-semibold", config.className)}>{config.label}</span>;
}

function DateUnknownBadge() {
  return <span className="inline-flex rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-600">날짜 미정</span>;
}

function MiniSwitch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 bg-zinc-100"
      )}
    >
      <span
        className={cn(
          "pointer-events-none h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[17px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function DateCellInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputValue = formatDateInputValue(value);
  return (
    <input
      type="date"
      value={inputValue}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-8 w-[140px] rounded-lg border bg-white px-2 text-[12px] font-medium text-zinc-700 outline-none focus:border-[#FD312E]/60 focus:ring-2 focus:ring-[#FD312E]/15",
        inputValue && !isValidDateValue(inputValue) ? "border-[#FD312E]/40" : "border-zinc-200"
      )}
    />
  );
}

function DependencyCell({
  dependency,
  dependencyRow,
  onSelect
}: {
  dependency: string;
  dependencyRow?: WbsRow;
  onSelect: (wbsId: string) => void;
}) {
  if (!dependency || dependency === "-") return <span className="text-zinc-400">-</span>;
  if (!dependencyRow) {
    return (
      <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-800">
        {dependency}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(dependencyRow.wbsId);
      }}
      className="group inline-flex max-w-[72px] items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-left text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-100"
      title={`${dependencyRow.wbsId} · ${dependencyRow.taskName}`}
    >
      <span className="shrink-0 font-mono font-semibold">{dependencyRow.wbsId}</span>
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  labels,
  allLabel
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  allLabel: string;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[12.5px] font-medium text-zinc-700 outline-none focus:border-zinc-400">
      {options.map((option) => (
        <option key={option} value={option}>
          {option === "all" ? allLabel : labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-3">{children}</th>;
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-3 py-3 align-middle text-zinc-700", className)}>{children}</td>;
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[92px] animate-pulse rounded-xl border border-zinc-200 bg-white" />
        ))}
      </div>
      <div className="h-[460px] animate-pulse rounded-xl border border-zinc-200 bg-white" />
    </div>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-500">
          <FileDown className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-950">No WBS data yet</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">WBS 설정에서 WBS를 저장하면 현재 일정이 표시됩니다.</p>
        <Button className="mt-5 rounded-lg bg-zinc-950 text-xs font-semibold text-white hover:bg-zinc-800" onClick={onImport}>
          WBS 설정
        </Button>
      </div>
    </div>
  );
}
