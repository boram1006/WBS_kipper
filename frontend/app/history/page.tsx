"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clipboard,
  Copy,
  Download,
  FileDown,
  GitBranch,
  History,
  Info,
  Search,
  Sparkles,
  Table2,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
import type { ChangeHistoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type HistoryRow = {
  id: string;
  changedAt: string;
  changeType: string;
  wbsId: string;
  taskName: string;
  field: string;
  before: string;
  after: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
  requiresConfirmation: boolean;
  sourceMeeting: string;
  meetingDate: string;
  appliedBy: string;
  reason: string;
};

const MOCK_HISTORY: HistoryRow[] = [
  {
    id: "hist-1",
    changedAt: "2026-05-17 14:30",
    changeType: "schedule_change",
    wbsId: "1.3",
    taskName: "GUI 초안 생성",
    field: "due_date",
    before: "2026-05-24",
    after: "2026-05-27",
    evidence: "GUI 초안은 다음 주 수요일까지 연장하기로 함",
    confidence: "high",
    requiresConfirmation: false,
    sourceMeeting: "Weekly Project Sync",
    meetingDate: "2026-05-17",
    appliedBy: "local_user",
    reason: "Existing WBS task matched and the new due date was clearly mentioned."
  },
  {
    id: "hist-2",
    changedAt: "2026-05-17 14:32",
    changeType: "owner_change",
    wbsId: "1.4",
    taskName: "개발 구현",
    field: "owner",
    before: "개발팀",
    after: "민수",
    evidence: "개발 구현은 민수님이 담당하기로 함",
    confidence: "high",
    requiresConfirmation: false,
    sourceMeeting: "Weekly Project Sync",
    meetingDate: "2026-05-17",
    appliedBy: "local_user",
    reason: "The assignee was explicitly stated in the meeting note."
  },
  {
    id: "hist-3",
    changedAt: "2026-05-17 14:35",
    changeType: "new_task",
    wbsId: "1.6",
    taskName: "법무 검토",
    field: "task",
    before: "-",
    after: "신규 작업 추가",
    evidence: "법무 검토가 런칭 전 필요하다는 의견이 있었음",
    confidence: "medium",
    requiresConfirmation: true,
    sourceMeeting: "Weekly Project Sync",
    meetingDate: "2026-05-17",
    appliedBy: "local_user",
    reason: "New task detected, but owner and due date are missing."
  },
  {
    id: "hist-4",
    changedAt: "2026-05-17 14:38",
    changeType: "status_change",
    wbsId: "2.1",
    taskName: "Jira 연동",
    field: "status",
    before: "예정",
    after: "보류",
    evidence: "Jira 연동은 이번 1차 MVP 범위에서 제외하고 2차로 미룸",
    confidence: "high",
    requiresConfirmation: false,
    sourceMeeting: "Weekly Project Sync",
    meetingDate: "2026-05-17",
    appliedBy: "local_user",
    reason: "The note clearly states this item is excluded from the first MVP and moved to phase 2."
  }
];

const changeTypes = [
  "all",
  "new_task",
  "schedule_change",
  "owner_change",
  "status_change",
  "dependency_change",
  "hold_or_drop",
  "risk"
];

const confidenceOptions = ["all", "high", "medium", "low"];

function normalizeHistory(item: ChangeHistoryItem): HistoryRow {
  return {
    id: String(item.id),
    changedAt: item.changed_at,
    changeType: item.change_type,
    wbsId: item.wbs_id,
    taskName: item.task_name,
    field: item.field,
    before: item.old_value || "-",
    after: item.new_value || "-",
    evidence: item.evidence,
    confidence: item.confidence === "medium" || item.confidence === "low" ? item.confidence : "high",
    requiresConfirmation: false,
    sourceMeeting: "Applied meeting",
    meetingDate: item.changed_at?.slice(0, 10) || "-",
    appliedBy: item.applied_by,
    reason: "Approved change stored in change_history."
  };
}

export default function HistoryPage() {
  const projectId = useProjectIdFromQuery();
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [changeType, setChangeType] = useState("all");
  const [confidence, setConfidence] = useState("all");
  const [sourceMeeting, setSourceMeeting] = useState("all");
  const [appliedBy, setAppliedBy] = useState("all");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getHistory(projectId);
        const normalized = response.history.map(normalizeHistory);
        if (!alive) return;
        if (normalized.length === 0) {
          setRows(MOCK_HISTORY);
          setActiveId(MOCK_HISTORY[0]?.id ?? null);
          setUsingMock(true);
        } else {
          setRows(normalized);
          setActiveId(normalized[0]?.id ?? null);
          setUsingMock(false);
        }
      } catch (err) {
        if (!alive) return;
        setRows(MOCK_HISTORY);
        setActiveId(MOCK_HISTORY[0]?.id ?? null);
        setUsingMock(true);
        setError(err instanceof Error ? err.message : "변경 이력을 불러오지 못해 샘플 이력을 표시합니다.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const meetings = useMemo(() => ["all", ...Array.from(new Set(rows.map((row) => row.sourceMeeting)))], [rows]);
  const appliers = useMemo(() => ["all", ...Array.from(new Set(rows.map((row) => row.appliedBy)))], [rows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !needle ||
        [row.taskName, row.wbsId, row.evidence, row.field, row.before, row.after].some((value) => value.toLowerCase().includes(needle));
      const matchesDate = dateRange === "all" || row.changedAt.startsWith(dateRange);
      const matchesType = changeType === "all" || row.changeType === changeType;
      const matchesConfidence = confidence === "all" || row.confidence === confidence;
      const matchesMeeting = sourceMeeting === "all" || row.sourceMeeting === sourceMeeting;
      const matchesApplier = appliedBy === "all" || row.appliedBy === appliedBy;
      return matchesQuery && matchesDate && matchesType && matchesConfidence && matchesMeeting && matchesApplier;
    });
  }, [appliedBy, changeType, confidence, dateRange, query, rows, sourceMeeting]);

  const activeRow = rows.find((row) => row.id === activeId) ?? filteredRows[0] ?? null;
  const summary = useMemo(
    () => ({
      total: rows.length,
      schedule: rows.filter((row) => row.changeType === "schedule_change").length,
      newTask: rows.filter((row) => row.changeType === "new_task").length,
      owner: rows.filter((row) => row.changeType === "owner_change").length,
      confirm: rows.filter((row) => row.requiresConfirmation).length
    }),
    [rows]
  );

  function exportHistory() {
    const csv = [
      ["changed_at", "change_type", "wbs_id", "task_name", "field", "before", "after", "confidence", "source_meeting", "applied_by", "evidence"],
      ...filteredRows.map((row) => [
        row.changedAt,
        row.changeType,
        row.wbsId,
        row.taskName,
        row.field,
        row.before,
        row.after,
        row.confidence,
        row.sourceMeeting,
        row.appliedBy,
        row.evidence
      ])
    ]
      .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "change-history.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[#fafaf9] font-sans text-zinc-950">
      <AppSidebar projectId={projectId} pendingCount={8} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 bg-white px-8 pb-6 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <nav className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                <span>WBS Keeper</span>
                <span>/</span>
                <span className="text-zinc-700">Change History</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-[-0.024em] text-zinc-950">
                Change History
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-zinc-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
                  Audit trail
                </span>
              </h1>
              <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.01em] text-zinc-500">
                Track approved WBS changes with meeting evidence and before/after values.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={exportHistory}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export History
              </Button>
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={() => (window.location.href = api.downloadWbsUrl(projectId))}>
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Download Current WBS
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-8 py-5">
          {loading ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState onReview={() => router.push(routes.review(projectId))} onImport={() => router.push(routes.upload(projectId))} />
          ) : (
            <div className="grid grid-cols-[minmax(820px,1fr)_360px] gap-4">
              <div className="min-w-0 space-y-4">
                {error && usingMock && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>API 연결 실패 또는 빈 이력으로 샘플 변경 이력을 표시하고 있습니다.</span>
                  </div>
                )}

                <section className="grid grid-cols-5 gap-3">
                  <SummaryCard icon={History} label="Total Changes" value={summary.total} />
                  <SummaryCard icon={Calendar} label="Schedule Changes" value={summary.schedule} />
                  <SummaryCard icon={Sparkles} label="New Tasks" value={summary.newTask} />
                  <SummaryCard icon={UserRound} label="Owner Changes" value={summary.owner} />
                  <SummaryCard icon={AlertCircle} label="Needs Confirmation" value={summary.confirm} accent />
                </section>

                <section className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
                    <div className="relative min-w-[240px] flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-9 rounded-lg border-zinc-200 pl-9 text-[12.5px]"
                        placeholder="Search task, WBS ID, evidence..."
                      />
                    </div>
                    <FilterSelect value={dateRange} onChange={setDateRange} options={["all", "2026-05-17"]} allLabel="All dates" />
                    <FilterSelect value={changeType} onChange={setChangeType} options={changeTypes} labels={changeTypeLabels} allLabel="All change types" />
                    <FilterSelect value={confidence} onChange={setConfidence} options={confidenceOptions} allLabel="All confidence" />
                    <FilterSelect value={sourceMeeting} onChange={setSourceMeeting} options={meetings} allLabel="All meetings" />
                    <FilterSelect value={appliedBy} onChange={setAppliedBy} options={appliers} allLabel="All users" />
                  </div>

                  <div className="overflow-hidden">
                    <table className="w-full border-collapse text-left text-[12.5px]">
                      <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-500">
                        <tr className="border-b border-zinc-200">
                          <Th>Changed at</Th>
                          <Th>Change type</Th>
                          <Th>WBS ID</Th>
                          <Th>Task name</Th>
                          <Th>Field</Th>
                          <Th>Before</Th>
                          <Th>After</Th>
                          <Th>Confidence</Th>
                          <Th>Source meeting</Th>
                          <Th>Applied by</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => setActiveId(row.id)}
                            className={cn("cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50", activeRow?.id === row.id && "bg-zinc-50")}
                          >
                            <Td className="font-mono text-[11.5px]">{row.changedAt}</Td>
                            <Td>
                              <ChangeTypeBadge type={row.changeType} />
                              {row.requiresConfirmation && <span className="ml-1 inline-flex rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-800">Needs confirmation</span>}
                            </Td>
                            <Td className="font-mono font-semibold">{row.wbsId}</Td>
                            <Td className="font-semibold text-zinc-950">{row.taskName}</Td>
                            <Td>{row.field}</Td>
                            <Td className="max-w-[120px] truncate text-zinc-500 line-through decoration-zinc-300">{row.before}</Td>
                            <Td className="max-w-[140px] truncate font-semibold text-zinc-950">{row.after}</Td>
                            <Td><ConfidenceBadge confidence={row.confidence} /></Td>
                            <Td>
                              <button type="button" onClick={(event) => event.stopPropagation()} className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50">
                                {row.sourceMeeting}
                              </button>
                            </Td>
                            <Td>{row.appliedBy}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredRows.length === 0 && <div className="px-6 py-12 text-center text-sm text-zinc-500">조건에 맞는 변경 이력이 없습니다.</div>}
                  </div>
                </section>
              </div>

              <HistoryDrawer row={activeRow} projectId={projectId} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const changeTypeLabels: Record<string, string> = {
  all: "All",
  new_task: "New Task",
  schedule_change: "Schedule Change",
  owner_change: "Owner Change",
  status_change: "Status Change",
  dependency_change: "Dependency Change",
  hold_or_drop: "Hold / Drop",
  risk: "Risk"
};

function SummaryCard({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg border", accent ? "border-rose-200 bg-rose-50 text-rose-700" : "border-zinc-200 bg-zinc-50 text-zinc-600")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[22px] font-semibold tracking-[-0.03em] text-zinc-950">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400">{label}</p>
    </div>
  );
}

function HistoryDrawer({ row, projectId }: { row: HistoryRow | null; projectId: string }) {
  const router = useRouter();
  if (!row) {
    return <aside className="flex min-h-0 flex-col rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">변경 이력을 선택하면 상세 정보가 표시됩니다.</aside>;
  }
  const current = row;

  function copyEvidence() {
    void navigator.clipboard?.writeText(current.evidence);
  }

  function exportOne() {
    const payload = JSON.stringify(current, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `change-${current.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold leading-5 text-zinc-950">Change Detail</h2>
          <p className="font-mono text-[11px] font-medium uppercase text-zinc-400">CHANGE {row.id}</p>
        </div>
        <ChangeTypeBadge type={row.changeType} />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-4">
        <section>
          <h3 className="text-lg font-semibold leading-6 tracking-tight text-zinc-950">{row.taskName}</h3>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">WBS {row.wbsId} · {row.field}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ConfidenceBadge confidence={row.confidence} />
            {row.requiresConfirmation && <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-800">Requires confirmation</span>}
            <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-600">{row.sourceMeeting}</span>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 text-[12px]">
          <DetailItem label="Changed at" value={row.changedAt} icon={Calendar} />
          <DetailItem label="Applied by" value={row.appliedBy} icon={UserRound} />
          <DetailItem label="Meeting date" value={row.meetingDate} icon={History} />
          <DetailItem label="Related WBS row" value={row.wbsId} icon={Table2} />
        </section>

        <DrawerSection title="Before / After">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[12.5px]">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-500 line-through decoration-zinc-300">{row.before}</div>
            <ArrowRight className="h-4 w-4 text-zinc-400" />
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">{row.after}</div>
          </div>
        </DrawerSection>

        <DrawerSection title="Evidence from meeting note">
          <blockquote className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12.5px] leading-5 text-zinc-700">“{row.evidence}”</blockquote>
        </DrawerSection>

        <DrawerSection title="AI reasoning">
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12.5px] leading-5 text-zinc-700">{row.reason}</p>
        </DrawerSection>

        <div className="grid gap-2">
          <Button className="h-9 rounded-lg bg-zinc-950 text-xs font-semibold text-white hover:bg-zinc-800" onClick={() => router.push(routes.wbs(projectId))}>
            <Table2 className="mr-1.5 h-3.5 w-3.5" />
            View in Current WBS
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-9 rounded-lg text-xs" onClick={copyEvidence}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy Evidence
            </Button>
            <Button variant="outline" className="h-9 rounded-lg text-xs" onClick={exportOne}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export This Change
            </Button>
          </div>
        </div>
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

function ChangeTypeBadge({ type }: { type: string }) {
  return <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10.5px] font-semibold", typeClass(type))}>{changeTypeLabels[type] ?? type}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  return <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10.5px] font-semibold capitalize", confidenceClass(confidence))}>{confidence}</span>;
}

function typeClass(type: string) {
  if (type === "new_task") return "border-sky-200 bg-sky-50 text-sky-800";
  if (type === "schedule_change") return "border-violet-200 bg-violet-50 text-violet-800";
  if (type === "owner_change") return "border-amber-200 bg-amber-50 text-amber-800";
  if (type === "status_change" || type === "hold_or_drop") return "border-orange-200 bg-orange-50 text-orange-800";
  if (type === "risk") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function confidenceClass(confidence: string) {
  if (confidence === "high") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
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
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[12.5px] font-medium text-zinc-700 outline-none focus:border-zinc-400"
    >
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

function EmptyState({ onReview, onImport }: { onReview: () => void; onImport: () => void }) {
  return (
    <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-500">
          <Clipboard className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-950">No change history yet</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">Approved WBS updates will appear here with meeting evidence.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button className="rounded-lg bg-zinc-950 text-xs font-semibold text-white hover:bg-zinc-800" onClick={onReview}>
            Go to Update Review
          </Button>
          <Button variant="outline" className="rounded-lg text-xs" onClick={onImport}>
            Import WBS
          </Button>
        </div>
      </div>
    </div>
  );
}
