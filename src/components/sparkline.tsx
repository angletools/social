import { DotDefs } from "./dots";

/** Tiny inline trend as a dot-matrix area (server-rendered SVG). */
export function Sparkline({
  values,
  color = "var(--color-chart)",
  height = 32,
  width = 120,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 2 - ((v - min) / span) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `sl-${Math.abs(values.reduce((a, v, i) => a + v * (i + 1), 0)).toString(36).slice(0, 8)}-${values.length}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className="block max-w-full" style={{ direction: "ltr" }}>
      <defs>
        <DotDefs id={id} color={color} bottom={0.15} />
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} mask={`url(#${id}-fade)`} />
    </svg>
  );
}
