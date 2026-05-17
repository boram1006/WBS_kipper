"use client";

import { ChevronDown, Filter, Search, Sparkles } from "lucide-react";
import { ChangeCandidateCard } from "@/components/review/change-candidate-card";
import type { ChangeTypeFilter } from "@/components/review/review-utils";
import { buildEvidenceMap, tabCounts } from "@/components/review/review-utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WbsChangeCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  candidates: WbsChangeCandidate[];
  filtered: WbsChangeCandidate[];
  selected: Set<string>;
  activeId: string | null;
  tab: ChangeTypeFilter;
  query: string;
  minConfidence: "all" | "high" | "medium";
  onTabChange: (tab: ChangeTypeFilter) => void;
  onQueryChange: (query: string) => void;
  onMinConfidenceChange: (value: "all" | "high" | "medium") => void;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
};

const TABS: { key: ChangeTypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new_task", label: "New" },
  { key: "schedule_change", label: "Schedule" },
  { key: "owner_change", label: "Owner" },
  { key: "status_change", label: "Status" },
  { key: "risk", label: "Risk" }
];

export function ChangeCandidatesPanel({
  candidates,
  filtered,
  selected,
  activeId,
  tab,
  query,
  minConfidence,
  onTabChange,
  onQueryChange,
  onMinConfidenceChange,
  onSelect,
  onOpen
}: Props) {
  const counts = tabCounts(candidates);
  const evidenceMap = buildEvidenceMap(candidates);
  const wbsChanges = filtered.filter((candidate) => candidate.change_type !== "risk");
  const risks = filtered.filter((candidate) => candidate.change_type === "risk");
  const wbsTotal = candidates.filter((candidate) => candidate.change_type !== "risk").length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
              <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
              AI-detected changes
            </h2>
            <p className="mt-1 text-xs text-zinc-500">검토 후 승인한 항목만 WBS에 반영됩니다. 모든 변경은 이력에 기록돼요.</p>
          </div>
          <div className="relative w-[200px] shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="task · evidence 검색"
              className="h-[30px] rounded-lg border-zinc-300 bg-white pl-8 text-xs shadow-none"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={cn(
                  "inline-flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  tab === item.key ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                {item.label}
                <span className="text-[10.5px] font-semibold text-zinc-400">{counts[item.key as keyof typeof counts] ?? 0}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onMinConfidenceChange(minConfidence === "high" ? "all" : minConfidence === "all" ? "high" : "medium")}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <Filter className="h-3 w-3 text-zinc-400" />
            Confidence <span className="text-zinc-950">{minConfidence === "all" ? "All" : minConfidence === "high" ? "High+" : "Medium+"}</span>
            <ChevronDown className="h-3 w-3 text-zinc-400" />
          </button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="pb-2">
          {filtered.length === 0 && <p className="py-12 text-center text-sm text-zinc-500">현재 필터와 일치하는 변경 후보가 없습니다.</p>}

          {wbsChanges.length > 0 && (
            <section className="pt-3">
              <div className="flex items-center gap-2 px-4 pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">WBS Changes</span>
                <span className="text-[11.5px] text-zinc-400">승인 시 WBS에 직접 반영됩니다</span>
                <span className="ml-auto text-[11.5px] font-medium text-zinc-500 tabular-nums">
                  {wbsChanges.length} / {wbsTotal}
                </span>
              </div>
              <div>
                {wbsChanges.map((candidate) => (
                  <ChangeCandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    evidenceNum={evidenceMap.get(candidate.id)}
                    selected={selected.has(candidate.id)}
                    active={activeId === candidate.id}
                    onSelect={(checked) => onSelect(candidate.id, checked)}
                    onOpen={() => onOpen(candidate.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {risks.length > 0 && (
            <section className="mt-2 border-t border-zinc-200 bg-zinc-50 pt-3">
              <div className="flex items-center gap-2 px-4 pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-red-600">Risk Register</span>
                <span className="text-[11.5px] text-zinc-400">WBS에 반영되지 않고 Risk 항목으로 별도 저장됩니다</span>
                <span className="ml-auto text-[11.5px] font-medium text-zinc-500 tabular-nums">{risks.length}</span>
              </div>
              <div>
                {risks.map((candidate) => (
                  <ChangeCandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    evidenceNum={evidenceMap.get(candidate.id)}
                    selected={selected.has(candidate.id)}
                    active={activeId === candidate.id}
                    onSelect={(checked) => onSelect(candidate.id, checked)}
                    onOpen={() => onOpen(candidate.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
