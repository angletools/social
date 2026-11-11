"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DotDefs, DotBar } from "./dots";

// CSS variables so charts follow the light / dark theme.
const C = { chart: "var(--color-chart)", pos: "var(--color-pos)", neu: "var(--color-neu)", neg: "var(--color-neg)", brand: "var(--color-brand-600)", grid: "var(--color-line)", axis: "var(--color-faint)", ink: "var(--color-ink)", sunken: "var(--color-sunken)", muted: "var(--color-line-strong)" };

type Point = { t: string; positive: number; negative: number; neutral: number; total: number };

// `t` is already local wall-clock time (bucketed in the org timezone), so format it as UTC.
function fmtTick(t: string, unit: string, locale: string) {
  const d = new Date(`${t}Z`);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
    timeZone: "UTC",
    ...(unit === "hour" ? { hour: "numeric" } : { day: "numeric", month: "short" }),
  }).format(d);
}

const tooltipStyle = { borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 12, boxShadow: "var(--shadow-pop)", padding: "8px 10px" };

const useDotId = (p: string) => `${p}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

function VolumeTip({ active, payload, label, unit, locale, labels }: { active?: boolean; payload?: { payload: Point }[]; label?: string; unit: string; locale: string; labels: { positive: string; neutral: string; negative: string } }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <div className="mb-1 font-semibold">{fmtTick(String(label), unit, locale)} · {p.total}</div>
      {(
        [
          ["positive", "var(--color-pos)"],
          ["neutral", "var(--color-neu)"],
          ["negative", "var(--color-neg)"],
        ] as const
      ).map(([k, c]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
          <span className="flex-1">{labels[k]}</span>
          <span className="tnum">{p[k]}</span>
        </div>
      ))}
    </div>
  );
}

/** Conversation volume as a dot-matrix area. Charts stay left-to-right in both languages so time reads consistently. */
export function VolumeChart({
  points,
  unit,
  locale,
  labels,
  height,
}: {
  points: Point[];
  unit: string;
  locale: string;
  labels: { positive: string; neutral: string; negative: string };
  height?: number;
}) {
  const id = useDotId("vol");
  return (
    <div dir="ltr" style={{ height: height ?? 288 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <DotDefs id={id} color={C.chart} />
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="t" tickFormatter={(t) => fmtTick(t, unit, locale)} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<VolumeTip unit={unit} locale={locale} labels={labels} />} cursor={{ stroke: C.axis, strokeDasharray: "2 3" }} />
          <Area type="monotone" dataKey="total" stroke="none" fill={`url(#${id})`} mask={`url(#${id}-fade)`} animationDuration={500} activeDot={{ r: 3.5, fill: C.chart, stroke: "var(--color-surface)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, centerLabel, centerValue }: { data: { name: string; value: number; color: string }[]; centerLabel: string; centerValue: string }) {
  return (
    <div dir="ltr" className="relative h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="92%" paddingAngle={1.5} stroke="none" cornerRadius={3}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold tracking-tight ltr-nums">{centerValue}</span>
        <span className="text-xs text-muted">{centerLabel}</span>
      </div>
    </div>
  );
}

export function ShareOfVoiceChart({ data }: { data: { name: string; share: number; isCompetitor: boolean }[] }) {
  const max = Math.max(1, ...data.map((d) => d.share));
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.name} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-3 text-[13.5px]">
          <span className={d.isCompetitor ? "truncate text-muted" : "truncate font-semibold"}>{d.name}</span>
          <DotBar segments={[{ value: d.share, color: d.isCompetitor ? "var(--color-faint)" : C.chart }]} max={max} />
          <span className="text-end text-muted ltr-nums">{d.share}%</span>
        </li>
      ))}
    </ul>
  );
}

/** Net sentiment line (−100..100) with a zero baseline. */
export function NetTrendChart({ points, unit, locale, height = 220 }: { points: { t: string; net: number; total: number }[]; unit: string; locale: string; height?: number }) {
  const id = useDotId("net");
  // Fit the scale to the data (always showing zero) so small moves are visible.
  const vals = points.map((p) => p.net).filter((v): v is number => typeof v === "number");
  const lo = Math.max(-100, Math.floor((Math.min(0, ...vals) - 8) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(0, ...vals) + 8) / 10) * 10);
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <DotDefs id={id} color={C.chart} />
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="t" tickFormatter={(t) => fmtTick(t, unit, locale)} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis domain={[lo, hi]} allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke={C.axis} strokeDasharray="3 3" />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtTick(String(t), unit, locale)} formatter={(v) => [v, ""]} separator="" />
          <Area type="monotone" dataKey="net" baseValue={0} stroke={C.chart} strokeWidth={1.25} strokeOpacity={0.9} fill={`url(#${id})`} mask={`url(#${id}-fade)`} animationDuration={500} connectNulls activeDot={{ r: 3.5, fill: C.chart, stroke: "var(--color-surface)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
