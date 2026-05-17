"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock3,
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
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
  sourceMeeting: string;
  badges: WbsBadge[];
  latestUpdate: string;
  before: string;
  after: string;
  evidence: string;
  relatedHistory: string[];
  dependentTasks: string[];
};

type WbsBadge = "recent" | "new" | "schedule" | "owner" | "status" | "confirm";

const MOCK_ROWS: WbsRow[] = [
  {
    wbsId: "1.1",
    taskName: "요구사항 정의",
    description: "서비스 범위와 핵심 사용자 요구사항을 정리합니다.",
    owner: "김민수",
    startDate: "2026-04-01",
    dueDate: "2026-04-15",
    status: "완료",
    dependency: "-",
    lastUpdated: "2026-05-10",
    sourceMeeting: "Kickoff Meeting",
    badges: [],
    latestUpdate: "초기 요구사항 정리 완료",
    before: "-",
    after: "완료",
    evidence: "요구사항 정의는 완료된 것으로 공유되었습니다.",
    relatedHistory: ["2026-05-10 상태 완료 처리"],
    dependentTasks: ["사용자 인터뷰", "요구사항 문서화"]
  },
  {
    wbsId: "1.3",
    taskName: "GUI 초안 생성",
    description: "핵심 화면의 GUI 초안과 디자인 시스템 기준을 작성합니다.",
    owner: "디자인팀",
    startDate: "2026-05-16",
    dueDate: "2026-05-27",
    status: "진행",
    dependency: "1.2",
    lastUpdated: "2026-05-17",
    sourceMeeting: "Weekly Project Sync",
    badges: ["recent", "schedule"],
    latestUpdate: "마감일이 2026-05-24에서 2026-05-27로 변경되었습니다.",
    before: "2026-05-24",
    after: "2026-05-27",
    evidence: "GUI 초안은 다음 주 수요일까지 연장하기로 함",
    relatedHistory: ["2026-05-17 schedule_change due_date 2026-05-24 → 2026-05-27"],
    dependentTasks: ["디자인 시스템 정리", "프론트엔드 화면 구현"]
  },
  {
    wbsId: "1.4",
    taskName: "개발 구현",
    description: "FastAPI와 Next.js 화면을 연결하고 주요 사용자 흐름을 구현합니다.",
    owner: "민수",
    startDate: "2026-05-20",
    dueDate: "2026-06-07",
    status: "진행",
    dependency: "1.3",
    lastUpdated: "2026-05-17",
    sourceMeeting: "Weekly Project Sync",
    badges: ["recent", "owner"],
    latestUpdate: "담당자가 개발팀에서 민수로 변경되었습니다.",
    before: "개발팀",
    after: "민수",
    evidence: "개발 구현은 민수님이 담당하기로 함",
    relatedHistory: ["2026-05-17 owner_change owner 개발팀 → 민수"],
    dependentTasks: ["QA 점검", "배포 환경 설정"]
  },
  {
    wbsId: "1.6",
    taskName: "법무 검토",
    description: "런칭 전 개인정보, 약관, 외부 API 사용 범위를 검토합니다.",
    owner: "미정",
    startDate: "미정",
    dueDate: "미정",
    status: "예정",
    dependency: "1.5",
    lastUpdated: "2026-05-17",
    sourceMeeting: "Weekly Project Sync",
    badges: ["recent", "new", "confirm"],
    latestUpdate: "신규 작업 후보로 추가되었고 세부 일정 확인이 필요합니다.",
    before: "-",
    after: "법무 검토 신규 row",
    evidence: "법무 검토가 런칭 전 필요하다는 의견이 있었음",
    relatedHistory: ["2026-05-17 new_task 법무 검토 생성"],
    dependentTasks: ["런칭 체크리스트"]
  },
  {
    wbsId: "2.1",
    taskName: "Jira 연동",
    description: "Jira 이슈와 WBS row를 동기화하는 기능입니다.",
    owner: "플랫폼팀",
    startDate: "2026-06-01",
    dueDate: "2026-06-21",
    status: "보류",
    dependency: "-",
    lastUpdated: "2026-05-17",
    sourceMeeting: "Weekly Project Sync",
    badges: ["recent", "status"],
    latestUpdate: "1차 MVP 범위에서 제외되어 보류 상태로 변경되었습니다.",
    before: "예정",
    after: "보류",
    evidence: "Jira 연동은 이번 1차 MVP 범위에서 제외하고 2차로 미룸",
    relatedHistory: ["2026-05-17 hold_or_drop status 예정 → 보류"],
    dependentTasks: ["Jira API 인증", "이슈 동기화"]
  }
];

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

function rowsFromCsv(csv: string): WbsRow[] {
  const parsed = parseCsv(csv);
  if (parsed.length < 2) return [];
  const headers = parsed[0].map((header) => header.trim());
  return parsed.slice(1).map((values, index) => {
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? ""]));
    const wbsId = firstValue(raw, ["wbs_id", "wbs id", "wbs코드", "id"], `${index + 1}`);
    const taskName = firstValue(raw, ["task_name", "task name", "작업명", "name"], `Task ${index + 1}`);
    return {
      wbsId,
      taskName,
      description: firstValue(raw, ["description", "설명"], "업로드된 WBS row입니다."),
      owner: firstValue(raw, ["owner", "담당자"], "미정"),
      startDate: firstValue(raw, ["start_date", "start date", "시작일"], "-"),
      dueDate: firstValue(raw, ["due_date", "due date", "마감", "마감일"], "-"),
      status: firstValue(raw, ["status", "상태"], "예정"),
      dependency: firstValue(raw, ["dependency", "depends on", "의존성"], "-"),
      lastUpdated: firstValue(raw, ["updated_at", "last updated"], "-"),
      sourceMeeting: firstValue(raw, ["source meeting", "meeting"], "-"),
      badges: [],
      latestUpdate: "업로드된 최신 WBS 데이터입니다.",
      before: "-",
      after: "-",
      evidence: firstValue(raw, ["notes", "비고"], "업로드된 WBS 원본 row에서 가져왔습니다."),
      relatedHistory: [],
      dependentTasks: []
    };
  });
}

export default function CurrentWbsPage() {
  const projectId = useProjectIdFromQuery();
  const router = useRouter();
  const [rows, setRows] = useState<WbsRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [recentOnly, setRecentOnly] = useState(false);
  const [changeTypeFilter, setChangeTypeFilter] = useState<(typeof changeTypeOptions)[number]["value"]>("all");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!projectId) throw new Error("프로젝트 ID가 없습니다.");
        const csv = await api.downloadWbsCsvText(projectId);
        const parsed = rowsFromCsv(csv);
        if (!alive) return;
        if (parsed.length === 0) {
          setRows([]);
        } else {
          setRows(parsed);
          setActiveId(parsed[0]?.wbsId ?? null);
        }
        setUsingMock(false);
      } catch (err) {
        if (!alive) return;
        setRows(MOCK_ROWS);
        setActiveId(MOCK_ROWS[1]?.wbsId ?? MOCK_ROWS[0]?.wbsId ?? null);
        setUsingMock(true);
        setError(err instanceof Error ? err.message : "최신 WBS를 불러오지 못해 샘플 데이터를 표시합니다.");
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

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !needle ||
        [row.wbsId, row.taskName, row.owner, row.description, row.sourceMeeting].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesOwner = ownerFilter === "all" || row.owner === ownerFilter;
      const matchesRecent = !recentOnly || row.badges.includes("recent");
      const matchesChangeType = changeTypeFilter === "all" || row.badges.includes(changeTypeFilter as WbsBadge);
      return matchesQuery && matchesStatus && matchesOwner && matchesRecent && matchesChangeType;
    });
  }, [changeTypeFilter, ownerFilter, query, recentOnly, rows, statusFilter]);

  const activeRow = rows.find((row) => row.wbsId === activeId) ?? filteredRows[0] ?? null;
  const summary = useMemo(
    () => ({
      total: rows.length,
      progress: rows.filter((row) => row.status === "진행").length,
      completed: rows.filter((row) => row.status === "완료").length,
      delayed: rows.filter((row) => row.status === "지연").length,
      recent: rows.filter((row) => row.badges.includes("recent")).length
    }),
    [rows]
  );

  function downloadCsv() {
    if (!projectId) return;
    window.location.href = api.downloadWbsUrl(projectId);
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
                <span className="text-zinc-700">Current WBS</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-[-0.024em] text-zinc-950">
                Current WBS
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-zinc-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
                  Latest approved project plan
                </span>
              </h1>
              <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.01em] text-zinc-500">
                View the latest WBS after approved meeting-based updates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={downloadCsv} disabled={!projectId}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download CSV
              </Button>
              <Button className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800" onClick={() => router.push(routes.upload(projectId || "0"))}>
                <GitBranch className="mr-1.5 h-3.5 w-3.5" />
                Import New WBS
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-8 py-5">
          {loading ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState onImport={() => router.push(routes.upload(projectId || "0"))} />
          ) : (
            <div className="grid grid-cols-[minmax(760px,1fr)_360px] gap-4">
              <div className="min-w-0 space-y-4">
                {error && usingMock && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>API 연결 실패로 샘플 WBS 데이터를 표시하고 있습니다. 배포된 백엔드가 준비되면 최신 CSV가 표시됩니다.</span>
                  </div>
                )}

                <section className="grid grid-cols-5 gap-3">
                  <SummaryCard icon={Table2} label="Total Tasks" value={summary.total} />
                  <SummaryCard icon={Clock3} label="In Progress" value={summary.progress} />
                  <SummaryCard icon={CheckCircle2} label="Completed" value={summary.completed} />
                  <SummaryCard icon={AlertCircle} label="Delayed" value={summary.delayed} />
                  <SummaryCard icon={Sparkles} label="Recently Updated" value={summary.recent} accent />
                </section>

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
                          <Th>Source meeting</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => (
                          <tr
                            key={row.wbsId}
                            onClick={() => setActiveId(row.wbsId)}
                            className={cn(
                              "cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50",
                              activeRow?.wbsId === row.wbsId && "bg-zinc-50"
                            )}
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
                            <Td>{row.dependency}</Td>
                            <Td>{row.lastUpdated}</Td>
                            <Td className="max-w-[150px] truncate text-zinc-500">{row.sourceMeeting}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredRows.length === 0 && (
                      <div className="px-6 py-12 text-center text-sm text-zinc-500">조건에 맞는 WBS row가 없습니다.</div>
                    )}
                  </div>
                </section>
              </div>

              <TaskDrawer row={activeRow} onClose={() => setActiveId(null)} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg border", accent ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-50 text-zinc-600")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[22px] font-semibold tracking-[-0.03em] text-zinc-950">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-400">{label}</p>
    </div>
  );
}

function TaskDrawer({ row, onClose }: { row: WbsRow | null; onClose: () => void }) {
  if (!row) {
    return (
      <aside className="flex min-h-0 flex-col rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
        WBS row를 선택하면 상세 정보가 표시됩니다.
      </aside>
    );
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
          <div className="mb-2 flex flex-wrap gap-1">
            {row.badges.map((badge) => (
              <StatusBadge key={badge} badge={badge} />
            ))}
          </div>
          <h3 className="text-lg font-semibold leading-6 tracking-tight text-zinc-950">{row.taskName}</h3>
          <p className="mt-1 text-[12.5px] leading-5 text-zinc-500">{row.description}</p>
        </section>

        <section className="grid grid-cols-2 gap-2 text-[12px]">
          <DetailItem label="Owner" value={row.owner} icon={UserRound} />
          <DetailItem label="Status" value={row.status} icon={CheckCircle2} />
          <DetailItem label="Start date" value={row.startDate} icon={Calendar} />
          <DetailItem label="Due date" value={row.dueDate} icon={Calendar} />
          <DetailItem label="Dependency" value={row.dependency} icon={GitBranch} />
          <DetailItem label="Source meeting" value={row.sourceMeeting} icon={History} />
        </section>

        <DrawerSection title="Latest update">
          <p className="text-[12.5px] leading-5 text-zinc-700">{row.latestUpdate}</p>
        </DrawerSection>

        <DrawerSection title="Before / After">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[12.5px]">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-500 line-through decoration-zinc-300">{row.before}</div>
            <ArrowRight className="h-4 w-4 text-zinc-400" />
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">{row.after}</div>
          </div>
        </DrawerSection>

        <DrawerSection title="Evidence from meeting note">
          <blockquote className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12.5px] leading-5 text-zinc-700">
            “{row.evidence}”
          </blockquote>
        </DrawerSection>

        <DrawerSection title="Related change history">
          <div className="space-y-2">
            {(row.relatedHistory.length ? row.relatedHistory : ["변경 이력이 아직 없습니다."]).map((item) => (
              <div key={item} className="rounded-lg border border-zinc-200 px-3 py-2 text-[12px] text-zinc-600">
                {item}
              </div>
            ))}
          </div>
        </DrawerSection>

        <DrawerSection title="Dependent tasks">
          <div className="flex flex-wrap gap-1.5">
            {(row.dependentTasks.length ? row.dependentTasks : ["연결된 후속 작업 없음"]).map((task) => (
              <span key={task} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11.5px] font-medium text-zinc-600">
                {task}
              </span>
            ))}
          </div>
        </DrawerSection>
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

function statusClass(status: string) {
  if (status === "완료") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "진행") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "보류" || status === "제외") return "border-orange-200 bg-orange-50 text-orange-800";
  if (status === "지연") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
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
        <p className="mt-2 text-sm leading-6 text-zinc-500">Import a WBS file to start tracking project updates.</p>
        <Button className="mt-5 rounded-lg bg-zinc-950 text-xs font-semibold text-white hover:bg-zinc-800" onClick={onImport}>
          Import WBS
        </Button>
      </div>
    </div>
  );
}
