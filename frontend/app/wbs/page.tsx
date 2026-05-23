"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
import { flattenVisibleRows, groupWbsTasks, type WbsDisplayRow } from "@/components/wbs/wbs-grouping";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import type { WbsColumnMapping } from "@/lib/types";
import { useActiveProjectId } from "@/lib/use-project-id";
import { loadWbsMilestones, loadWbsSnapshot, saveWbsSnapshot, type CachedWbsSnapshot, type WbsMilestone } from "@/lib/wbs-cache";
import { cn } from "@/lib/utils";

type WbsRow = {
  wbsId: string;
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
type GanttZoom = "week" | "month";
type DragAction = "move" | "resize-left" | "resize-right";

const badgeConfig: Record<WbsBadge, { label: string; className: string }> = {
  recent: { label: "Recently updated", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  new: { label: "New task", className: "border-sky-200 bg-sky-50 text-sky-800" },
  schedule: { label: "Schedule changed", className: "border-violet-200 bg-violet-50 text-violet-800" },
  owner: { label: "Owner changed", className: "border-amber-200 bg-amber-50 text-amber-800" },
  status: { label: "Status changed", className: "border-orange-200 bg-orange-50 text-orange-800" },
  confirm: { label: "Needs confirmation", className: "border-rose-200 bg-rose-50 text-rose-800" }
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
const GANTT_BAR_CENTER_OFFSET = 16;

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

function normalizeRawRows(rows: Record<string, string>[], mapping: CachedWbsSnapshot["mapping"] = {}): WbsRow[] {
  return rows.map((raw, index) => {
    const wbsId = mappedValue(raw, mapping?.id, ["wbs_id", "wbs id", "wbs코드", "id", "_row_id"], `${index + 1}`);
    const taskName = mappedValue(raw, mapping?.task_name, ["task_name", "task name", "작업명", "task", "name"], `Task ${index + 1}`);
    return {
      wbsId,
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

function timelineLabelClass(left: number) {
  if (left < 8) return "translate-x-0 text-left";
  if (left > 92) return "-translate-x-full text-right";
  return "-translate-x-1/2 text-center";
}

function statusBucket(status: string) {
  const text = status.toLowerCase();
  if (text.includes("완료") || text.includes("done") || text.includes("complete")) return "completed";
  if (text.includes("진행") || text.includes("progress")) return "progress";
  if (text.includes("지연") || text.includes("delay") || text.includes("late")) return "delayed";
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
  const [ganttZoom, setGanttZoom] = useState<GanttZoom>("week");
  const [milestones, setMilestones] = useState<WbsMilestone[]>([]);

  useEffect(() => {
    setMilestones(projectId ? loadWbsMilestones(projectId) : []);
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const cached = loadWbsSnapshot(projectId);
      if (cached?.rows_preview?.length) {
        const cachedRows = normalizeRawRows(cached.rows_preview, cached.mapping);
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
        const parsed = normalizeRawRows(snapshot.rows_preview);
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
          const cachedRows = normalizeRawRows(cached.rows_preview, cached.mapping);
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
        (statusFilter === "__delayed" && (statusBucket(row.status) === "delayed" || row.badges.includes("schedule")));
      const matchesOwner = ownerFilter === "all" || row.owner === ownerFilter;
      const matchesChangeType = changeTypeFilter === "all" || row.badges.includes(changeTypeFilter as WbsBadge);
      return matchesQuery && matchesStatus && matchesOwner && matchesChangeType;
    });
  }, [changeTypeFilter, ownerFilter, query, rows, statusFilter]);
  const groupedRows = useMemo(() => groupWbsTasks(filteredRows), [filteredRows]);
  const visibleGroupedRows = useMemo(() => flattenVisibleRows(groupedRows, collapsedGroupKeys), [collapsedGroupKeys, groupedRows]);

  const activeRow = activeId ? rows.find((row) => row.wbsId === activeId) ?? null : null;
  const summary = useMemo(
    () => ({
      total: rows.length,
      progress: rows.filter((row) => statusBucket(row.status) === "progress").length,
      completed: rows.filter((row) => statusBucket(row.status) === "completed").length,
      delayed: rows.filter((row) => statusBucket(row.status) === "delayed" || row.badges.includes("schedule")).length
    }),
    [rows]
  );
  const activeSummaryFilter =
    statusFilter === "all" && changeTypeFilter === "all"
        ? "total"
      : statusOptions.find((status) => statusFilter === status && statusBucket(status) === "progress")
          ? "progress"
          : statusOptions.find((status) => statusFilter === status && statusBucket(status) === "completed")
            ? "completed"
            : statusFilter === "__delayed" || statusOptions.find((status) => statusFilter === status && statusBucket(status) === "delayed")
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
    setStatusFilter(filter === "delayed" ? matchingStatus ?? "__delayed" : matchingStatus ?? "all");
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
      const parsed = normalizeRawRows(snapshot.rows_preview, STANDARD_MAPPING);
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
            <div className={cn("grid gap-4", activeRow && mode === "view" ? "grid-cols-[minmax(760px,1fr)_360px]" : "grid-cols-1")}>
              <div className="min-w-0 space-y-4">
                {error && (
                  <div className={cn("flex items-start gap-2 rounded-xl border px-4 py-3 text-[12px] leading-5", dataSource === "cache" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
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

                <section className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
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
                          <Th>Last updated</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleGroupedRows.map((displayRow) => {
                          if (displayRow.type === "group") {
                            const collapsed = collapsedGroupKeys.has(displayRow.groupKey);
                            return (
                              <tr key={`group-${displayRow.groupKey}`} className="border-b border-zinc-100 bg-zinc-50/80">
                                <td colSpan={8} className="px-3 py-2">
                                  <button type="button" onClick={() => toggleGroup(displayRow.groupKey)} className="flex w-full items-center gap-2 text-left">
                                    {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />}
                                    <span className="text-[12px] font-semibold text-zinc-800">{displayRow.label}</span>
                                    <span className="text-[11px] font-medium text-zinc-400">· {displayRow.taskCount} tasks</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          }
                          const row = displayRow.task;
                          return (
                            <tr
                              key={row.wbsId}
                              onClick={() => {
                                if (mode === "view") setActiveId(row.wbsId);
                              }}
                              onMouseEnter={() => setHoveredId(row.wbsId)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={cn(
                                "border-b border-zinc-100 transition-colors hover:bg-zinc-50",
                                mode === "view" ? "cursor-pointer" : "cursor-default",
                                (activeRow?.wbsId === row.wbsId || hoveredId === row.wbsId) && "bg-sky-50/60"
                              )}
                            >
                              <Td className="font-mono font-semibold text-zinc-700">{row.wbsId}</Td>
                              <Td>
                                <div className="font-semibold text-zinc-950">{row.taskName}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {!hasKnownDates(row) && <DateUnknownBadge />}
                                  {modifiedIds.has(row.wbsId) && (
                                    <span className="inline-flex rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-800">
                                      Modified
                                    </span>
                                  )}
                                  {row.badges.map((badge) => (
                                    <StatusBadge key={badge} badge={badge} />
                                  ))}
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
                              <Td className={row.badges.includes("schedule") ? "font-semibold text-violet-700" : undefined}>
                                {mode === "edit" ? (
                                  <DateCellInput value={row.dueDate} onChange={(value) => updateRowDates(row.wbsId, { dueDate: value || "-" })} />
                                ) : (
                                  row.dueDate
                                )}
                              </Td>
                              <Td>
                                <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", statusClass(row.status))}>{row.status}</span>
                              </Td>
                              <Td>
                                <DependencyCell
                                  dependency={row.dependency}
                                  dependencyRow={rowByWbsId.get(row.dependency)}
                                  onSelect={(wbsId) => setActiveId(wbsId)}
                                />
                              </Td>
                              <Td>{row.lastUpdated}</Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredRows.length === 0 && <div className="px-6 py-12 text-center text-sm text-zinc-500">조건에 맞는 WBS row가 없습니다.</div>}
                  </div>
                </section>
              </div>

              {activeRow && mode === "view" && <TaskDrawer row={activeRow} onClose={() => setActiveId(null)} />}
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
    progress: "border-sky-200 bg-sky-50 text-sky-700",
    completed: "border-zinc-300 bg-zinc-100 text-zinc-600",
    delayed: "border-rose-200 bg-rose-50 text-rose-700"
  }[tone];
  const activeClass = {
    neutral: "border-zinc-500 ring-zinc-200",
    progress: "border-sky-500 ring-sky-100",
    completed: "border-zinc-500 ring-zinc-200",
    delayed: "border-rose-500 ring-rose-100"
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
  const displayRowsAfterStatus = useMemo(
    () => displayRows.filter((row) => row.type === "group" || showCompleted || statusBucket(row.task.status) !== "completed"),
    [displayRows, showCompleted]
  );
  const visibleRows = useMemo(() => displayRowsAfterStatus.filter((row): row is Extract<WbsDisplayRow<WbsRow>, { type: "task" }> => row.type === "task").map((row) => row.task), [displayRowsAfterStatus]);
  const validMilestones = milestones.filter((milestone) => toTime(milestone.date) != null);
  const range = ganttTimelineRange(visibleRows, validMilestones);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const min = (range ? Math.min(range.min, todayTime) : todayTime) - DAY_MS * 3;
  const max = (range ? Math.max(range.max, todayTime) : todayTime) + DAY_MS * 7;
  const totalDays = Math.max(1, Math.ceil((max - min) / DAY_MS));
  const pxPerDay = zoom === "week" ? 36 : 14;
  const timelineWidth = Math.max(720, totalDays * pxPerDay);
  const todayLeft = Math.max(0, Math.min(timelineWidth, ((todayTime - min) / DAY_MS) * pxPerDay));
  const tickEveryDays = zoom === "week" ? 7 : 30;
  const ticks = Array.from({ length: Math.floor(totalDays / tickEveryDays) + 1 }, (_, index) => min + index * tickEveryDays * DAY_MS);
  const [dragTooltip, setDragTooltip] = useState<{ wbsId: string; text: string; left: number; top: number } | null>(null);
  const rowLayouts = useMemo(() => {
    const layouts = new Map<string, DependencyLayoutItem>();
    displayRowsAfterStatus.forEach((displayRow, rowIndex) => {
      if (displayRow.type !== "task") return;
      const geometry = barGeometry(displayRow.task);
      if (geometry) layouts.set(displayRow.task.wbsId, { ...geometry, rowIndex });
    });
    return layouts;
  }, [displayRowsAfterStatus, min, pxPerDay]);
  const dependencyLinks = useMemo(
    () =>
      resolveDependencyLinks(
        visibleRows.map((row) => ({
          id: row.wbsId,
          taskName: row.taskName,
          dependency: row.dependency
        }))
      ),
    [visibleRows]
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
    event.preventDefault();
    event.stopPropagation();
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
      onRowDatesChange(row.wbsId, { startDate: nextStartDate, dueDate: nextDueDate });
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
                <span className="inline-flex h-8 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800">
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
          <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-8 rounded-lg border border-zinc-200 bg-white p-0.5">
                {(["week", "month"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onZoomChange(item)}
                    className={cn(
                      "rounded-md px-2.5 text-[11.5px] font-semibold capitalize transition-colors",
                      zoom === item ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-5 w-px bg-zinc-200" />
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
        <div className="overflow-auto px-4 py-3" style={{ height }}>
          <div className="mb-2 grid gap-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-400" style={{ gridTemplateColumns: `220px ${timelineWidth}px` }}>
            <span>Task</span>
            <div className="relative h-5">
              {ticks.map((tick) => (
                <span key={tick} className="absolute top-0 -translate-x-1/2" style={{ left: `${((tick - min) / DAY_MS) * pxPerDay}px` }}>
                  {formatShortDate(tick)}
                </span>
              ))}
              <span className="absolute -top-0.5 -translate-x-1/2 text-[#fd312e]" style={{ left: `${todayLeft}px` }}>
                Today ({formatShortDate(todayTime)})
              </span>
              {validMilestones.map((milestone) => {
                const left = Math.max(0, Math.min(timelineWidth, ((toTime(milestone.date)! - min) / DAY_MS) * pxPerDay));
                return (
                  <span
                    key={milestone.id}
                    className={cn("absolute -top-0.5 max-w-[132px] truncate rounded bg-white px-1 text-[10px] font-semibold text-violet-700", timelineLabelClass(left))}
                    style={{ left }}
                    title={`${milestone.label} (${formatShortDate(toTime(milestone.date)!)})`}
                  >
                    {milestone.label} ({formatShortDate(toTime(milestone.date)!)})
                  </span>
                );
              })}
            </div>
          </div>
          <div className="relative space-y-2">
            <div className="pointer-events-none absolute top-0 z-20" style={{ left: 232, width: timelineWidth, height: displayRowsAfterStatus.length * GANTT_ROW_HEIGHT }}>
              <GanttDependencyLayer
                links={dependencyLinks}
                layouts={rowLayouts}
                rowHeight={GANTT_ROW_HEIGHT}
                barCenterOffset={GANTT_BAR_CENTER_OFFSET}
                width={timelineWidth}
                height={displayRowsAfterStatus.length * GANTT_ROW_HEIGHT}
                muted={dragTooltip != null}
              />
            </div>
            {displayRowsAfterStatus.map((displayRow) => {
              if (displayRow.type === "group") {
                const collapsed = collapsedGroupKeys.has(displayRow.groupKey);
                return (
                  <div
                    key={`group-${displayRow.groupKey}`}
                    className="grid items-center gap-3 rounded-lg bg-zinc-50/80 text-[12px]"
                    style={{ gridTemplateColumns: `220px ${timelineWidth}px`, minHeight: GANTT_ROW_HEIGHT }}
                  >
                    <button type="button" onClick={() => onToggleGroup(displayRow.groupKey)} className="flex min-w-0 items-center gap-2 text-left">
                      {collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                      <span className="truncate font-semibold text-zinc-800">{displayRow.label}</span>
                      <span className="shrink-0 text-[11px] font-medium text-zinc-400">· {displayRow.taskCount} tasks</span>
                    </button>
                    <div className="h-px bg-zinc-200/80" />
                  </div>
                );
              }
              const row = displayRow.task;
              const geometry = barGeometry(row);
              const highlighted = hoveredId === row.wbsId || activeId === row.wbsId;
              return (
                <div
                  key={row.wbsId}
                  className={cn("grid items-center gap-3 rounded-lg text-[12px] transition-colors", highlighted && "bg-sky-50/70")}
                  style={{ gridTemplateColumns: `220px ${timelineWidth}px` }}
                  onMouseEnter={() => onHover(row.wbsId)}
                  onMouseLeave={() => onHover(null)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-800">{row.taskName}</p>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2">
                      <p className="shrink-0 font-mono text-[10.5px] text-zinc-400">{row.wbsId}</p>
                      <span className="min-w-0 truncate rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-500">
                        {row.owner && row.owner !== "-" ? row.owner : "담당자 미정"}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-8 rounded-lg bg-zinc-100">
                    <div
                      className="absolute bottom-0 top-0 z-10 w-px bg-[#fd312e]"
                      style={{ left: `${todayLeft}px` }}
                    />
                    {validMilestones.map((milestone) => {
                      const milestoneLeft = Math.max(0, Math.min(timelineWidth, ((toTime(milestone.date)! - min) / DAY_MS) * pxPerDay));
                      return (
                        <div
                          key={milestone.id}
                          className="absolute bottom-0 top-0 z-10 w-px bg-violet-500"
                          style={{ left: `${milestoneLeft}px` }}
                          title={`${milestone.label} (${milestone.date})`}
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
                        className={cn(
                          "absolute top-1/2 h-4 -translate-y-1/2 rounded-full border border-white/70 shadow-sm transition-[height,box-shadow]",
                          ganttBarClass(row.status),
                          highlighted && "h-5 shadow-md ring-2 ring-sky-200",
                          mode === "edit" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        )}
                        style={{ left: `${geometry.left}px`, width: `${geometry.width}px` }}
                      >
                        {mode === "edit" && (
                          <>
                            <span
                              className="absolute left-0 top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-white/80 bg-white/70 shadow-sm"
                              onPointerDown={(event) => startGanttDrag(event, row, "resize-left")}
                              title="Resize start date"
                            />
                            <span
                              className="absolute right-0 top-1/2 h-5 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border border-white/80 bg-white/70 shadow-sm"
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

function TaskDrawer({ row, onClose }: { row: WbsRow | null; onClose: () => void }) {
  if (!row) {
    return <aside className="flex min-h-0 flex-col rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">WBS row를 선택하면 상세 정보가 표시됩니다.</aside>;
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
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
            <span className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold", statusClass(row.status))}>{row.status || "-"}</span>
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
          <DetailItem label="Dependency" value={row.dependency} icon={GitBranch} />
          <DetailItem label="Last updated" value={row.lastUpdated} icon={Clock3} />
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
        "h-8 w-[140px] rounded-lg border bg-white px-2 text-[12px] font-medium text-zinc-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100",
        inputValue && !isValidDateValue(inputValue) ? "border-rose-300" : "border-zinc-200"
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
      <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[11px] font-semibold text-amber-800">
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
      className="group inline-flex max-w-[220px] items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-left text-[11px] text-sky-800 hover:border-sky-300 hover:bg-sky-100"
      title={`${dependencyRow.wbsId} · ${dependencyRow.taskName}`}
    >
      <span className="shrink-0 font-mono font-semibold">{dependencyRow.wbsId}</span>
      <span className="truncate text-sky-700 group-hover:text-sky-900">{dependencyRow.taskName}</span>
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
  return <td className={cn("whitespace-nowrap px-3 py-3 align-top text-zinc-700", className)}>{children}</td>;
}

function statusClass(status: string) {
  const bucket = statusBucket(status);
  if (bucket === "completed") return "border-zinc-300 bg-zinc-100 text-zinc-600";
  if (bucket === "progress") return "border-sky-200 bg-sky-50 text-sky-800";
  if (bucket === "delayed") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status.includes("보류") || status.includes("제외") || status.toLowerCase().includes("hold")) return "border-orange-200 bg-orange-50 text-orange-800";
  if (status.includes("예정") || status.toLowerCase().includes("planned")) return "border-violet-200 bg-violet-50 text-violet-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function ganttBarClass(status: string) {
  const bucket = statusBucket(status);
  if (bucket === "completed") return "bg-zinc-400";
  if (bucket === "progress") return "bg-sky-500";
  if (bucket === "delayed") return "bg-rose-500";
  if (status.includes("보류") || status.includes("제외") || status.toLowerCase().includes("hold")) return "bg-orange-400";
  if (status.includes("예정") || status.toLowerCase().includes("planned")) return "bg-violet-500";
  return "bg-zinc-900";
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
