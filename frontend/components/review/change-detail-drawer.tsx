"use client";

import { ArrowRight, Check, ChevronLeft, ChevronRight, HelpCircle, Link2, Quote, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  changeTypeDotClass,
  changeTypeLabel,
  confidenceLabel,
  confidenceScore,
  fieldLabel
} from "@/components/review/review-utils";
import type { MeetingContext } from "@/components/review/review-utils";
import type { WbsChangeCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  candidate: WbsChangeCandidate | null;
  index: number;
  total: number;
  meeting: MeetingContext;
  selected: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSelect: (checked: boolean) => void;
  onJumpToEvidence: () => void;
};

export function ChangeDetailDrawer({
  candidate,
  index,
  total,
  meeting,
  selected,
  onClose,
  onPrev,
  onNext,
  onToggleSelect,
  onJumpToEvidence
}: Props) {
  if (!candidate) {
    return (
      <aside className="flex h-full min-h-0 flex-col rounded-xl border border-dashed border-zinc-200 bg-white">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500">
          변경 후보를 선택하면 상세 정보가 표시됩니다.
        </div>
      </aside>
    );
  }

  const score = confidenceScore(candidate);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]" aria-label="Change detail">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3.5">
        <div>
          <h3 className="text-sm font-semibold leading-5 text-zinc-950">Change Detail</h3>
          <p className="font-mono text-[11px] font-medium uppercase tracking-normal text-zinc-400">
            CANDIDATE {index + 1} / {total}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onPrev} className="grid h-6.5 w-6.5 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50" aria-label="이전">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onNext} className="grid h-6.5 w-6.5 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50" aria-label="다음">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} className="grid h-6.5 w-6.5 place-items-center rounded-md text-zinc-600 hover:bg-zinc-50" aria-label="닫기">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-4 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-5 items-center gap-1.5 rounded border border-zinc-200 bg-white px-1.5 text-[11px] font-medium text-zinc-700">
                <span className={cn("h-1.5 w-1.5 rounded-full", changeTypeDotClass(candidate.change_type))} />
                {changeTypeLabel(candidate.change_type)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11.5px] font-medium",
                  candidate.confidence === "high" && "text-emerald-700",
                  candidate.confidence === "medium" && "text-amber-700",
                  candidate.confidence === "low" && "text-zinc-500"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {confidenceLabel(candidate.confidence)} ·{score}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-6 tracking-tight text-zinc-950">{candidate.task_name || "제목 없음"}</h2>
            <p className="mt-1 font-mono text-[11px] font-medium text-zinc-500">
              WBS <b className="text-zinc-800">{candidate.matched_wbs_id || "New"}</b>
              <span className="mx-2 font-sans text-zinc-300">·</span>
              <span className="font-sans">{meeting.meeting_title}</span>
            </p>
          </div>

          <section className="space-y-2">
            <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">Field Change</h4>
            <div className="overflow-hidden rounded-lg border border-zinc-200 text-[12.5px]">
              <div className="grid grid-cols-[84px_1fr] border-b border-zinc-200">
                <div className="border-r border-zinc-200 bg-zinc-50 px-3 py-2 font-medium text-zinc-500">Field</div>
                <div className="px-3 py-2 text-zinc-900">{fieldLabel(candidate.field)}</div>
              </div>
              <div className="grid grid-cols-[84px_1fr] border-b border-zinc-200">
                <div className="border-r border-zinc-200 bg-zinc-50 px-3 py-2 font-medium text-zinc-500">Current</div>
                <div className="px-3 py-2 text-zinc-500 line-through decoration-zinc-300">{candidate.current_value || "-"}</div>
              </div>
              <div className="grid grid-cols-[84px_1fr]">
                <div className="border-r border-zinc-200 bg-zinc-50 px-3 py-2 font-medium text-zinc-500">Proposed</div>
                <div className="px-3 py-2 font-semibold text-zinc-950">
                  {candidate.proposed_value || "-"}
                  {candidate.proposed_value && candidate.current_value && (
                    <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                      변경
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">Evidence</h4>
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-zinc-950">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-amber-800">
                <Quote className="h-3 w-3" />
                {meeting.meeting_title} · {meeting.meeting_date}
              </div>
              <q className="block text-[13px] leading-5">{candidate.evidence}</q>
              <Button variant="outline" className="h-7 rounded border-amber-200 bg-transparent px-2 text-[11px] text-amber-800 hover:bg-amber-100" onClick={onJumpToEvidence}>
                회의록에서 보기
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </section>

          {candidate.reason && (
            <section className="space-y-2">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">AI Reasoning</h4>
              <div className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-600">
                  <Sparkles className="h-3 w-3 text-zinc-400" />
                  판단 근거
                </div>
                <p className="text-[12.5px] leading-5 text-zinc-700">{candidate.reason}</p>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-zinc-500">Review Status</h4>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-zinc-700">
                <Link2 className="h-3.5 w-3.5 text-zinc-400" />
                관련 WBS 항목
              </div>
              <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-600">
                {candidate.matched_wbs_id || "New"}
              </span>
            </div>
          </section>
        </div>
      </ScrollArea>

      <div className="grid grid-cols-2 gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
        <Button className="h-[34px] rounded-lg bg-zinc-950 text-xs font-semibold hover:bg-zinc-800" onClick={() => onToggleSelect(true)}>
          <Check className="mr-1.5 h-3.5 w-3.5" />
          {selected ? "Approved" : "Approve"}
        </Button>
        <Button variant="outline" className="h-[34px] rounded-lg border-zinc-200 bg-white text-xs" onClick={() => onToggleSelect(false)}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          Reject
        </Button>
        <Button variant="outline" className="col-span-2 h-8 rounded-lg border-dashed border-zinc-300 bg-transparent text-xs text-zinc-600">
          <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
          Mark as needs clarification
        </Button>
      </div>
    </aside>
  );
}
