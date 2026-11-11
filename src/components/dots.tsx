/**
 * Dot-matrix data marks: the visual language for charts across angle social.
 * Areas are filled with a grid of small dots that fade towards the baseline,
 * bars are rows of dots, and shares are waffle grids of small squares.
 */
import { cn } from "@/lib/utils";

export const DOT = { gap: 4.5, r: 1.35 } as const;
/** Bars: one row is 8px tall with 4px dots every 6px. */
export const BAR_ROW = 8;
export const CORAL = "var(--color-chart)";

/** SVG <defs> for a dot-filled area: use fill={`url(#${id})`} and mask={`url(#${id}-fade)`}. */
export function DotDefs({ id, color = CORAL, top = 1, bottom = 0.08 }: { id: string; color?: string; top?: number; bottom?: number }) {
  return (
    <>
      <pattern id={id} width={DOT.gap} height={DOT.gap} patternUnits="userSpaceOnUse">
        <circle cx={DOT.gap / 2} cy={DOT.gap / 2} r={DOT.r} fill={color} />
      </pattern>
      <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity={top} />
        <stop offset="100%" stopColor="#fff" stopOpacity={bottom} />
      </linearGradient>
      <mask id={`${id}-fade`} maskContentUnits="objectBoundingBox">
        <rect width="1" height="1" fill={`url(#${id}-grad)`} />
      </mask>
    </>
  );
}

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

/** Largest-remainder split of `cells` between the parts, so the squares always add up. */
export function waffleCounts(values: number[], cells: number) {
  const total = values.reduce((a, v) => a + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * cells);
  const out = raw.map(Math.floor);
  let left = cells - out.reduce((a, v) => a + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/** Share breakdown as a grid of small squares (default 20 × 5 = 1% per square). */
export function Waffle({
  parts,
  cols = 20,
  rows = 5,
  className,
  label,
}: {
  parts: { value: number; color: string; name?: string }[];
  cols?: number;
  rows?: number;
  className?: string;
  label?: string;
}) {
  const cells = cols * rows;
  const counts = waffleCounts(
    parts.map((p) => p.value),
    cells,
  );
  const squares: { color: string; name?: string }[] = [];
  parts.forEach((p, i) => {
    for (let k = 0; k < counts[i]; k++) squares.push(p);
  });
  while (squares.length < cells) squares.push({ color: "var(--color-dot-track)" });
  return (
    <div role="img" aria-label={label} className={cn("grid gap-[3px]", className)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {squares.map((s, i) => (
        <span key={i} className="aspect-square rounded-[2px]" style={{ background: s.color }} title={s.name} />
      ))}
    </div>
  );
}
