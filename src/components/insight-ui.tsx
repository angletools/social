/**
 * Building blocks for Home, Intelligence and Studio (canvas v2): the surface
 * panel, link segmented controls, dotted sparklines, share rings and the
 * notched sentiment gauge. Plain SVG so they render on the server.
 */
import Link from "next/link";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { gaugeNotches, sparkPath } from "@/lib/insight";

/** Surface card used across the v2 pages: 20px radius, 24px padding. */
export function Panel({ children, className, as: As = "section", ...rest }: { children: React.ReactNode; className?: string; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("rounded-[20px] bg-surface p-5 sm:p-6", className)} {...rest}>
      {children}
    </As>
  );
}

/** Muted panel heading with an optional quiet action on the far side. */
export function PanelHead({ title, aside, className, id }: { title: React.ReactNode; aside?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 id={id} className="text-[15px] font-normal leading-6 text-muted">
        {title}
      </h2>
      {aside}
    </div>
  );
}

/** Bold panel heading (Intelligence). */
export function PanelTitle({ children, aside, id, className }: { children: React.ReactNode; aside?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 id={id} className="text-[16px] font-semibold leading-6">
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** Segmented control made of links (keeps state in the URL). */
export function Segmented({ items, label, className, size = "md" }: { items: { key: string; label: string; href: string; on: boolean }[]; label: string; className?: string; size?: "md" | "lg" }) {
  return (
    <nav aria-label={label} className={cn("inline-flex gap-0.5 rounded-[12px] bg-sunken p-[3px]", className)}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          prefetch={false}
          aria-current={it.on ? "page" : undefined}
          className={cn(
            "flex items-center justify-center whitespace-nowrap rounded-[9px] px-3.5 text-[13.5px] transition-colors duration-150",
            size === "lg" ? "h-[34px] flex-1 text-[14px]" : "h-8",
            it.on ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** Period switcher in the v2 style. Keeps other query params. */
export function RangeSegmented({ days, labels, basePath, params = {}, label }: { days: number; labels: Record<string, string>; basePath: string; params?: Record<string, string | undefined>; label: string }) {
  return (
    <Segmented
      label={label}
      items={["1", "7", "30", "90"].map((d) => {
        const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), days: d } as Record<string, string>);
        return { key: d, label: labels[d], href: `${basePath}?${qs}`, on: String(days) === d };
      })}
    />
  );
}

/** Replace `{key}` in a template with React nodes (for bold or linked parts of a sentence). */
export function richFmt(template: string, parts: Record<string, React.ReactNode>) {
  return template.split(/(\{\w+\})/g).map((chunk, i) => {
    const m = /^\{(\w+)\}$/.exec(chunk);
    return <Fragment key={i}>{m ? (parts[m[1]] ?? chunk) : chunk}</Fragment>;
  });
}

/** Thin line sparkline (KPI tiles). */
export function LineSpark({ values, width = 80, height = 28, color = "var(--color-chart)", className }: { values: number[]; width?: number; height?: number; color?: string; className?: string }) {
  if (values.length < 2) return <span style={{ width, height }} className={className} />;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className={cn("block shrink-0 overflow-visible", className)} style={{ direction: "ltr" }}>
      <path d={sparkPath(values, width, height, 3)} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

/** Dotted area sparkline with a fade towards the bottom (trend cards, Studio list). */
export function DotSpark({ values, id, width = 300, height = 60, color = "var(--color-chart)", dot = 4.5, className }: { values: number[]; id: string; width?: number; height?: number; color?: string; dot?: number; className?: string }) {
  if (values.length < 2) return null;
  const line = sparkPath(values, width, height, 4);
  const pid = `ds-${id}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden className={cn("block h-auto w-full overflow-visible", className)} style={{ direction: "ltr" }}>
      <defs>
        <pattern id={`${pid}-p`} width={dot} height={dot} patternUnits="userSpaceOnUse">
          <circle cx={dot / 2} cy={dot / 2} r={dot * 0.3} fill={color} />
        </pattern>
        <linearGradient id={`${pid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
        <mask id={`${pid}-m`} maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill={`url(#${pid}-g)`} />
        </mask>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${pid}-p)`} mask={`url(#${pid}-m)`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Concentric share rings (0–100 each), largest outside. Starts at 12 o'clock. */
export function Rings({ items, size = 120, outer = 70, step = 16, stroke = 10, label }: { items: { label: string; value: number; color: string }[]; size?: number; outer?: number; step?: number; stroke?: number; label: string }) {
  const box = (outer + stroke) * 2;
  const c = box / 2;
  return (
    <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} role="img" aria-label={`${label}: ${items.map((i) => `${i.label} ${Math.round(i.value)}%`).join(", ")}`} className="shrink-0" style={{ direction: "ltr" }}>
      {items.map((it, k) => {
        const r = outer - k * step;
        if (r <= stroke) return null;
        const len = 2 * Math.PI * r;
        const v = Math.max(0, Math.min(100, it.value));
        return (
          <g key={it.label}>
            <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} stroke="var(--color-line)" />
            {v > 0 && <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={it.color} strokeDasharray={`${((v / 100) * len).toFixed(1)} 9999`} transform={`rotate(-90 ${c} ${c})`} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Legend row for rings and shares. */
export function LegendRow({ color, label, value, strong, href }: { color: string; label: string; value: string; strong?: boolean; href?: string }) {
  const body = (
    <>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className={cn("min-w-0 flex-1 truncate", strong && "font-semibold")}>{label}</span>
      <span className="text-muted ltr-nums">{value}</span>
    </>
  );
  return href ? (
    <Link prefetch={false} href={href} className="flex items-center gap-2.5 transition-colors hover:text-muted">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-2.5">{body}</div>
  );
}

/**
 * Net sentiment on a notched 234° arc, −100 to +100. In Arabic the arc fills
 * from the right, so "more positive" reads in the page's direction.
 */
export function NotchGauge({
  net,
  sub,
  subTone,
  mirror,
  ends,
  label,
  compact,
}: {
  net: number;
  sub?: string;
  subTone?: "pos" | "neg" | "faint";
  mirror?: boolean;
  ends?: [string, string];
  label: string;
  compact?: boolean;
}) {
  const notches = compact ? gaugeNotches(net, { count: 31, cx: 120, cy: 104, r1: 80, r2: 100, mirror }) : gaugeNotches(net, { mirror });
  const value = `${net > 0 ? "+" : net < 0 ? "−" : ""}${Math.abs(net)}`;
  const toneVar = subTone === "pos" ? "var(--color-pos)" : subTone === "neg" ? "var(--color-neg)" : "var(--color-faint)";
  return (
    <div className={cn("mx-auto w-full", compact ? "max-w-[200px]" : "max-w-[280px]")}>
      <svg viewBox={compact ? "0 0 240 156" : "0 0 240 150"} className="block h-auto w-full" role="img" aria-label={label} style={{ direction: "ltr" }}>
        {notches.map((n, i) => (
          <line key={i} x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} strokeWidth={compact ? 5 : 3} strokeLinecap="round" stroke={n.on ? "var(--color-ink)" : "var(--color-line)"} />
        ))}
        <text x="120" y={compact ? 118 : 112} textAnchor="middle" fontSize={compact ? 44 : 38} fontWeight={600} fill="var(--color-ink)" className="ltr-nums">
          {value}
        </text>
        {sub && !compact && (
          <text x="120" y="136" textAnchor="middle" fontSize="13" fontWeight={600} fill={toneVar}>
            {sub}
          </text>
        )}
      </svg>
      {ends && (
        <div dir="ltr" className="mx-auto -mt-1.5 flex w-full max-w-[236px] justify-between text-[12.5px] text-faint ltr-nums" aria-hidden>
          <span>{mirror ? ends[1] : ends[0]}</span>
          <span>{mirror ? ends[0] : ends[1]}</span>
        </div>
      )}
    </div>
  );
}

/** Text colour class for a sentiment-ish tone. */
export const toneText = (tone: "pos" | "neg" | "faint" | "muted" | "ink") =>
  ({ pos: "text-pos", neg: "text-neg", faint: "text-faint", muted: "text-muted", ink: "text-ink" })[tone];
