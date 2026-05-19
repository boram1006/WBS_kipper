"use client";

import { HelpCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  selectedCount: number;
  totalCount: number;
  indeterminate: boolean;
  allSelected: boolean;
  applying?: boolean;
  onToggleAll: () => void;
  onSelectAll: () => void;
  onSelectHigh: () => void;
  onClearSelection: () => void;
  onApply: () => void;
};

export function ReviewApplyBar({
  selectedCount,
  totalCount,
  indeterminate,
  allSelected,
  applying,
  onToggleAll,
  onSelectAll,
  onSelectHigh,
  onClearSelection,
  onApply
}: Props) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.20)]">
      <div className="flex items-center justify-between gap-6 px-8 py-3">
        <div className="flex shrink-0 items-center gap-3">
          <Checkbox checked={allSelected} indeterminate={indeterminate} onCheckedChange={onToggleAll} />
          <div className="text-[12.5px] font-medium text-zinc-900">
            <span className="font-semibold tabular-nums">{selectedCount}</span>
            <span className="text-zinc-500"> of {totalCount} changes selected</span>
          </div>
          <span className="hidden h-4 w-px bg-zinc-200 lg:block" />
          <div className="hidden items-center gap-1 text-xs text-zinc-500 lg:flex">
            <button type="button" className="rounded px-2 py-1 hover:bg-zinc-100 hover:text-zinc-950" onClick={onSelectAll}>전체 선택</button>
            <button type="button" className="rounded px-2 py-1 hover:bg-zinc-100 hover:text-zinc-950" onClick={onSelectHigh}>High만</button>
            <button type="button" className="rounded px-2 py-1 hover:bg-zinc-100 hover:text-zinc-950" onClick={onClearSelection}>선택 해제</button>
          </div>
        </div>

        <p className="hidden min-w-0 items-center gap-1.5 truncate text-[11.5px] text-zinc-500 xl:flex">
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          승인된 항목만 WBS에 반영되며, 모든 결정은 변경 이력에 기록됩니다.
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" className="hidden h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs sm:inline-flex">
            <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
            Mark as clarification
          </Button>
          <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-red-600 hover:bg-red-50">
            Reject selected
          </Button>
          <Button disabled={selectedCount === 0 || applying} onClick={onApply} className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold hover:bg-zinc-800">
            <span className="mr-2 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">{selectedCount}</span>
            Apply to WBS
            <kbd className="ml-2 hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold opacity-90 sm:inline">
              ⌘↵
            </kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
