import { Calendar, HelpCircle, Plus, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Summary = {
  total: number;
  new_tasks: number;
  schedule_changes: number;
  confirmation_needed: number;
  risks: number;
};

type Props = {
  summary: Summary;
  selectedCount: number;
};

export function ReviewSummaryCards({ summary, selectedCount }: Props) {
  const cards = [
    { label: "Total changes", value: summary.total, hint: `${selectedCount} selected`, icon: Sparkles },
    { label: "New tasks", value: summary.new_tasks, hint: "신규 작업", icon: Plus },
    { label: "Schedule changes", value: summary.schedule_changes, hint: "일정 / 마감일", icon: Calendar },
    { label: "Confirmation needed", value: summary.confirmation_needed, hint: "정보 누락", icon: HelpCircle, attention: true },
    { label: "Risks · 별도 저장", value: summary.risks, hint: "Risk register", icon: ShieldAlert, risk: true }
  ];

  return (
    <section className="grid overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:grid-cols-5" aria-label="Change summary">
      {cards.map((card, index) => (
        <div key={card.label} className={cn("px-5 py-4", index < cards.length - 1 && "border-r border-zinc-200")}>
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-500">
            <card.icon className="h-3.5 w-3.5" />
            {card.label}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[26px] font-semibold leading-none tracking-tight text-zinc-950 tabular-nums">{card.value}</span>
            {(card.attention || card.risk) && (
              <span className={cn("h-1.5 w-1.5 rounded-full", card.risk ? "bg-red-500" : "bg-amber-300")} />
            )}
            <span className="text-[11.5px] font-medium text-zinc-500">{card.hint}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
