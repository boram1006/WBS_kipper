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

const SAMPLE_NOTE = `[Weekly Project Sync - 2026.05.17]

Progress update

Last week's action items are about 70% complete. Remaining items will be wrapped up by the end of this week.

GUI / Design
- The GUI draft is taking longer than expected, so the first draft should move to next Wednesday.
- The design system cleanup will also be completed by this Friday.

Development owner
- Development work needs to be split more clearly. Minsoo will own implementation.
- QA will stay inside the current workstream for now and will not be separated yet.

Scope / Hold
- Jira integration is excluded from the first MVP scope and moved to phase 2.
- WBS upload and column mapping are complete, so meeting-note analysis can proceed.

Risks
- There is a risk that OpenAI responses may not always return stable JSON.
- The deployment schedule is tight, so Vercel and Render environment variables must be checked.

Clarification
- Automatic apply policy should be confirmed again in the next meeting.`;

const schema = z.object({
  meeting_date: z.string().min(1, "Meeting date is required."),
  meeting_title: z.string().min(1, "Meeting title is required."),
  attendees: z.string().optional(),
  wbs_version: z.string().optional(),
  meeting_note: z.string().min(10, "Meeting note must be at least 10 characters.")
});

type FormValues = z.infer<typeof schema>;

const detectionItems = [
  { key: "new_tasks", label: "New tasks", description: "Additional work items", icon: Sparkles, tone: "emerald" },
  { key: "schedule_changes", label: "Schedule changes", description: "Start and due date updates", icon: Calendar, tone: "violet" },
  { key: "owner_changes", label: "Owner changes", description: "Assignee updates", icon: UserRound, tone: "sky" },
  { key: "status_changes", label: "Status changes", description: "Progress and hold status", icon: ClipboardList, tone: "orange" },
  { key: "dependency_changes", label: "Dependency changes", description: "Blocked or linked tasks", icon: Link2, tone: "slate" },
  { key: "risks", label: "Risks", description: "Saved separately from WBS", icon: AlertCircle, tone: "rose" },
  { key: "clarification_needed", label: "Clarification needed", description: "Items needing review", icon: FileText, tone: "zinc" }
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
      meeting_title: "Weekly Project Sync - 2026 May W3",
      attendees: "Jung Kyungmin, Park Sumin, Lee Doheon, Han Eunsu, Jiho",
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
    { label: "WBS uploaded", ready: Boolean(projectId), detail: wbsVersion || "project context" },
    { label: "Required columns mapped", ready: Boolean(projectId), detail: "5 / 5" },
    { label: "Meeting date selected", ready: Boolean(meetingDate), detail: meetingDate || "-" },
    { label: "Meeting note entered", ready: noteStats.chars >= 10, detail: `${noteStats.chars} chars` }
  ];
  const readyCount = readiness.filter((item) => item.ready).length;
  const canAnalyze = Boolean(projectId && meetingDate && meetingTitle && noteStats.chars >= 10);

  function loadSample() {
    form.setValue("meeting_note", SAMPLE_NOTE, { shouldDirty: true, shouldValidate: true });
    form.setValue("meeting_title", "Weekly Project Sync - 2026 May W3", { shouldDirty: true });
    form.setValue("meeting_date", "2026-05-17", { shouldDirty: true });
  }

  function clearNote() {
    form.setValue("meeting_note", "", { shouldDirty: true, shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);
    setError(null);
    try {
      if (!projectId) throw new Error("Project id is missing.");
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
      setError(err instanceof Error ? err.message : "Analysis failed.");
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
                <span>Projects</span>
                <span>/</span>
                <span>AI UX Review Agent</span>
                <span>/</span>
                <span>Meetings</span>
                <span>/</span>
                <span className="text-zinc-700">New Meeting</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-[-0.024em] text-zinc-950">
                Meeting Note Analysis
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium tracking-[-0.01em] text-zinc-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
                  Project - AI UX Review Agent - WBS v2.3
                </span>
              </h1>
              <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.01em] text-zinc-500">
                Paste meeting notes and let AI extract WBS change candidates. Nothing is applied automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm" type="button">
                <History className="mr-1.5 h-3.5 w-3.5" />
                Load previous
              </Button>
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm" type="button">
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save Draft
              </Button>
              <Button
                className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
                disabled={!canAnalyze || loading}
                onClick={form.handleSubmit(onSubmit)}
                type="button"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {loading ? "Analyzing..." : "Analyze Meeting Note"}
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
                title="Meeting Info"
                description="Enter meeting metadata used for analysis and change history."
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-md text-[11px]">
                      Project <b className="ml-1 font-semibold text-zinc-950">AI UX Review Agent</b>
                    </Badge>
                    <Badge variant="outline" className="rounded-md text-[11px]">
                      WBS <b className="ml-1 font-semibold text-zinc-950">{wbsVersion || "v2.3"}</b>
                    </Badge>
                  </div>
                }
              >
                <div className="grid gap-3 p-4 pb-0 md:grid-cols-[1fr_180px]">
                  <Field label="Meeting title" required>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" {...form.register("meeting_title")} />
                  </Field>
                  <Field label="Meeting date" required>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" type="date" {...form.register("meeting_date")} />
                  </Field>
                </div>
                <div className="grid gap-3 p-4 pt-3 md:grid-cols-[1fr_240px]">
                  <Field label="Attendees" optional>
                    <Input className="h-9 rounded-lg border-zinc-200 text-[12.5px]" placeholder="Separate names with commas" {...form.register("attendees")} />
                  </Field>
                  <Field label="Related WBS version">
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
                title="Meeting Note"
                description="Paste the raw meeting note. Decisions, dates, owners, risks, and follow-ups are detected."
                action={
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-[11.5px]" onClick={loadSample}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Load sample
                    </Button>
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-[11.5px]">
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Upload transcript
                    </Button>
                    <Button type="button" variant="ghost" className="h-7 rounded-lg px-2.5 text-[11.5px] text-zinc-500" onClick={clearNote}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  </div>
                }
              >
                <div className="relative">
                  <Textarea
                    className="min-h-[280px] resize-y rounded-none border-0 px-4 py-4 text-[13px] leading-[22px] tracking-[-0.01em] shadow-none focus-visible:ring-0"
                    placeholder="Paste meeting note here..."
                    {...form.register("meeting_note")}
                  />
                  <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {Math.max(0, Math.min(9, Math.round(noteStats.chars / 90)))} possible changes
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-[11px] text-zinc-400">
                  <span className="font-medium uppercase tracking-[0.05em]">Markdown supported</span>
                  <div className="flex items-center divide-x divide-zinc-100 text-center">
                    <Stat value={noteStats.chars} label="chars" />
                    <Stat value={noteStats.lines} label="lines" />
                    <Stat value={`~${noteStats.minutes}`} label="min read" />
                  </div>
                </div>
                {form.formState.errors.meeting_note && (
                  <p className="px-4 pb-3 text-[12px] text-red-600">{form.formState.errors.meeting_note.message}</p>
                )}
              </Panel>

              <Panel
                step="3"
                title="AI Analysis Settings"
                description="Choose which WBS change candidates should be detected from this meeting."
                action={
                  <button type="button" className="inline-flex items-center gap-1 text-[11.5px] font-medium text-zinc-500">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reset defaults
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
                    <p className="text-[12.5px] font-semibold text-zinc-950">Auto-match with existing WBS</p>
                    <p className="mt-0.5 text-[11.5px] text-zinc-500">Try to match detected changes to current WBS rows before review.</p>
                  </div>
                  <Switch checked={autoMatch} onCheckedChange={setAutoMatch} />
                </div>
              </Panel>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-400">What AI will detect</p>
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-400">Analysis readiness</p>
                  <span className="text-[11px] font-medium text-emerald-700">
                    {readyCount} / {readiness.length} ready
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
                  <span className="font-semibold">Do not apply automatically</span>
                </div>
                AI will only generate candidates. Nothing will be applied without approval.
              </div>
            </aside>
          </div>
        </form>

        <div className="fixed bottom-0 left-[240px] right-0 z-40 flex h-[58px] items-center justify-between border-t border-zinc-200 bg-white/95 px-8 backdrop-blur">
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Draft auto-saved. AI creates candidates only; approved items are applied later in Update Review.
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="mr-2 text-[12px] text-amber-700">{error}</span>}
            <Button variant="outline" type="button" className="h-8 rounded-lg px-3 text-xs">
              Save Draft
            </Button>
            <Button
              type="button"
              disabled={!canAnalyze || loading}
              onClick={form.handleSubmit(onSubmit)}
              className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {loading ? "Analyzing..." : "Analyze Meeting Note"}
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
        {label} {required && <span className="text-[#fd312e]">*</span>} {optional && <span className="font-medium text-zinc-400">Optional</span>}
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
