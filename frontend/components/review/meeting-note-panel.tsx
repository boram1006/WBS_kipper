"use client";

import { FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { MeetingContext } from "@/components/review/review-utils";
import { buildEvidenceMap, highlightEvidenceInText, parseMeetingSections } from "@/components/review/review-utils";
import type { WbsChangeCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  meeting: MeetingContext;
  candidates: WbsChangeCandidate[];
  activeEvidence?: string;
  activeEvidenceNum?: number;
  onEvidenceClick?: (evidence: string) => void;
};

export function MeetingNotePanel({ meeting, candidates, activeEvidence, activeEvidenceNum, onEvidenceClick }: Props) {
  const [query, setQuery] = useState("");
  const [evidenceOnly, setEvidenceOnly] = useState(false);

  const evidenceMap = useMemo(() => buildEvidenceMap(candidates), [candidates]);
  const evidences = useMemo(() => candidates.map((c) => c.evidence).filter(Boolean), [candidates]);
  const sections = useMemo(() => parseMeetingSections(meeting.meeting_note), [meeting.meeting_note]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .map((section) => ({
        ...section,
        paragraphs: section.paragraphs.filter((paragraph) => {
          const hasEvidence = evidences.some((ev) => paragraph.text.toLowerCase().includes(ev.toLowerCase()));
          if (evidenceOnly && !hasEvidence) return false;
          if (!q) return true;
          return paragraph.text.toLowerCase().includes(q);
        })
      }))
      .filter((section) => section.paragraphs.length > 0);
  }, [sections, query, evidenceOnly, evidences]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <FileText className="h-3.5 w-3.5 text-zinc-500" />
            Meeting Note
          </h2>
          <span className="text-[11.5px] font-medium text-zinc-400">참석 6명 · 70분</span>
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-800">{meeting.meeting_title}</span>
          <span className="h-2.5 w-px bg-zinc-200" />
          <span>{meeting.meeting_date}</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="회의록에서 검색..."
              className="h-[30px] rounded-lg border-zinc-300 bg-white pl-8 text-xs shadow-none"
            />
          </div>
          <label className="flex h-[30px] shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700">
            <Switch checked={evidenceOnly} onCheckedChange={setEvidenceOnly} />
            Evidence only
          </label>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-5 py-5">
          {filtered.map((section) => (
            <section key={section.index}>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-400">
                <span className="font-mono">{String(section.index).padStart(2, "0")}</span>
                <span>{section.title}</span>
                <span className="h-px flex-1 bg-zinc-200" />
              </div>
              <div className="space-y-2">
                {section.paragraphs.map((paragraph, idx) => {
                  const segments = highlightEvidenceInText(paragraph.text, evidences, activeEvidence);
                  return (
                    <p key={idx} className="text-[13.5px] leading-[22px] tracking-[-0.01em] text-zinc-900">
                      {paragraph.speaker && (
                        <span className="mr-1 inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">
                          {paragraph.speaker}
                        </span>
                      )}
                      {segments.map((segment, i) => {
                        if (segment.type === "text") return <span key={i}>{segment.value}</span>;
                        const candidate = candidates.find((c) => c.evidence.toLowerCase() === segment.value.toLowerCase());
                        const num = candidate ? evidenceMap.get(candidate.id) : undefined;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onEvidenceClick?.(segment.value)}
                            className={cn(
                              "mx-0.5 inline rounded bg-amber-50 px-1 py-0.5 text-zinc-950 shadow-[inset_0_-1px_0_#fde68a] hover:bg-amber-100",
                              (activeEvidenceNum === num || segment.active) && "ring-2 ring-amber-300"
                            )}
                          >
                            {num != null && (
                              <span className="mr-1 inline-grid h-3.5 w-3.5 place-items-center rounded bg-amber-200 font-mono text-[9px] font-bold text-amber-800">
                                {num}
                              </span>
                            )}
                            {segment.value}
                          </button>
                        );
                      })}
                    </p>
                  );
                })}
              </div>
            </section>
          ))}
          {filtered.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}
        </div>
      </ScrollArea>
    </div>
  );
}
