"use client";

import { ArrowRight, ChevronRight, HelpCircle, Quote } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  changeTypeDotClass,
  changeTypeLabel,
  confidenceLabel,
  confidenceScore,
  fieldLabel
} from "@/components/review/review-utils";
import type { WbsChangeCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  candidate: WbsChangeCandidate;
  evidenceNum?: number;
  selected: boolean;
  active: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
};

export function ChangeCandidateCard({ candidate, evidenceNum, selected, active, onSelect, onOpen }: Props) {
  const score = confidenceScore(candidate);
  const isRisk = candidate.change_type === "risk";

  return (
    <article
      className={cn(
        "grid cursor-pointer grid-cols-[16px_1fr_auto] gap-3 border-t border-zinc-200 px-4 py-3.5 transition-colors hover:bg-zinc-50",
        active && "bg-zinc-50",
        selected && "relative before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-0.5 before:rounded-r before:bg-[#fd312e]"
      )}
      onClick={onOpen}
    >
      <div className="pt-0.5" onClick={(event) => event.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onSelect} />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="inline-flex h-5 items-center gap-1.5 rounded border border-zinc-200 bg-white px-1.5 font-medium text-zinc-700">
            <span className={cn("h-1.5 w-1.5 rounded-full", changeTypeDotClass(candidate.change_type))} />
            {changeTypeLabel(candidate.change_type)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              candidate.confidence === "high" && "text-emerald-700",
              candidate.confidence === "medium" && "text-amber-700",
              candidate.confidence === "low" && "text-zinc-500"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {confidenceLabel(candidate.confidence)}
            <span className="font-mono text-zinc-400">·{score}</span>
          </span>
          {candidate.requires_confirmation && (
            <span className="inline-flex h-5 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 font-medium text-amber-800">
              <HelpCircle className="h-3 w-3" />
              확인 필요
            </span>
          )}
          {isRisk && (
            <span className="inline-flex h-5 items-center rounded border border-red-100 bg-white px-1.5 font-medium text-red-600">
              Risk register only
            </span>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-[14.5px] font-semibold leading-5 tracking-[-0.015em] text-zinc-950">
            {candidate.task_name || "제목 없음"}
          </h3>
          <span className="shrink-0 font-mono text-[11px] font-medium text-zinc-500">
            WBS <b className="text-zinc-800">{candidate.matched_wbs_id || "New"}</b>
          </span>
        </div>

        {(candidate.current_value || candidate.proposed_value) && (
          <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-700">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-400">{fieldLabel(candidate.field)}</span>
            <span className="text-zinc-500 line-through decoration-zinc-300">{candidate.current_value || "-"}</span>
            <ArrowRight className="h-3 w-3 text-zinc-400" />
            <span className={cn("font-semibold text-zinc-950", isRisk && "text-red-600")}>{candidate.proposed_value || "-"}</span>
          </div>
        )}

        {candidate.evidence && (
          <div className="grid grid-cols-[auto_1fr] gap-2 text-[12.5px] leading-5 text-zinc-800">
            <Quote className="mt-1 h-3.5 w-3.5 text-amber-300" />
            <div>
              {evidenceNum != null && (
                <span className="mr-1.5 inline-grid h-3.5 w-3.5 place-items-center rounded bg-amber-50 font-mono text-[9px] font-bold text-amber-800">
                  {evidenceNum}
                </span>
              )}
              <q>{candidate.evidence}</q>
            </div>
          </div>
        )}

        {candidate.requires_confirmation && candidate.reason && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-4 text-amber-800">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <b>확인 필요</b> · {candidate.reason}
            </div>
          </div>
        )}

        {!candidate.requires_confirmation && candidate.reason && (
          <p className="flex gap-1.5 text-[11.5px] leading-4 text-zinc-500">
            <span className="h-fit rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-zinc-600">AI</span>
            {candidate.reason}
          </p>
        )}
      </div>

      <ChevronRight className="mt-auto h-4 w-4 self-center text-zinc-400" />
    </article>
  );
}
