"use client";

import type { ComponentType } from "react";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, FileText, GitBranch, PanelLeftClose, PanelLeftOpen, Table2 } from "lucide-react";
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
  badge,
  collapsed,
  onClick
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  badge?: number;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        collapsed && "justify-center px-2",
        active ? "bg-zinc-100 text-zinc-950" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-zinc-900" : "text-zinc-500")} />
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
      {badge != null && badge > 0 && !collapsed && (
        <span className="min-w-[18px] rounded bg-zinc-950 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

export function AppSidebar({ projectId }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  function navigate(href: string) {
    router.push(href);
    router.refresh();
  }

  return (
    <div className={cn("relative shrink-0 transition-[width] duration-200", collapsed ? "w-[72px]" : "w-[240px]")}>
      <aside className={cn("flex h-full flex-col border-r border-zinc-200 bg-white py-5", collapsed ? "px-3" : "px-4")}>
        <div className={cn("mb-7 flex items-center gap-2", collapsed ? "justify-center" : "justify-start")}>
          <button type="button" onClick={() => navigate(routes.wbs(projectId))} className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-100", collapsed && "justify-center")}>
            <div className="relative grid h-7 w-7 place-items-center rounded-lg bg-zinc-950 text-[11px] font-bold text-white">
              W
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#fd312e]" />
            </div>
            {!collapsed && <span className="text-[14px] font-semibold tracking-tight text-zinc-950">WBS Keeper</span>}
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto">
          <div>
            {!collapsed && <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.05em] text-zinc-400">WBS Workflow</p>}
            <div className="space-y-0.5">
              <NavItem href={routes.wbs(projectId)} icon={Table2} label="WBS 현황" active={pathname === "/wbs"} collapsed={collapsed} onClick={() => navigate(routes.wbs(projectId))} />
              <NavItem href={routes.meetingNote(projectId)} icon={FileText} label="회의록 분석" active={pathname === "/meeting-note"} collapsed={collapsed} onClick={() => navigate(routes.meetingNote(projectId))} />
            </div>
          </div>

          <div>
            {!collapsed && <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.05em] text-zinc-400">Project</p>}
            <div className="space-y-0.5">
              <NavItem href={routes.upload(projectId)} icon={GitBranch} label="WBS 설정" active={pathname === "/upload"} collapsed={collapsed} onClick={() => navigate(routes.upload(projectId))} />
            </div>
          </div>
        </nav>

        <div className="border-t border-zinc-200 pt-4">
          <button type="button" className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-zinc-100", collapsed && "justify-center")}>
            <div className="grid h-7 w-7 place-items-center rounded-full bg-zinc-950 text-[11px] font-semibold text-white">JK</div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-zinc-950">최보람</p>
                  <p className="truncate text-[11px] text-zinc-400">PM · AI UX Review</p>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              </>
            )}
          </button>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        className="absolute right-[-15px] top-10 z-20 grid h-7 w-7 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-zinc-900"
        aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>
    </div>
  );
}
