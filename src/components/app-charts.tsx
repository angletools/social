"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";

import { aggregateVolume } from "@/lib/chart-buckets";

const watchPhone = (onChange: () => void) => { const q = window.matchMedia("(max-width: 640px)"); q.addEventListener("change", onChange); return () => q.removeEventListener("change", onChange); };
const phoneSnapshot = () => window.matchMedia("(max-width: 640px)").matches;

import { sovColors } from "@/components/chart-colors";

import { AreaChart, Area } from "@/components/charts/area-chart";
import { PatternArea } from "@/components/charts/pattern-area";
import { PatternPreset } from "@/components/charts/pattern-preset";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { useChart } from "@/components/charts/chart-context";
import { RingChart } from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { Gauge } from "@/components/charts/gauge";
import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  useHeatmapInteraction,
} from "@/components/charts/heatmap";

/*
 * App charts, built on Bklit UI (src/components/charts, MIT).
 * Functional dashboard charts: they reveal once on load (short), never on
 * every hover, and Bklit honours prefers-reduced-motion. Time axes always
 * read left-to-right, even in Arabic.
 */

const REVEAL_MS = 600;

type Point = { t: string; positive: number; negative: number; neutral: number; total: number };

// `t` is local wall-clock time already bucketed in the org timezone, so format it as UTC.
function fmtTick(t: string, unit: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
    timeZone: "UTC",
    ...(unit === "hour" ? { hour: "numeric" } : { day: "numeric", month: "short" }),
  }).format(new Date(`${t}Z`));
}

function fmtTitle(t: string, unit: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(unit === "hour" ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(`${t}Z`));
}

const nf = (locale: string) => new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
const usePatternId = (p: string) => `${p}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

/** Conversation volume: dotted area with a thin line, sentiment split in the tooltip. */
export function VolumeChart({
  points,
  unit,
  locale,
  labels,
  height = 288,
}: {
  points: Point[];
  unit: string;
  locale: string;
  labels: { positive: string; neutral: string; negative: string; total?: string };
  height?: number;
}) {
  const id = usePatternId("vol");
  const data = useMemo(() => points.map((p) => ({ ...p, date: new Date(`${p.t}Z`) })), [points]);
  const ticks = useMemo(() => points.map((p) => fmtTick(p.t, unit, locale)), [points, unit, locale]);
  const titles = useMemo(() => points.map((p) => fmtTitle(p.t, unit, locale)), [points, unit, locale]);
  const n = nf(locale);
  if (data.length < 2) return null;
  return (
    <div dir="ltr">
      <AreaChart data={data} aspectRatio="auto" style={{ height }} margin={{ top: 16, right: 12, bottom: 28, left: 40 }} animationDuration={REVEAL_MS}>
        <PatternPreset id={id} preset="circles-dense" color="var(--chart-1)" />
        <Grid horizontal numTicksRows={4} />
        <PatternArea dataKey="total" fill={`url(#${id})`} fadeBottom={100} />
        <Area dataKey="total" fillOpacity={0} strokeWidth={1.5} stroke="var(--chart-1)" />
        <YAxis numTicks={4} />
        <XAxis labels={ticks} numTicks={6} />
        <ChartTooltip
          dateLabels={titles}
          showDatePill={false}
          dotColor="var(--chart-1)"
          rows={(p) => [
            { color: "var(--chart-1)", label: labels.total ?? "Total", value: n.format(Number(p.total)) },
            { color: "var(--color-pos)", label: labels.positive, value: n.format(Number(p.positive)) },
            { color: "var(--color-neu)", label: labels.neutral, value: n.format(Number(p.neutral)) },
            { color: "var(--color-neg)", label: labels.negative, value: n.format(Number(p.negative)) },
          ]}
        />
      </AreaChart>
    </div>
  );
}

/** Dashed zero baseline for charts that cross zero. */
function ZeroLine() {
  const { yScale, innerWidth } = useChart();
  const [lo, hi] = yScale.domain();
  if (!(lo < 0 && hi > 0)) return null;
  const y = yScale(0);
  return <line x1={0} x2={innerWidth} y1={y} y2={y} stroke="var(--chart-label)" strokeDasharray="3 4" strokeWidth={1} />;
}

/** Net sentiment (−100…100) over time. */
export function NetTrendChart({
  points,
  unit,
  locale,
  label = "Net sentiment",
  height = 240,
}: {
  points: { t: string; net: number; total: number }[];
  unit: string;
  locale: string;
  label?: string;
  height?: number;
}) {
  const id = usePatternId("net");
  const data = useMemo(() => points.filter((p) => typeof p.net === "number").map((p) => ({ net: p.net, t: p.t, date: new Date(`${p.t}Z`) })), [points]);
  const ticks = useMemo(() => data.map((p) => fmtTick(p.t, unit, locale)), [data, unit, locale]);
  const titles = useMemo(() => data.map((p) => fmtTitle(p.t, unit, locale)), [data, unit, locale]);
  if (data.length < 2) return null;
  return (
    <div dir="ltr">
      <AreaChart data={data} aspectRatio="auto" style={{ height }} margin={{ top: 16, right: 12, bottom: 28, left: 36 }} animationDuration={REVEAL_MS}>
        <PatternPreset id={id} preset="circles-dense" color="var(--chart-1)" />
        <Grid horizontal numTicksRows={4} />
        <PatternArea dataKey="net" fill={`url(#${id})`} fadeBottom={100} />
        <Area dataKey="net" fillOpacity={0} strokeWidth={1.75} stroke="var(--chart-1)" />
        <ZeroLine />
        <YAxis numTicks={4} formatLargeNumbers={false} />
        <XAxis labels={ticks} numTicks={6} />
        <ChartTooltip dateLabels={titles} showDatePill={false} dotColor="var(--chart-1)" rows={(p) => [{ color: "var(--chart-1)", label, value: `${Number(p.net) > 0 ? "+" : ""}${p.net}` }]} />
      </AreaChart>
    </div>
  );
}

/** Shares (0–100%) as concentric rings; the centre shows the top item, or the hovered one. */
export function ShareRings({ items, centerLabel, max = 5 }: { items: { label: string; value: number; color: string }[]; centerLabel: string; max?: number }) {
  const rings = useMemo(() => items.slice(0, max).map((d) => ({ label: d.label, value: d.value, maxValue: 100, color: d.color })), [items, max]);
  const [hovered, setHovered] = useState<number | null>(null);
  if (!rings.length) return null;
  const d = rings[hovered ?? 0];
  return (
    <div dir="ltr" role="group" aria-label={centerLabel} className="relative mx-auto w-full max-w-[240px]">
      <RingChart data={rings} strokeWidth={10} ringGap={5} baseInnerRadius={44} onHoverChange={setHovered}>
        {rings.map((r, i) => (
          <Ring key={r.label} index={i} showGlow={false} />
        ))}
      </RingChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[22px] font-semibold leading-none tracking-tight ltr-nums">{Math.round(d.value)}%</span>
        <span className="mt-1 max-w-[7rem] truncate text-[11.5px] text-muted">{d.label}</span>
      </div>
    </div>
  );
}

/** Share of voice: the brand ring is coral, competitors neutral. */
export function ShareOfVoiceChart({ data, totalLabel }: { data: { name: string; share: number; isCompetitor: boolean }[]; totalLabel: string }) {
  const colors = sovColors(data);
  return <ShareRings centerLabel={totalLabel} items={data.map((d, i) => ({ label: d.name, value: d.share, color: colors[i] }))} />;
}

/** Net sentiment as a notched gauge from −100 to +100. */
export function SentimentGauge({ net, label }: { net: number; label: string }) {
  return (
    <div dir="ltr" className="mx-auto w-full max-w-[300px]">
      <Gauge
        value={Math.max(0, Math.min(100, (net + 100) / 2))}
        centerValue={Math.abs(net)}
        defaultLabel={label}
        prefix={net > 0 ? "+" : net < 0 ? "\u2212" : undefined}
        totalNotches={41}
        spacing={30}
        notchCornerRadius={2}
        inactiveFillOpacity={0.35}
        activeFill="var(--color-ink)"
        inactiveFill="var(--color-line-strong)"
        minWidth={220}
      />
    </div>
  );
}

/* When people post: weekday × hour heatmap (org timezone). */

export type PostingGrid = number[][]; // [weekday 0=Sun..6][hour 0..23]

const CELL = 22;
const GAP = 3;

/** Map raw counts to Bklit's five intensity levels (0 = none, 1–4 = quartiles of the non-zero hours). */
function toLevels(grid: PostingGrid) {
  const nz = grid.flat().filter((v) => v > 0).sort((a, b) => a - b);
  const q = (f: number) => nz[Math.min(nz.length - 1, Math.floor(f * nz.length))] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (v: number) => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4);
}

function HeatmapReadout({ grid, days, hourFmt, countLabel, idle }: { grid: PostingGrid; days: string[]; hourFmt: (h: number) => string; countLabel: (n: number) => string; idle: string }) {
  const { tooltipData } = useHeatmapInteraction();
  return (
    <p className="h-5 text-[13px] text-muted" aria-live="polite">
      {tooltipData ? (
        <>
          <span className="font-medium text-ink">
            {days[tooltipData.row]} · <span className="ltr-nums">{hourFmt(tooltipData.column)}</span>
          </span>{" "}
          · {countLabel(grid[tooltipData.row]?.[tooltipData.column] ?? 0)}
        </>
      ) : (
        idle
      )}
    </p>
  );
}

export function PostingHeatmap({
  grid,
  locale,
  labels,
}: {
  grid: PostingGrid;
  locale: string;
  labels: { less: string; more: string; posts: (n: number) => string; idle: string };
}) {
  const days = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { weekday: "short", timeZone: "UTC" });
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, d) => f.format(new Date(Date.UTC(2023, 0, 1 + d))));
  }, [locale]);
  const hourFmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const data = useMemo(() => {
    const level = toLevels(grid);
    return Array.from({ length: 24 }, (_, h) => ({
      bin: h,
      bins: Array.from({ length: 7 }, (_, d) => ({ bin: d, count: level(grid[d]?.[h] ?? 0), date: new Date(Date.UTC(2023, 0, 1 + d, h)) })),
    }));
  }, [grid]);
  const width = 24 * CELL + 23 * GAP;
  return (
    <HeatmapInteractionProvider>
      <HeatmapInteractionBoundary>
        <HeatmapReadout grid={grid} days={days} hourFmt={hourFmt} countLabel={labels.posts} idle={labels.idle} />
        <div className="mt-3 overflow-x-auto pb-1">
          <div dir="ltr" className="grid w-max grid-cols-[2.5rem_auto] gap-x-2">
            <ul className="flex flex-col justify-around text-[11.5px] text-faint" aria-hidden>
              {days.map((d) => (
                <li key={d} className="text-end leading-none">
                  {d}
                </li>
              ))}
            </ul>
            <div style={{ width }}>
              <HeatmapChart data={data} layout="fluid" binSize={CELL} gap={GAP} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} animationDuration={REVEAL_MS}>
                <HeatmapCells cornerRadius={4} />
              </HeatmapChart>
            </div>
            <span />
            <div className="relative mt-1.5 h-4 text-[11.5px] text-faint ltr-nums" aria-hidden>
              {[0, 6, 12, 18].map((h) => (
                <span key={h} className="absolute" style={{ left: h * (CELL + GAP) }}>
                  {hourFmt(h)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 w-max" dir="ltr" style={{ width: width + 48 }}>
          <HeatmapLegend lessLabel={labels.less} moreLabel={labels.more} />
        </div>
      </HeatmapInteractionBoundary>
    </HeatmapInteractionProvider>
  );
}

/* ---------- Home and Intelligence (canvas v2) ---------- */

/** Vertical line at each local midnight, with the weekday centred in its day. */
function DayGrid({ points, locale, labels = true }: { points: { t: string }[]; locale: string; labels?: boolean }) {
  const { xScale, innerHeight, innerWidth } = useChart();
  const f = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { weekday: "short", timeZone: "UTC" });
  const starts = points.map((p) => new Date(`${p.t}Z`)).filter((d) => d.getUTCHours() === 0);
  const edges = starts.map((d) => xScale(d));
  return (
    <g aria-hidden>
      {edges.map((x, i) => (
        <line key={i} x1={x} x2={x} y1={0} y2={innerHeight} stroke="var(--color-line)" />
      ))}
      {labels &&
        starts.map((d, i) => {
          const a = edges[i];
          const b = edges[i + 1] ?? innerWidth;
          if (b - a < 28) return null;
          return (
            <text key={i} x={(a + b) / 2} y={innerHeight + 16} textAnchor="middle" fontSize={11.5} fill="var(--color-faint)">
              {f.format(d)}
            </text>
          );
        })}
    </g>
  );
}

/** Dashed guide and ring on one point of the series (busiest hour, an event). */
function PointMarker({ index, valueKey, label, top = 0 }: { index: number; valueKey: string; label?: string; top?: number }) {
  const { xScale, yScale, data, innerHeight, innerWidth } = useChart();
  const d = data[index] as Record<string, unknown> | undefined;
  if (!d) return null;
  const x = xScale(d.date as Date);
  const y = yScale(Number(d[valueKey]));
  return (
    <g aria-hidden>
      <line x1={x} x2={x} y1={label ? top + 6 : 0} y2={label ? y : innerHeight} stroke="var(--color-faint)" strokeDasharray="2 4" />
      <circle cx={x} cy={y} r={5} strokeWidth={2} fill="var(--color-surface)" stroke="var(--color-ink)" />
      {label && (
        <text
          x={x}
          y={top - 2}
          textAnchor={x < 60 ? "start" : x > innerWidth - 60 ? "end" : "middle"}
          dx={x < 60 ? -6 : x > innerWidth - 60 ? 6 : 0}
          fontSize={12}
          fill="var(--color-muted)"
          style={{ unicodeBidi: "plaintext" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Mentions over time (Home): dotted area and a thin line, a day grid with
 * weekday labels on hourly multi-day ranges, and the busiest bucket marked.
 */
export function MentionsChart({
  points: rawPoints,
  unit: rawUnit,
  locale,
  labels,
  height = 220,
  compact = false,
  ariaLabel,
}: {
  points: Point[];
  unit: string;
  locale: string;
  labels: { positive: string; neutral: string; negative: string; total: string };
  height?: number;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const phone = useSyncExternalStore(watchPhone, phoneSnapshot, () => false);
  const aggregate = phone && rawUnit === "hour" && rawPoints.length > 48;
  const points = useMemo(() => aggregate ? aggregateVolume(rawPoints) : rawPoints, [rawPoints, aggregate]);
  const unit = aggregate ? "4h" : rawUnit;
  const id = usePatternId("mx");
  const data = useMemo(() => points.map((p) => ({ ...p, date: new Date(`${p.t}Z`) })), [points]);
  const ticks = useMemo(() => points.map((p) => fmtTick(p.t, unit, locale)), [points, unit, locale]);
  const titles = useMemo(() => points.map((p) => fmtTitle(p.t, unit, locale)), [points, unit, locale]);
  const peak = useMemo(() => points.reduce((best, p, i) => (p.total > (points[best]?.total ?? -1) ? i : best), 0), [points]);
  const n = nf(locale);
  if (data.length < 2) return null;
  const dayGrid = unit === "hour" && points.length > 30;
  return (
    <div dir="ltr" role="img" aria-label={ariaLabel}>
      <AreaChart
        data={data}
        aspectRatio="auto"
        style={{ height }}
        margin={{ top: compact ? 6 : 10, right: 0, bottom: compact ? 2 : 24, left: compact ? 0 : 32 }}
        animationDuration={REVEAL_MS}
      >
        <PatternPreset id={id} preset="circles-dense" color="var(--chart-1)" />
        {dayGrid && !compact && <DayGrid points={points} locale={locale} />}
        <PatternArea dataKey="total" fill={`url(#${id})`} fadeBottom={90} />
        <Area dataKey="total" fillOpacity={0} strokeWidth={1.6} stroke="var(--chart-1)" />
        {!compact && points[peak]?.total > 0 && <PointMarker index={peak} valueKey="total" />}
        {!compact && <YAxis numTicks={3} />}
        {!compact && !dayGrid && <XAxis labels={ticks} numTicks={6} />}
        <ChartTooltip
          dateLabels={titles}
          showDatePill={false}
          dotColor="var(--chart-1)"
          rows={(p) => [
            { color: "var(--chart-1)", label: labels.total, value: n.format(Number(p.total)) },
            { color: "var(--color-pos)", label: labels.positive, value: n.format(Number(p.positive)) },
            { color: "var(--color-neu)", label: labels.neutral, value: n.format(Number(p.neutral)) },
            { color: "var(--color-neg)", label: labels.negative, value: n.format(Number(p.negative)) },
            ...(Number(p.total) > Number(p.positive) + Number(p.negative) + Number(p.neutral) ? [{ color: "var(--color-faint)", label: locale === "ar" ? "غير مصنف" : "Unclassified", value: n.format(Number(p.total) - Number(p.positive) - Number(p.negative) - Number(p.neutral)) }] : []),
          ]}
        />
      </AreaChart>
      {!compact && <p className="mt-2 text-[11.5px] text-faint" dir={locale === "ar" ? "rtl" : "ltr"}>{fmtTitle(points[0].t, unit, locale)} – {fmtTitle(points.at(-1)!.t, unit, locale)} · {locale === "ar" ? (aggregate ? "منشورات كل ٤ ساعات" : "منشورات لكل فترة") : (aggregate ? "Posts per 4 hours" : `Posts per ${unit}`)}</p>}
    </div>
  );
}

/** Dashed zero line across the plot (drawn whenever 0 is inside the domain). */
function ZeroGuide() {
  const { yScale, innerWidth } = useChart();
  const [lo, hi] = yScale.domain();
  if (!(lo <= 0 && hi >= 0)) return null;
  const y = yScale(0);
  return <line x1={0} x2={innerWidth} y1={y} y2={y} stroke="var(--color-faint)" strokeDasharray="2 6" aria-hidden />;
}

/** Net sentiment over time (Intelligence), with an optional event marker. */
export function NetEventChart({
  points,
  unit,
  locale,
  label,
  event,
  height = 250,
}: {
  points: { t: string; net: number; total: number }[];
  unit: string;
  locale: string;
  label: string;
  event?: { index: number; label: string } | null;
  height?: number | string;
}) {
  const id = usePatternId("ne");
  const data = useMemo(() => points.map((p) => ({ net: p.net, t: p.t, date: new Date(`${p.t}Z`) })), [points]);
  const titles = useMemo(() => data.map((p) => fmtTitle(p.t, unit, locale)), [data, unit, locale]);
  const ticks = data.map(p => fmtTick(p.t, unit, locale));
  if (data.length < 2) return null;
  return (
    <div dir="ltr" role="img" aria-label={label}>
      <AreaChart data={data} aspectRatio="auto" style={{ height }} margin={{ top: 30, right: 0, bottom: 28, left: 36 }} animationDuration={REVEAL_MS}>
        <PatternPreset id={id} preset="circles-dense" color="var(--chart-1)" />
        <ZeroGuide />
        <YAxis numTicks={4} formatLargeNumbers={false} />
        <XAxis labels={ticks} numTicks={4} />
        <PatternArea dataKey="net" fill={`url(#${id})`} fadeBottom={90} />
        <Area dataKey="net" fillOpacity={0} strokeWidth={1.8} stroke="var(--chart-1)" />
        {event && <PointMarker index={event.index} valueKey="net" label={event.label} top={-12} />}
        <ChartTooltip
          dateLabels={titles}
          showDatePill={false}
          dotColor="var(--chart-1)"
          rows={(p) => [{ color: "var(--chart-1)", label, value: `${Number(p.net) > 0 ? "+" : Number(p.net) < 0 ? "−" : ""}${Math.abs(Number(p.net))}` }]}
        />
      </AreaChart>
      <p className="mt-2 text-[11.5px] text-faint" dir={locale === "ar" ? "rtl" : "ltr"}>{titles[0]} – {titles.at(-1)} · {locale === "ar" ? "صافي المشاعر من −١٠٠ إلى +١٠٠؛ الصفر متوازن. الفترات الخالية لا تعني الحياد." : "Net sentiment: −100 to +100; 0 is balanced. Empty periods do not establish neutrality."}</p>
    </div>
  );
}
