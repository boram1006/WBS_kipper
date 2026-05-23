"use client";

import { useState } from "react";
import {
  getDependencyLinePoints,
  type DependencyLayoutItem,
  type DependencyLink
} from "@/components/wbs/gantt-dependencies";
import { cn } from "@/lib/utils";

type Props = {
  links: DependencyLink[];
  layouts: Map<string, DependencyLayoutItem>;
  rowHeight: number;
  width: number;
  height: number;
  muted?: boolean;
};

export function GanttDependencyLayer({ links, layouts, rowHeight, width, height, muted }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  if (links.length === 0 || width <= 0 || height <= 0) return null;

  return (
    <svg className="absolute left-0 top-0 z-20 overflow-visible" width={width} height={height} aria-hidden="true">
      <defs>
        <marker id="dependency-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" className="fill-slate-400" />
        </marker>
      </defs>
      {links.map((link) => {
        const sourceLayout = layouts.get(link.sourceId);
        const targetLayout = layouts.get(link.targetId);
        if (!sourceLayout || !targetLayout) return null;
        const points = getDependencyLinePoints(sourceLayout, targetLayout, rowHeight);
        const path = `M ${points.startX} ${points.startY} C ${points.midX} ${points.startY}, ${points.midX} ${points.endY}, ${points.endX} ${points.endY}`;
        const active = hoveredId === link.id;
        return (
          <g
            key={link.id}
            className="pointer-events-auto"
            onMouseEnter={() => setHoveredId(link.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <path d={path} className="fill-none stroke-transparent" strokeWidth={12} />
            <path
              d={path}
              markerEnd="url(#dependency-arrow)"
              className={cn(
                "fill-none transition-opacity",
                active ? "stroke-slate-500 opacity-80" : "stroke-slate-400 opacity-35",
                muted && !active && "opacity-15"
              )}
              strokeWidth={active ? 1.8 : 1.25}
              strokeDasharray="4 4"
            />
            {active && (
              <foreignObject x={Math.min(points.midX + 8, width - 220)} y={Math.min(points.endY + 6, height - 48)} width={210} height={44}>
                <div className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10.5px] font-medium leading-4 text-zinc-600 shadow-sm">
                  <div className="truncate text-zinc-800">{link.sourceTaskName}</div>
                  <div className="truncate">{link.targetTaskName}</div>
                  <div className="text-zinc-400">Finish-to-Start</div>
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}
    </svg>
  );
}
