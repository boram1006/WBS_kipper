"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  FileDown,
  GitBranch,
  Info,
  Search,
  Sparkles,
  Table2,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
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

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
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

function rowsFromCsv(csv: string): WbsRow[] {
  const parsed = parseCsv(csv);
  if (parsed.length < 2) return [];
  const headers = parsed[0].map((header) => header.trim());
  const rawRows = parsed.slice(1).map((values) => Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? ""])));
  return normalizeRawRows(rawRows);
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<"api" | "cache">("api");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [recentOnly, setRecentOnly] = useState(false);
  const [changeTypeFilter, setChangeTypeFilter] = useState<(typeof changeTypeOptions)[number]["value"]>("all");
  const [showCompletedInGantt, setShowCompletedInGantt] = useState(true);
  const [ganttHeight, setGanttHeight] = useState(320);
  const [milestones, setMilestones] = useState<WbsMilestone[]>([]);

  useEffect(() => {
    setMilestones(projectId ? loadWbsMilestones(projectId) : []);
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const cached = loadWbsSnapshot(projectId);
      if (cached?.rows_preview?.length) {
        setRows(normalizeRawRows(cached.rows_preview, cached.mapping));
        setActiveId(null);
        setDataSource("cache");
        setError(null);
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
        setActiveId(null);
        setDataSource("api");
        saveWbsSnapshot(projectId, snapshot);
      } catch (err) {
        if (!alive) return;
        if (cached?.rows_preview?.length) {
          const cachedRows = normalizeRawRows(cached.rows_preview, cached.mapping);
          setRows(cachedRows);
          setActiveId(null);
          setDataSource("cache");
          setError("서버에서 최신 WBS를 불러오지 못해 이 브라우저에 저장된 WBS를 표시합니다.");
        } else {
          setRows([]);
          setActiveId(null);
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

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !needle ||
        [row.wbsId, row.taskName, row.owner, row.description, row.notes].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesOwner = ownerFilter === "all" || row.owner === ownerFilter;
      const matchesRecent = !recentOnly || row.badges.includes("recent");
      const matchesChangeType = changeTypeFilter === "all" || row.badges.includes(changeTypeFilter as WbsBadge);
      return matchesQuery && matchesStatus && matchesOwner && matchesRecent && matchesChangeType;
    });
  }, [changeTypeFilter, ownerFilter, query, recentOnly, rows, statusFilter]);

  const activeRow = activeId ? rows.find((row) => row.wbsId === activeId) ?? null : null;
  const summary = useMemo(
    () => ({
      total: rows.length,
      progress: rows.filter((row) => statusBucket(row.status) === "progress").length,
      completed: rows.filter((row) => statusBucket(row.status) === "completed").length,
      delayed: rows.filter((row) => statusBucket(row.status) === "delayed").length,
      recent: rows.filter((row) => row.badges.includes("recent")).length
    }),
    [rows]
  );
  const activeSummaryFilter =
    statusFilter === "all" && !recentOnly
      ? "total"
      : recentOnly
        ? "recent"
        : statusOptions.find((status) => statusFilter === status && statusBucket(status) === "progress")
          ? "progress"
          : statusOptions.find((status) => statusFilter === status && statusBucket(status) === "completed")
            ? "completed"
            : statusOptions.find((status) => statusFilter === status && statusBucket(status) === "delayed")
              ? "delayed"
              : null;

  function applySummaryFilter(filter: "total" | "progress" | "completed" | "delayed" | "recent") {
    setRecentOnly(filter === "recent");
    if (filter === "total" || filter === "recent") {
      setStatusFilter("all");
      return;
    }
    const matchingStatus = statusOptions.find((status) => status !== "all" && statusBucket(status) === filter);
    setStatusFilter(matchingStatus ?? "all");
  }

  function downloadCsv() {
    if (!projectId) return;
    window.location.href = api.downloadWbsUrl(projectId);
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
            <div className={cn("grid gap-4", activeRow ? "grid-cols-[minmax(760px,1fr)_360px]" : "grid-cols-1")}>
              <div className="min-w-0 space-y-4">
                {error && (
                  <div className={cn("flex items-start gap-2 rounded-xl border px-4 py-3 text-[12px] leading-5", dataSource === "cache" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <section className="grid grid-cols-5 gap-3">
                  <SummaryCard icon={Table2} label="Total Tasks" value={summary.total} tone="neutral" active={activeSummaryFilter === "total"} onClick={() => applySummaryFilter("total")} />
                  <SummaryCard icon={Clock3} label="In Progress" value={summary.progress} tone="progress" active={activeSummaryFilter === "progress"} onClick={() => applySummaryFilter("progress")} />
                  <SummaryCard icon={CheckCircle2} label="Completed" value={summary.completed} tone="completed" active={activeSummaryFilter === "completed"} onClick={() => applySummaryFilter("completed")} />
                  <SummaryCard icon={AlertCircle} label="Delayed" value={summary.delayed} tone="delayed" active={activeSummaryFilter === "delayed"} onClick={() => applySummaryFilter("delayed")} />
                  <SummaryCard icon={Sparkles} label="Recently Updated" value={summary.recent} tone="recent" active={activeSummaryFilter === "recent"} onClick={() => applySummaryFilter("recent")} />
                </section>

                <GanttChart
                  rows={filteredRows}
                  milestones={milestones}
                  height={ganttHeight}
                  showCompleted={showCompletedInGantt}
                  onHeightChange={setGanttHeight}
                  onShowCompletedChange={setShowCompletedInGantt}
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
                    <label className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700">
                      <Switch checked={recentOnly} onCheckedChange={setRecentOnly} />
                      Recently updated
                    </label>
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
                        {filteredRows.map((row) => (
                          <tr
                            key={row.wbsId}
                            onClick={() => setActiveId(row.wbsId)}
                            className={cn("cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50", activeRow?.wbsId === row.wbsId && "bg-zinc-50")}
                          >
                            <Td className="font-mono font-semibold text-zinc-700">{row.wbsId}</Td>
                            <Td>
                              <div className="font-semibold text-zinc-950">{row.taskName}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {row.badges.map((badge) => (
                                  <StatusBadge key={badge} badge={badge} />
                                ))}
                              </div>
                            </Td>
                            <Td>{row.owner}</Td>
                            <Td>{row.startDate}</Td>
                            <Td className={row.badges.includes("schedule") ? "font-semibold text-violet-700" : undefined}>{row.dueDate}</Td>
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
                        ))}
                      </tbody>
                    </table>
                    {filteredRows.length === 0 && <div className="px-6 py-12 text-center text-sm text-zinc-500">조건에 맞는 WBS row가 없습니다.</div>}
                  </div>
                </section>
              </div>

              {activeRow && <TaskDrawer row={activeRow} onClose={() => setActiveId(null)} />}
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
  tone: "neutral" | "progress" | "completed" | "delayed" | "recent";
  active?: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-600",
    progress: "border-sky-200 bg-sky-50 text-sky-700",
    completed: "border-zinc-300 bg-zinc-100 text-zinc-600",
    delayed: "border-rose-200 bg-rose-50 text-rose-700",
    recent: "border-violet-200 bg-violet-50 text-violet-700"
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-zinc-300 hover:bg-zinc-50",
        active ? "border-zinc-300 bg-zinc-50 shadow-[inset_0_0_0_1px_rgba(113,113,122,0.18)]" : "border-zinc-200"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg border", toneClass)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[22px] font-semibold tracking-[-0.03em] text-zinc-950">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400">{label}</p>
    </button>
  );
}

function GanttChart({
  rows,
  milestones,
  height,
  showCompleted,
  onHeightChange,
  onShowCompletedChange
}: {
  rows: WbsRow[];
  milestones: WbsMilestone[];
  height: number;
  showCompleted: boolean;
  onHeightChange: (height: number) => void;
  onShowCompletedChange: (show: boolean) => void;
}) {
  const visibleRows = showCompleted ? rows : rows.filter((row) => statusBucket(row.status) !== "completed");
  const validMilestones = milestones.filter((milestone) => toTime(milestone.date) != null);
  const range = ganttTimelineRange(visibleRows, validMilestones);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const min = range ? Math.min(range.min, todayTime) : todayTime;
  const max = range ? Math.max(range.max, todayTime) : todayTime;
  const span = Math.max(max - min, 24 * 60 * 60 * 1000);
  const todayLeft = Math.max(0, Math.min(100, ((todayTime - min) / span) * 100));
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <Calendar className="h-3.5 w-3.5 text-zinc-500" />
            WBS 간트 차트
          </h2>
          <p className="mt-1 text-xs text-zinc-500">빨간 기준선은 오늘 날짜입니다.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end">
          <label className="flex h-7 items-center gap-1.5 text-[11.5px] font-medium text-zinc-700">
            <Switch checked={!showCompleted} onCheckedChange={(checked) => onShowCompletedChange(!checked)} className="h-4 w-8 border-zinc-300 [&>span]:h-3 [&>span]:w-3 [&>span]:translate-x-0.5 data-[state=checked]:[&>span]:translate-x-4" />
            <span>완료 숨김</span>
          </label>
        </div>
      </div>
      {!range ? (
        <div className="px-6 py-10 text-center text-sm text-zinc-500">시작일과 마감일이 있는 WBS를 저장하면 간트 차트가 표시됩니다.</div>
      ) : (
        <>
        <div className="overflow-auto px-4 py-3" style={{ height }}>
          <div className="mb-2 grid grid-cols-[220px_1fr] gap-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-400">
            <span>Task</span>
            <div className="relative flex justify-between">
              <span>{formatShortDate(min)}</span>
              <span className="absolute -top-0.5 -translate-x-1/2 text-[#fd312e]" style={{ left: `${todayLeft}%` }}>
                Today ({formatShortDate(todayTime)})
              </span>
              {validMilestones.map((milestone) => {
                const left = Math.max(0, Math.min(100, ((toTime(milestone.date)! - min) / span) * 100));
                return (
                  <span key={milestone.id} className="absolute -top-0.5 max-w-[96px] -translate-x-1/2 truncate rounded bg-white px-1 text-center text-[10px] font-semibold text-violet-700" style={{ left: `${left}%` }}>
                    {milestone.label}
                  </span>
                );
              })}
              <span>{formatShortDate(max)}</span>
            </div>
          </div>
          <div className="space-y-2">
            {visibleRows.map((row) => {
              const start = toTime(row.startDate) ?? min;
              const due = toTime(row.dueDate) ?? start;
              const left = Math.max(0, Math.min(100, ((start - min) / span) * 100));
              const width = Math.max(3, Math.min(100 - left, ((Math.max(due, start) - start) / span) * 100));
              return (
                <div key={row.wbsId} className="grid grid-cols-[220px_1fr] items-center gap-3 text-[12px]">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-semibold text-zinc-800">{row.taskName}</p>
                      <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold", statusClass(row.status))}>{row.status || "-"}</span>
                    </div>
                    <p className="font-mono text-[10.5px] text-zinc-400">{row.wbsId}</p>
                  </div>
                  <div className="relative h-8 rounded-lg bg-zinc-100">
                    <div
                      className="absolute bottom-0 top-0 z-10 w-px bg-[#fd312e]"
                      style={{ left: `${todayLeft}%` }}
                    />
                    {validMilestones.map((milestone) => {
                      const milestoneLeft = Math.max(0, Math.min(100, ((toTime(milestone.date)! - min) / span) * 100));
                      return (
                        <div
                          key={milestone.id}
                          className="absolute bottom-0 top-0 z-10 w-px bg-violet-500"
                          style={{ left: `${milestoneLeft}%` }}
                          title={`${milestone.label} (${milestone.date})`}
                        />
                      );
                    })}
                    <div
                      className={cn("absolute top-1/2 h-3 -translate-y-1/2 rounded-full", ganttBarClass(row.status))}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
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
