"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveMeetingContext } from "@/components/review/review-utils";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
import { cn } from "@/lib/utils";

const SAMPLE_NOTE = `[주간 프로젝트 싱크 - 2026.05.17]

진행 상황 공유

지난주 액션 아이템은 약 70% 완료되었습니다. 남은 항목은 이번 주 안에 마무리하기로 했습니다.

GUI / 디자인
- GUI 초안 작업이 예상보다 길어지고 있어 다음 주 수요일까지 연장하기로 했습니다.
- 디자인 시스템 정리도 이번 주 금요일까지 함께 완료할 예정입니다.

개발 담당자
- 개발 구현 작업을 더 명확히 분리할 필요가 있습니다. 민수님이 구현을 담당하기로 했습니다.
- QA는 별도로 분리하지 않고 기존 체계를 유지합니다.

범위 / 보류
- Jira 연동은 이번 1차 MVP 범위에서 제외하고 2차로 미룹니다.
- WBS 업로드와 컬럼 매핑은 완료되어 회의록 분석을 진행할 수 있습니다.

리스크
- OpenAI 응답이 항상 안정적인 JSON으로 오지 않을 가능성이 있습니다.
- 배포 일정이 촉박해서 Vercel과 Render 환경 변수를 확인해야 합니다.

추가 확인
- 자동 반영 금지 정책은 다음 회의에서 다시 확인하기로 했습니다.`;

const schema = z.object({
  meeting_date: z.string().min(1, "회의 날짜를 입력해 주세요."),
  meeting_title: z.string().min(1, "회의 제목을 입력해 주세요."),
  attendees: z.string().optional(),
  wbs_version: z.string().optional(),
  meeting_note: z.string().min(10, "회의록은 10자 이상 입력해 주세요.")
});

type FormValues = z.infer<typeof schema>;

const detectionItems = [
  { key: "new_tasks", label: "신규 작업", description: "추가된 작업 항목", icon: Sparkles, tone: "emerald" },
  { key: "schedule_changes", label: "일정 변경", description: "시작일과 마감일 변경", icon: Calendar, tone: "violet" },
  { key: "owner_changes", label: "담당자 변경", description: "작업 담당자 변경", icon: UserRound, tone: "sky" },
  { key: "status_changes", label: "상태 변경", description: "진행, 완료, 보류 상태", icon: ClipboardList, tone: "orange" },
  { key: "dependency_changes", label: "의존성 변경", description: "선행 작업과 막힘 항목", icon: Link2, tone: "slate" },
  { key: "risks", label: "리스크", description: "WBS와 별도 저장", icon: AlertCircle, tone: "rose" },
  { key: "clarification_needed", label: "추가 확인 필요", description: "검토가 필요한 항목", icon: FileText, tone: "zinc" }
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
  const projectId = useProjectIdFromQuery();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoMatch, setAutoMatch] = useState(true);
  const [enabledDetection, setEnabledDetection] = useState<Record<DetectionKey, boolean>>(() =>
    Object.fromEntries(detectionItems.map((item) => [item.key, true])) as Record<DetectionKey, boolean>
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      meeting_date: new Date().toISOString().slice(0, 10),
      meeting_title: "주간 프로젝트 싱크 - 2026년 5월 3주차",
      attendees: "정경민, 박수민, 이도헌, 한은수, 지호",
      wbs_version: "project-wbs-2026q2 - v2.3",
      meeting_note: ""
    }
  });

  const note = form.watch("meeting_note");
  const meetingDate = form.watch("meeting_date");
  const meetingTitle = form.watch("meeting_title");
  const wbsVersion = form.watch("wbs_version");
  const attendees = form.watch("attendees");

  const noteStats = useMemo(() => {
    const trimmed = note.trim();
    return {
      chars: trimmed.length,
      lines: trimmed ? trimmed.split(/\r?\n/).length : 0,
      minutes: Math.max(1, Math.round(trimmed.length / 500))
    };
  }, [note]);

  const readiness = [
    { label: "WBS 업로드 완료", ready: Boolean(projectId), detail: wbsVersion || "프로젝트 기준" },
    { label: "필수 컬럼 매핑 완료", ready: Boolean(projectId), detail: "5 / 5" },
    { label: "회의 날짜 선택", ready: Boolean(meetingDate), detail: meetingDate || "-" },
    { label: "회의록 입력", ready: noteStats.chars >= 10, detail: `${noteStats.chars}자` }
  ];
  const readyCount = readiness.filter((item) => item.ready).length;
  const canAnalyze = Boolean(projectId && meetingDate && meetingTitle && noteStats.chars >= 10);

  function loadSample() {
    form.setValue("meeting_note", SAMPLE_NOTE, { shouldDirty: true, shouldValidate: true });
    form.setValue("meeting_title", "주간 프로젝트 싱크 - 2026년 5월 3주차", { shouldDirty: true });
    form.setValue("meeting_date", "2026-05-17", { shouldDirty: true });
  }

  function clearNote() {
    form.setValue("meeting_note", "", { shouldDirty: true, shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);
    setError(null);
    try {
      if (!projectId) throw new Error("프로젝트 ID가 없습니다.");
      saveMeetingContext(projectId, {
        meeting_date: values.meeting_date,
        meeting_title: values.meeting_title,
        meeting_note: values.meeting_note
      });
      await api.analyzeMeeting(projectId, {
        meeting_date: values.meeting_date,
        meeting_title: values.meeting_title,
        meeting_note: values.meeting_note
      });
      router.push(routes.review(projectId));
    } catch (err) {
      if (projectId) {
        saveMeetingContext(projectId, {
          meeting_date: values.meeting_date,
          meeting_title: values.meeting_title,
          meeting_note: values.meeting_note
        });
        router.push(routes.review(projectId));
        return;
      }
      setError(err instanceof Error ? err.message : "분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[#fafaf9] font-sans text-zinc-950">
      <AppSidebar projectId={projectId} pendingCount={8} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 bg-white px-8 pb-5 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <nav className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                <span>WBS Keeper</span>
                <span>/</span>
                <span>회의록</span>
                <span>/</span>
                <span className="text-zinc-700">새 회의 분석</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-[-0.024em] text-zinc-950">
                회의록 분석
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium tracking-[-0.01em] text-zinc-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
                  프로젝트 · AI UX Review Agent · WBS v2.3
                </span>
              </h1>
              <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.01em] text-zinc-500">
                회의록 원문을 입력하면 AI가 WBS 변경 후보를 추출합니다. 자동으로 반영되지는 않습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                {loading ? "분석 중..." : "회의록 분석 실행"}
                <kbd className="ml-2 hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold opacity-90 sm:inline">⌘↵</kbd>
              </Button>
            </div>
          </div>
        </header>

        <form onSubmit={form.handleSubmit(onSubmit)} className="min-h-0 flex-1 overflow-auto px-8 py-5 pb-24">
          <div className="grid grid-cols-[minmax(680px,1fr)_328px] gap-4">
            <div className="space-y-4">
              <Panel
                step="1"
                title="회의 정보"
                description="분석 결과와 변경 이력에 사용할 회의 기본 정보를 입력하세요."
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-md text-[11px]">
                      프로젝트 <b className="ml-1 font-semibold text-zinc-950">AI UX Review Agent</b>
                    </Badge>
                    <Badge variant="outline" className="rounded-md text-[11px]">
                      WBS <b className="ml-1 font-semibold text-zinc-950">{wbsVersion || "v2.3"}</b>
                    </Badge>
                  </div>
                }
              >
                <div className="grid gap-3 p-4 pb-0 md:grid-cols-[1fr_180px]">
                  <Field label="회의 제목" required>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" {...form.register("meeting_title")} />
                  </Field>
                  <Field label="회의 날짜" required>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" type="date" {...form.register("meeting_date")} />
                  </Field>
                </div>
                <div className="grid gap-3 p-4 pt-3 md:grid-cols-[1fr_240px]">
                  <Field label="참석자" optional>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" placeholder="이름을 쉼표로 구분해 입력" {...form.register("attendees")} />
                  </Field>
                  <Field label="관련 WBS 버전">
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" {...form.register("wbs_version")} />
                  </Field>
                </div>
                {attendees && (
                  <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-3">
                    {attendees.split(",").map((name) => (
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
                title="회의록 원문"
                description="회의록을 그대로 붙여넣으세요. 결정 사항, 일정, 담당자, 리스크, 후속 확인 항목을 감지합니다."
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

              <Panel
                step="3"
                title="AI 분석 설정"
                description="이번 회의록에서 어떤 WBS 변경 후보를 추출할지 선택하세요."
                action={
                  <button type="button" className="inline-flex items-center gap-1 text-[11.5px] font-medium text-zinc-500">
                    <RefreshCw className="h-3.5 w-3.5" />
                    기본값으로
                  </button>
                }
              >
                <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-4">
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
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-400">AI가 감지할 항목</p>
                </div>
                <div className="space-y-2 p-4">
                  {detectionItems.slice(0, 6).map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.key} className="flex items-center gap-3">
                        <span className={cn("grid h-6 w-6 place-items-center rounded-md border", toneClass[item.tone])}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="text-[12.5px] font-semibold leading-4 text-zinc-800">{item.label}</p>
                          <p className="text-[11px] leading-4 text-zinc-400">{item.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

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
                  <span className="font-semibold">자동 반영 금지</span>
                </div>
                AI는 변경 후보만 생성합니다. 사용자가 승인하기 전에는 어떤 항목도 WBS에 반영되지 않습니다.
              </div>
            </aside>
          </div>
        </form>

        <div className="fixed bottom-0 left-[240px] right-0 z-40 flex h-[58px] items-center justify-between border-t border-zinc-200 bg-white/95 px-8 backdrop-blur">
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            임시 저장됨. AI는 후보만 생성하며, 승인된 항목만 Update Review에서 WBS에 반영됩니다.
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
              {loading ? "분석 중..." : "회의록 분석 실행"}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
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

function Field({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
        {label} {required && <span className="text-[#fd312e]">*</span>} {optional && <span className="font-medium text-zinc-400">선택</span>}
      </span>
      {children}
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
