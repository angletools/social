"use client";

import { useId, useMemo, useState } from "react";

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
        centerValue={net}
        defaultLabel={label}
        prefix={net > 0 ? "+" : undefined}
        totalNotches={41}
        spacing={30}
        notchCornerRadius={2}
        inactiveFillOpacity={0.35}
        activeFill={net < 0 ? "var(--color-neg)" : "var(--color-pos)"}
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
    const f = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "short", timeZone: "UTC" });
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
