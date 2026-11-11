/**
 * Dot rows for compact in-list bars (scores, shares, progress). Full charts
 * use Bklit UI via src/components/app-charts.tsx.
 */
import { cn } from "@/lib/utils";

/** Bars: one row is 8px tall with 4px dots every 6px. */
export const BAR_ROW = 8;

/**
 * A bar drawn as rows of dots. Filled dots take the segment colours (in order, from the
 * inline start); the rest are track dots. With `max`, segments are measured against it;
 * otherwise they share the full width.
 */
export function DotBar({
  segments,
  max,
  rows = 1,
  className,
  label,
}: {
  segments: { value: number; color: string }[];
  max?: number;
  rows?: number;
  className?: string;
  label?: string;
}) {
  const total = max ?? (segments.reduce((a, s) => a + s.value, 0) || 1);
  let at = 0;
  const stops: string[] = [];
  for (const s of segments) {
    if (s.value <= 0) continue;
    const from = at;
    at = Math.min(100, at + (s.value / Math.max(1, total)) * 100);
    stops.push(`${s.color} ${from.toFixed(2)}% ${at.toFixed(2)}%`);
  }
  stops.push(`var(--color-dot-track) ${at.toFixed(2)}% 100%`);
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("dot-bar w-full", className)}
      style={{ height: rows * BAR_ROW, ["--dot-fill" as string]: `linear-gradient(var(--dot-dir), ${stops.join(", ")})` }}
    />
  );
}
