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
  barCenterOffset: number;
  width: number;
  height: number;
  muted?: boolean;
};

export function GanttDependencyLayer({ links, layouts, rowHeight, barCenterOffset, width, height, muted }: Props) {
  if (links.length === 0 || width <= 0 || height <= 0) return null;

  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible" width={width} height={height} aria-hidden="true">
      <defs>
        <marker id="dependency-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" className="fill-slate-400" />
        </marker>
      </defs>
      {links.map((link) => {
        const sourceLayout = layouts.get(link.sourceId);
        const targetLayout = layouts.get(link.targetId);
        if (!sourceLayout || !targetLayout) return null;
        const points = getDependencyLinePoints(sourceLayout, targetLayout, rowHeight, barCenterOffset);
        const path = `M ${points.startX} ${points.startY} C ${points.midX} ${points.startY}, ${points.midX} ${points.endY}, ${points.endX} ${points.endY}`;
        return (
          <g key={link.id}>
            <path
              d={path}
              markerEnd="url(#dependency-arrow)"
              className={cn(
                "fill-none transition-opacity",
                "stroke-slate-400 opacity-35",
                muted && "opacity-15"
              )}
              strokeWidth={1.25}
              strokeDasharray="4 4"
            />
          </g>
        );
      })}
    </svg>
  );
}
