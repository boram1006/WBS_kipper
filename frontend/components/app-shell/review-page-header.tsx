"use client";

import Link from "next/link";
import { Download, History } from "lucide-react";
import { ReviewSummaryCards } from "@/components/review/review-summary-cards";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import type { MeetingContext } from "@/components/review/review-utils";

type Summary = {
  total: number;
  new_tasks: number;
  schedule_changes: number;
  confirmation_needed: number;
  risks: number;
};

type Props = {
  projectId: string;
  projectName?: string;
  meeting: MeetingContext;
  summary: Summary;
  selectedCount: number;
  applySelectedCount: number;
  applying: boolean;
  message: string | null;
  onApply: () => void;
};

export function ReviewPageHeader({
  projectId,
  projectName = "AI UX Review Agent",
  meeting,
  summary,
  selectedCount,
  applySelectedCount,
  applying,
  message,
  onApply
}: Props) {
  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white px-8 pb-6 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <nav className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
            <Link href="/" className="hover:text-zinc-700">WBS Keeper</Link>
            <span>/</span>
            <Link href={routes.wbs(projectId)} className="hover:text-zinc-700">{projectName}</Link>
            <span>/</span>
            <span className="text-zinc-700">업데이트 검토</span>
          </nav>
          <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-tight text-zinc-950">
            업데이트 검토
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-zinc-700">
              <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
              {meeting.meeting_title} · {meeting.meeting_date.replace(/-/g, ".")}
            </span>
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-zinc-500">
            AI가 회의록에서 감지한 WBS 변경 후보입니다. 검토 후 승인한 항목만 WBS에 반영됩니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={routes.meetingNote(projectId)}>
            <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm">
              <History className="mr-1.5 h-3.5 w-3.5" />
              회의록 분석
            </Button>
          </Link>
          <a href={api.downloadWbsUrl(projectId)}>
            <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV 다운로드
            </Button>
          </a>
          <Button
            onClick={onApply}
            disabled={applySelectedCount === 0 || applying}
            className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            <span className="mr-2 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">{applySelectedCount}</span>
            WBS 반영
            <kbd className="ml-2 hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold opacity-90 sm:inline">
              ⌘↵
            </kbd>
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <ReviewSummaryCards summary={summary} selectedCount={selectedCount} />
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}
    </header>
  );
}
