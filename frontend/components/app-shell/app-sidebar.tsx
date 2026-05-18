"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, ChevronsUpDown, ClipboardList, GitBranch, History, Mic, Table2 } from "lucide-react";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  pendingCount?: number;
};

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active ? "bg-zinc-100 text-zinc-950" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-zinc-900" : "text-zinc-500")} />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="min-w-[18px] rounded bg-zinc-950 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white tabular-nums">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function AppSidebar({ projectId, pendingCount = 0 }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-5">
      <div className="mb-7 flex items-center gap-2.5 px-2">
        <div className="relative grid h-7 w-7 place-items-center rounded-lg bg-zinc-950 text-[11px] font-bold text-white">
          W
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#fd312e]" />
        </div>
        <span className="text-[14px] font-semibold tracking-tight text-zinc-950">WBS Keeper</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto">
        <div>
          <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.05em] text-zinc-400">WBS Workflow</p>
          <div className="space-y-0.5">
            <NavItem href={routes.wbs(projectId)} icon={Table2} label="Current WBS" active={pathname === "/wbs"} />
            <NavItem href={routes.upload(projectId)} icon={GitBranch} label="WBS Setup" active={pathname === "/upload"} />
            <NavItem href={routes.meetingNote(projectId)} icon={Mic} label="Meeting Input" active={pathname === "/meeting-note"} />
            <NavItem href={routes.review(projectId)} icon={CheckSquare} label="Update Review" active={pathname === "/review"} badge={pendingCount} />
            <NavItem href={routes.history(projectId)} icon={History} label="Change History" active={pathname === "/history"} />
          </div>
        </div>

        <div>
          <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.05em] text-zinc-400">Project</p>
          <div className="space-y-0.5">
            <NavItem href={routes.project(projectId)} icon={ClipboardList} label="Project Detail" active={pathname === "/project"} />
          </div>
        </div>
      </nav>

      <div className="border-t border-zinc-200 pt-4">
        <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-zinc-100">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-950 text-[11px] font-semibold text-white">JK</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-zinc-950">최보람</p>
            <p className="truncate text-[11px] text-zinc-400">PM · AI UX Review</p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </button>
      </div>
    </aside>
  );
}
