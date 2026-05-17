"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReviewAppShell } from "@/components/app-shell/review-app-shell";
import { ReviewShellProvider, useReviewShell } from "@/components/app-shell/review-shell-context";
import { ReviewPageHeader } from "@/components/app-shell/review-page-header";
import { ChangeCandidatesPanel } from "@/components/review/change-candidates-panel";
import { ChangeDetailDrawer } from "@/components/review/change-detail-drawer";
import { MeetingNotePanel } from "@/components/review/meeting-note-panel";
import { ReviewApplyBar } from "@/components/review/review-apply-bar";
import {
  buildEvidenceMap,
  computeSummary,
  loadMeetingContext,
  meetingNoteForDisplay,
  matchesFilter,
  type ChangeTypeFilter
} from "@/components/review/review-utils";
import { api } from "@/lib/api";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
import type { WbsChangeCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ReviewPage() {
  const projectId = useProjectIdFromQuery();

  return (
    <ReviewShellProvider projectId={projectId}>
      <ReviewAppShell>
        <ReviewWorkspace projectId={projectId} />
      </ReviewAppShell>
    </ReviewShellProvider>
  );
}

function ReviewWorkspace({ projectId }: { projectId: string }) {
  const { setPendingCount } = useReviewShell();
  const [candidates, setCandidates] = useState<WbsChangeCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [tab, setTab] = useState<ChangeTypeFilter>("all");
  const [query, setQuery] = useState("");
  const [minConfidence, setMinConfidence] = useState<"all" | "high" | "medium">("all");
  const [highlightEvidence, setHighlightEvidence] = useState<string | undefined>();
  const [meeting, setMeeting] = useState(() => loadMeetingContext(projectId));

  const load = useCallback(async () => {
    if (!projectId) return;
    const response = await api.getPendingChanges(projectId);
    setCandidates(response.changes);
    setActiveId((current) => current ?? response.changes[0]?.id ?? null);
  }, [projectId]);

  useEffect(() => {
    setMeeting(loadMeetingContext(projectId));
    void load();
  }, [projectId, load]);

  const pending = useMemo(() => candidates.filter((candidate) => candidate.status === "pending"), [candidates]);
  const filtered = useMemo(
    () => pending.filter((candidate) => matchesFilter(candidate, tab, query, minConfidence)),
    [pending, tab, query, minConfidence]
  );
  const summary = useMemo(() => computeSummary(pending), [pending]);
  const evidenceMap = useMemo(() => buildEvidenceMap(pending), [pending]);
  const displayMeeting = useMemo(() => meetingNoteForDisplay(meeting, pending), [meeting, pending]);

  useEffect(() => {
    setPendingCount(pending.length);
  }, [pending.length, setPendingCount]);

  const activeCandidate = pending.find((candidate) => candidate.id === activeId) ?? null;
  const activeIndex = activeCandidate ? pending.findIndex((candidate) => candidate.id === activeCandidate.id) : 0;

  const selectedInPending = pending.filter((candidate) => selected.has(candidate.id));
  const allSelected = pending.length > 0 && selectedInPending.length === pending.length;
  const indeterminate = selectedInPending.length > 0 && !allSelected;

  function toggle(candidateId: string, checked?: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      const shouldSelect = checked ?? !next.has(candidateId);
      if (shouldSelect) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(pending.map((candidate) => candidate.id)));
  }

  function selectHighOnly() {
    setSelected(new Set(pending.filter((candidate) => candidate.confidence === "high").map((candidate) => candidate.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleAll() {
    if (allSelected) clearSelection();
    else selectAll();
  }

  async function apply() {
    setApplying(true);
    try {
      if (!projectId) return;
      const result = await api.applyChanges(projectId, Array.from(selected));
      setSelected(new Set());
      setMessage(`${result.applied_count}건의 변경이 WBS에 반영되었습니다.`);
      await load();
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (selected.size > 0) void apply();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function goPrev() {
    if (!pending.length) return;
    const idx = Math.max(0, activeIndex - 1);
    setActiveId(pending[idx].id);
  }

  function goNext() {
    if (!pending.length) return;
    const idx = Math.min(pending.length - 1, activeIndex + 1);
    setActiveId(pending[idx].id);
  }

  function openCandidate(id: string) {
    setActiveId(id);
    setDrawerOpen(true);
  }

  const workspaceGridClass = cn(
    "grid min-h-0 flex-1 items-start gap-4 px-8 py-5",
    drawerOpen && pending.length > 0
      ? "grid-cols-[minmax(320px,480px)_minmax(500px,1fr)_396px]"
      : "grid-cols-[minmax(320px,560px)_minmax(620px,1fr)]"
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ReviewPageHeader
        projectId={projectId}
        meeting={meeting}
        summary={summary}
        selectedCount={selectedInPending.length}
        applySelectedCount={selected.size}
        applying={applying}
        message={message}
        onApply={apply}
      />

      <div className={cn(workspaceGridClass, "pb-24")}>
        <MeetingNotePanel
          meeting={displayMeeting}
          candidates={pending}
          activeEvidence={highlightEvidence}
          activeEvidenceNum={activeCandidate ? evidenceMap.get(activeCandidate.id) : undefined}
          onEvidenceClick={(evidence) => {
            setHighlightEvidence(evidence);
            const match = pending.find((candidate) => candidate.evidence.toLowerCase() === evidence.toLowerCase());
            if (match) openCandidate(match.id);
          }}
        />

        {pending.length === 0 ? (
          <div
            className={cn(
              "flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500",
              !drawerOpen ? "col-span-1" : "col-span-2"
            )}
          >
            대기 중인 변경 후보가 없습니다. WBS를 업로드하고 회의록을 분석해 주세요.
          </div>
        ) : (
          <>
            <ChangeCandidatesPanel
              candidates={pending}
              filtered={filtered}
              selected={selected}
              activeId={activeId}
              tab={tab}
              query={query}
              minConfidence={minConfidence}
              onTabChange={setTab}
              onQueryChange={setQuery}
              onMinConfidenceChange={setMinConfidence}
              onSelect={toggle}
              onOpen={openCandidate}
            />
            {drawerOpen && (
              <ChangeDetailDrawer
                candidate={activeCandidate}
                index={activeIndex}
                total={pending.length}
                meeting={displayMeeting}
                selected={activeCandidate ? selected.has(activeCandidate.id) : false}
                onClose={() => setDrawerOpen(false)}
                onPrev={goPrev}
                onNext={goNext}
                onToggleSelect={(checked) => activeCandidate && toggle(activeCandidate.id, checked)}
                onJumpToEvidence={() => activeCandidate && setHighlightEvidence(activeCandidate.evidence)}
              />
            )}
          </>
        )}
      </div>

      <ReviewApplyBar
        selectedCount={selectedInPending.length}
        totalCount={pending.length}
        indeterminate={indeterminate}
        allSelected={allSelected}
        applying={applying}
        onToggleAll={toggleAll}
        onSelectAll={selectAll}
        onSelectHigh={selectHighOnly}
        onClearSelection={clearSelection}
        onApply={apply}
      />
    </div>
  );
}
