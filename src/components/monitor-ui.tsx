/**
 * Small pieces shared by the monitors list and detail pages: the type tile,
 * the status pill and the dotted 7-day sparkline (plain SVG, server-rendered).
 */
import type { MonitorType } from "@prisma/client";
import { AtSign, Hash, Lightbulb, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { sparkPaths } from "@/lib/monitor-stats";

/** Brand/keyword mark: two rings, as on the board. */
function Target(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function MonitorGlyph({ type, competitor, className }: { type: MonitorType; competitor?: boolean; className?: string }) {
  const Icon = competitor ? Users : { KEYWORD: Target, HASHTAG: Hash, PROFILE: AtSign, TOPIC: Lightbulb }[type];
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}

export function MonitorTile({ type, competitor, size = 44 }: { type: MonitorType; competitor?: boolean; size?: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-xl bg-sunken text-ink" style={{ width: size, height: size }}>
      <MonitorGlyph type={type} competitor={competitor} className="h-5 w-5" />
    </span>
  );
}

export function MonitorStatus({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn("inline-flex h-7 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[9px] px-[11px] text-[13px] font-semibold", active ? "text-pos" : "bg-sunken text-muted")}
      style={active ? { background: "color-mix(in srgb, var(--color-pos) 11%, transparent)" } : undefined}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

/** Pattern and mask defs the sparklines point at. Render once per page. */
export function SparkDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <pattern id="mm-dot-chart" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
          <circle cx="2.25" cy="2.25" r="1.35" fill="var(--color-chart)" />
        </pattern>
        <pattern id="mm-dot-faint" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
          <circle cx="2.25" cy="2.25" r="1.35" fill="var(--color-faint)" />
        </pattern>
        <linearGradient id="mm-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
        <mask id="mm-fade-mask" maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill="url(#mm-fade)" />
        </mask>
      </defs>
    </svg>
  );
}

/**
 * 7-day sparkline: dotted area under a thin line. A paused monitor's line
 * stops where it paused and continues as a faint dashed rule.
 */
export function WeekSpark({ values, pausedAt, label, width = 150, height = 40, className }: { values: number[]; pausedAt?: number | null; label: string; width?: number; height?: number; className?: string }) {
  const paused = pausedAt !== null && pausedAt !== undefined;
  const { line, area, last } = sparkPaths(values, width, height, pausedAt);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label} className={cn("block shrink-0 overflow-visible", className)} style={{ direction: "ltr" }}>
      <path d={area} fill={`url(#${paused ? "mm-dot-faint" : "mm-dot-chart"})`} mask="url(#mm-fade-mask)" />
      <path d={line} fill="none" strokeWidth={1.5} stroke={paused ? "var(--color-faint)" : "var(--color-chart)"} vectorEffect="non-scaling-stroke" />
      {paused && last[0] < width - 1 && (
        <line x1={last[0]} x2={width} y1={last[1]} y2={last[1]} strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round" stroke="var(--color-faint)" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/** Plan usage as a row of pills: used ones in ink, the rest as track. */
export function PlanMeter({ used, limit }: { used: number; limit: number }) {
  const slots = Math.min(Math.max(1, limit), 20);
  const filled = limit <= 20 ? Math.min(used, slots) : Math.round((Math.min(used, limit) / limit) * slots);
  return (
    <span aria-hidden className="flex shrink-0 gap-0.5">
      {Array.from({ length: slots }, (_, i) => (
        <span key={i} className={cn("h-1.5 w-2.5 rounded-full", i < filled ? "bg-ink" : "bg-line")} />
      ))}
    </span>
  );
}
