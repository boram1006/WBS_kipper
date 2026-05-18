"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  ClipboardList,
  FileText,
  History,
  Link2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Wand2
} from "lucide-react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { ProjectSelector } from "@/components/project-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { changeTypeLabel, confidenceLabel, saveMeetingContext } from "@/components/review/review-utils";
import { api } from "@/lib/api";
import type { WbsChangeCandidate } from "@/lib/types";
import { useActiveProjectId } from "@/lib/use-project-id";
import { cn } from "@/lib/utils";

const SAMPLE_NOTE = `주요 논의 사항
1. 과제 방향 정리
PRD, UX 시나리오, GUI 초안을 공통 컴포넌트 기반으로 연결하는 워크플로우 개선 방향을 논의함.
9월 임원 AX 평가 시점을 고려하여 8월까지 MVP 구현 가능한 범위를 검토할 필요가 있음.

2. MVP 착수를 위해 필요한 것
PoC 시나리오 선정이 필요하며, LG Gallery+ 외의 시나리오 추가 여부를 확인하기로 함.
입출력 데이터는 5월까지 준비하고 입력 데이터 페이지에 업데이트하기로 함.
PRD 업데이트 및 공유, 전체 일정표 작성, 각 담당 세부 일정 검토 요청은 최보람이 5월 15일까지 진행하기로 함.
9월 임원 AX 평가 기준은 최보람이 확인하기로 함.
기본 컴포넌트 추출 및 에이전트 구성 방식은 AX기술팀이 검토하기로 함.`;

const schema = z.object({
  meeting_date: z.string().min(1, "회의 날짜를 입력해 주세요."),
  meeting_title: z.string().min(1, "회의 제목을 입력해 주세요."),
  attendees: z.string().optional(),
  meeting_note: z.string().min(10, "회의록을 10자 이상 입력해 주세요.")
});

type FormValues = z.infer<typeof schema>;

const detectionItems = [
  { key: "new_tasks", label: "신규 작업", description: "추가해야 할 WBS 항목", icon: Sparkles, tone: "emerald" },
  { key: "schedule_changes", label: "일정 변경", description: "시작일과 마감일 변경", icon: Calendar, tone: "violet" },
  { key: "owner_changes", label: "담당 변경", description: "작업 담당자 변경", icon: UserRound, tone: "sky" },
  { key: "status_changes", label: "상태 변경", description: "예정, 진행중, 완료, 지연", icon: ClipboardList, tone: "orange" },
  { key: "dependency_changes", label: "의존성 변경", description: "선행 작업과 연결 관계", icon: Link2, tone: "slate" },
  { key: "risks", label: "리스크", description: "검토가 필요한 이슈", icon: AlertCircle, tone: "rose" },
  { key: "clarification_needed", label: "추가 확인 필요", description: "결정 전 확인할 항목", icon: FileText, tone: "zinc" }
] as const;

type DetectionKey = (typeof detectionItems)[number]["key"];

const toneClass: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  violet: "border-violet-200 bg-violet-50 text-violet-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
  slate: "border-slate-200 bg-slate-50 text-slate-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  zinc: "border-zinc-200 bg-zinc-50 text-zinc-800"
};

export default function MeetingNotePage() {
  const [projectId, setProjectId] = useActiveProjectId();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [autoMatch, setAutoMatch] = useState(true);
  const [reviewCandidates, setReviewCandidates] = useState<WbsChangeCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analysisDone, setAnalysisDone] = useState(false);
  const [enabledDetection, setEnabledDetection] = useState<Record<DetectionKey, boolean>>(() =>
    Object.fromEntries(detectionItems.map((item) => [item.key, true])) as Record<DetectionKey, boolean>
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      meeting_date: new Date().toISOString().slice(0, 10),
      meeting_title: "",
      attendees: "",
      meeting_note: ""
    }
  });

  const note = form.watch("meeting_note");
  const meetingDate = form.watch("meeting_date");
  const meetingTitle = form.watch("meeting_title");
  const attendees = form.watch("attendees");

  const noteStats = useMemo(() => {
    const trimmed = note.trim();
    return {
      chars: trimmed.length,
      lines: trimmed ? trimmed.split(/\r?\n/).length : 0,
      minutes: Math.max(1, Math.round(trimmed.length / 500))
    };
  }, [note]);

  const pendingCandidates = useMemo(
    () => reviewCandidates.filter((candidate) => candidate.status === "pending"),
    [reviewCandidates]
  );
  const selectedCandidates = pendingCandidates.filter((candidate) => selected.has(candidate.id));

  const readiness = [
    { label: "프로젝트 선택", ready: Boolean(projectId), detail: projectId ? `Project #${projectId}` : "-" },
    { label: "회의 날짜 선택", ready: Boolean(meetingDate), detail: meetingDate || "-" },
    { label: "회의 제목 입력", ready: Boolean(meetingTitle.trim()), detail: meetingTitle.trim() || "-" },
    { label: "회의록 입력", ready: noteStats.chars >= 10, detail: `${noteStats.chars}자` }
  ];
  const readyCount = readiness.filter((item) => item.ready).length;
  const canAnalyze = Boolean(projectId && meetingDate && meetingTitle.trim() && noteStats.chars >= 10);

  function loadSample() {
    form.setValue("meeting_note", SAMPLE_NOTE, { shouldDirty: true, shouldValidate: true });
    form.setValue("meeting_title", "MVP 착수 범위 검토 회의", { shouldDirty: true, shouldValidate: true });
    form.setValue("meeting_date", "2026-05-17", { shouldDirty: true, shouldValidate: true });
  }

  function clearNote() {
    form.setValue("meeting_note", "", { shouldDirty: true, shouldValidate: true });
    setReviewCandidates([]);
    setSelected(new Set());
    setAnalysisDone(false);
    setMessage(null);
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!projectId) throw new Error("프로젝트 ID가 없습니다. WBS 설정을 먼저 저장해 주세요.");
      saveMeetingContext(projectId, {
        meeting_date: values.meeting_date,
        meeting_title: values.meeting_title,
        meeting_note: values.meeting_note
      });
      const analysis = await api.analyzeMeeting(projectId, {
        meeting_date: values.meeting_date,
        meeting_title: values.meeting_title,
        meeting_note: values.meeting_note
      });
      const pending = await api.getPendingChanges(projectId);
      const changes = pending.changes.length ? pending.changes : analysis.changes;
      setReviewCandidates(changes);
      setSelected(new Set(changes.filter((candidate) => candidate.confidence !== "low").map((candidate) => candidate.id)));
      setAnalysisDone(true);
      setMessage(`${changes.length}건의 WBS 업데이트 후보를 찾았습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회의록 분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function applySelected() {
    if (!projectId || selected.size === 0) return;
    setApplying(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.applyChanges(projectId, Array.from(selected));
      const pending = await api.getPendingChanges(projectId);
      setReviewCandidates(pending.changes);
      setSelected(new Set());
      setMessage(`${result.applied_count}건의 업데이트가 현재 WBS에 반영되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "선택한 업데이트를 WBS에 반영하지 못했습니다.");
    } finally {
      setApplying(false);
    }
  }

  function toggleCandidate(candidateId: string, checked?: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      const shouldSelect = checked ?? !next.has(candidateId);
      if (shouldSelect) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[#fafaf9] font-sans text-zinc-950">
      <AppSidebar projectId={projectId} pendingCount={pendingCandidates.length} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 bg-white px-8 pb-5 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <nav className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                <span>WBS Keeper</span>
                <span>/</span>
                <span className="text-zinc-700">회의록 입력</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-[-0.024em] text-zinc-950">
                회의록 입력
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium tracking-[-0.01em] text-zinc-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
                  업데이트 검토 포함
                </span>
              </h1>
              <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.01em] text-zinc-500">
                회의 정보와 분석 설정을 먼저 확인한 뒤 회의록을 분석하고, WBS 업데이트 후보를 같은 화면에서 검토합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProjectSelector projectId={projectId} onChange={setProjectId} allowCreate={false} />
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm" type="button">
                <History className="mr-1.5 h-3.5 w-3.5" />
                이전 회의 불러오기
              </Button>
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm" type="button">
                <Save className="mr-1.5 h-3.5 w-3.5" />
                임시 저장
              </Button>
              <Button
                className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
                disabled={!canAnalyze || loading}
                onClick={form.handleSubmit(onSubmit)}
                type="button"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {loading ? "분석 중..." : "회의록 분석"}
              </Button>
            </div>
          </div>
        </header>

        <form onSubmit={form.handleSubmit(onSubmit)} className="min-h-0 flex-1 overflow-auto px-8 py-5 pb-24">
          <div className="grid grid-cols-[minmax(720px,1fr)_320px] gap-4">
            <div className="space-y-4">
              <Panel
                step="1"
                title="회의 정보"
                description="분석 결과와 변경 이력에 연결할 회의 기본 정보를 입력하세요."
              >
                <div className="grid gap-3 p-4 pb-0 md:grid-cols-[1fr_180px]">
                  <Field label="회의 제목" required error={form.formState.errors.meeting_title?.message}>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" {...form.register("meeting_title")} />
                  </Field>
                  <Field label="회의 날짜" required error={form.formState.errors.meeting_date?.message}>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" type="date" {...form.register("meeting_date")} />
                  </Field>
                </div>
                <div className="grid gap-3 p-4 pt-3 md:grid-cols-1">
                  <Field label="참석자">
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" {...form.register("attendees")} />
                  </Field>
                </div>
                {attendees && (
                  <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-3">
                    {attendees.split(",").filter(Boolean).map((name) => (
                      <span key={name.trim()} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700">
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-zinc-950 text-[8px] text-white">{name.trim().slice(0, 1)}</span>
                        {name.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                step="2"
                title="AI 분석 설정"
                description="회의록을 붙여넣기 전에 어떤 WBS 변경 후보를 추출할지 먼저 확인하세요."
                action={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-zinc-500"
                    onClick={() => setEnabledDetection(Object.fromEntries(detectionItems.map((item) => [item.key, true])) as Record<DetectionKey, boolean>)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    기본값으로
                  </button>
                }
              >
                <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {detectionItems.map((item) => {
                    const Icon = item.icon;
                    const checked = enabledDetection[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setEnabledDetection((current) => ({ ...current, [item.key]: !current[item.key] }))}
                        className={cn(
                          "flex min-h-[74px] items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                          checked ? "border-zinc-950 bg-white" : "border-zinc-200 bg-zinc-50 opacity-70"
                        )}
                      >
                        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg border", toneClass[item.tone])}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold leading-4 text-zinc-950">{item.label}</span>
                          <span className="mt-1 block text-[11px] leading-4 text-zinc-500">{item.description}</span>
                        </span>
                        <span className={cn("grid h-4 w-4 place-items-center rounded border", checked ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-transparent")}>
                          <Check className="h-3 w-3" />
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
                  <div>
                    <p className="text-[12.5px] font-semibold text-zinc-950">기존 WBS와 자동 매칭</p>
                    <p className="mt-0.5 text-[11.5px] text-zinc-500">검토 전에 변경 후보를 현재 WBS row와 자동으로 연결합니다.</p>
                  </div>
                  <Switch checked={autoMatch} onCheckedChange={setAutoMatch} />
                </div>
              </Panel>

              <Panel
                step="3"
                title="회의록 원문"
                description="회의록을 그대로 붙여 넣으세요. 결정 사항, 일정, 담당자, 리스크, 후속 확인 항목을 중심으로 분석합니다."
                action={
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-[11.5px]" onClick={loadSample}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      샘플 불러오기
                    </Button>
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-[11.5px]">
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      회의록 업로드
                    </Button>
                    <Button type="button" variant="ghost" className="h-7 rounded-lg px-2.5 text-[11.5px] text-zinc-500" onClick={clearNote}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      지우기
                    </Button>
                  </div>
                }
              >
                <div className="relative">
                  <Textarea
                    className="min-h-[280px] resize-y rounded-none border-0 px-4 py-4 text-[13px] leading-[22px] tracking-[-0.01em] shadow-none focus-visible:ring-0"
                    placeholder="회의록 원문을 입력하세요..."
                    {...form.register("meeting_note")}
                  />
                  <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    변경 후보 {Math.max(0, Math.min(9, Math.round(noteStats.chars / 90)))}개 예상
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-[11px] text-zinc-400">
                  <span className="font-medium uppercase tracking-[0.05em]">Markdown 지원</span>
                  <div className="flex items-center divide-x divide-zinc-100 text-center">
                    <Stat value={noteStats.chars} label="글자" />
                    <Stat value={noteStats.lines} label="줄" />
                    <Stat value={`~${noteStats.minutes}`} label="분" />
                  </div>
                </div>
                {form.formState.errors.meeting_note && (
                  <p className="px-4 pb-3 text-[12px] text-red-600">{form.formState.errors.meeting_note.message}</p>
                )}
              </Panel>

              <CandidateReviewPanel
                analysisDone={analysisDone}
                candidates={pendingCandidates}
                selected={selected}
                applying={applying}
                onToggle={toggleCandidate}
                onApply={() => void applySelected()}
              />
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-400">분석 준비 상태</p>
                  <span className="text-[11px] font-medium text-emerald-700">
                    {readyCount} / {readiness.length} 준비됨
                  </span>
                </div>
                <div className="divide-y divide-zinc-100">
                  {readiness.map((item) => (
                    <div key={item.label} className="flex items-center gap-3 px-4 py-3">
                      <span className={cn("grid h-5 w-5 place-items-center rounded-full", item.ready ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-400")}>
                        {item.ready ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 text-[12px] font-medium text-zinc-700">{item.label}</span>
                      <span className="max-w-[120px] truncate text-right text-[11px] text-zinc-400">{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-4 text-[11.5px] leading-5 text-zinc-500">
                <div className="mb-2 flex items-center gap-2 text-zinc-700">
                  <Wand2 className="h-3.5 w-3.5" />
                  <span className="font-semibold">자동 반영 방지</span>
                </div>
                AI는 변경 후보만 생성합니다. 선택한 항목을 반영하기 전에는 어떤 항목도 WBS에 저장되지 않습니다.
              </div>
            </aside>
          </div>
        </form>

        <div className="fixed bottom-0 left-[240px] right-0 z-40 flex h-[58px] items-center justify-between border-t border-zinc-200 bg-white/95 px-8 backdrop-blur">
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            {message || "회의 정보, 분석 설정, 회의록 원문을 확인한 뒤 WBS 업데이트 후보를 검토하세요."}
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="mr-2 text-[12px] text-amber-700">{error}</span>}
            <Button variant="outline" type="button" className="h-8 rounded-lg px-3 text-xs">
              임시 저장
            </Button>
            <Button
              type="button"
              disabled={!canAnalyze || loading}
              onClick={form.handleSubmit(onSubmit)}
              className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {loading ? "분석 중..." : "회의록 분석"}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CandidateReviewPanel({
  analysisDone,
  candidates,
  selected,
  applying,
  onToggle,
  onApply
}: {
  analysisDone: boolean;
  candidates: WbsChangeCandidate[];
  selected: Set<string>;
  applying: boolean;
  onToggle: (candidateId: string, checked?: boolean) => void;
  onApply: () => void;
}) {
  return (
    <Panel
      step="4"
      title="WBS 업데이트 후보"
      description="AI가 추출한 변경 후보를 evidence와 before/after 기준으로 검토하세요. 승인한 항목만 WBS에 반영됩니다."
      action={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="h-7 rounded-lg bg-zinc-950 px-2.5 text-[11.5px] font-semibold text-white hover:bg-zinc-800"
            disabled={selected.size === 0 || applying}
            onClick={onApply}
          >
            {applying ? "반영 중..." : `${selected.size}건 WBS에 반영`}
          </Button>
        </div>
      }
    >
      {!analysisDone ? (
        <div className="flex min-h-[180px] items-center justify-center border-t border-zinc-100 px-6 py-10 text-center">
          <div>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-500">
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-zinc-950">아직 분석된 후보가 없습니다.</p>
            <p className="mt-1 text-[12.5px] leading-5 text-zinc-500">회의록 분석을 실행하면 WBS 업데이트 후보가 이 영역에 표시됩니다.</p>
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-zinc-500">승인 대기 중인 WBS 업데이트 후보가 없습니다.</div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {candidates.map((candidate) => {
            const checked = selected.has(candidate.id);
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => onToggle(candidate.id)}
                className="flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-zinc-50"
              >
                <span className={cn("mt-1 grid h-4 w-4 shrink-0 place-items-center rounded border", checked ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-transparent")}>
                  <Check className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-zinc-950">{candidate.task_name}</span>
                    <CandidateBadge>{changeTypeLabel(candidate.change_type)}</CandidateBadge>
                    <CandidateBadge tone={candidate.confidence === "high" ? "green" : candidate.confidence === "medium" ? "amber" : "zinc"}>
                      {confidenceLabel(candidate.confidence)}
                    </CandidateBadge>
                    {candidate.requires_confirmation && <CandidateBadge tone="red">확인 필요</CandidateBadge>}
                  </span>
                  <span className="mt-2 grid gap-2 text-[12px] text-zinc-600 md:grid-cols-[1fr_auto_1fr]">
                    <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <b className="mr-1 text-zinc-400">Before</b>
                      {candidate.current_value || "-"}
                    </span>
                    <ArrowRight className="mx-auto mt-2 h-3.5 w-3.5 text-zinc-400" />
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">
                      <b className="mr-1 text-emerald-600">After</b>
                      {candidate.proposed_value || "-"}
                    </span>
                  </span>
                  <span className="mt-2 block rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] leading-5 text-zinc-600">
                    <b className="mr-1 text-zinc-400">Evidence</b>
                    “{candidate.evidence}”
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function CandidateBadge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "green" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-[10.5px] font-semibold",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-800",
        tone === "red" && "border-rose-200 bg-rose-50 text-rose-800",
        tone === "zinc" && "border-zinc-200 bg-zinc-50 text-zinc-700"
      )}
    >
      {children}
    </span>
  );
}

function Panel({
  step,
  title,
  description,
  action,
  children
}: {
  step: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-md bg-zinc-100 text-[11px] font-semibold text-zinc-500">{step}</span>
          <div>
            <h2 className="text-[14px] font-semibold leading-5 tracking-[-0.015em] text-zinc-950">{title}</h2>
            <p className="mt-0.5 text-[12px] leading-4 tracking-[-0.005em] text-zinc-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  children
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
        {label} {required && <span className="text-[#fd312e]">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
    </label>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="min-w-[58px] px-4">
      <span className="block text-[11.5px] font-semibold text-zinc-700">{value}</span>
      <span className="block text-[10.5px] text-zinc-400">{label}</span>
    </span>
  );
}
