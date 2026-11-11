"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// CSS variables so charts follow the light / dark theme.
const C = { pos: "var(--color-pos)", neu: "var(--color-neu)", neg: "var(--color-neg)", brand: "var(--color-brand-600)", grid: "var(--color-line)", axis: "var(--color-faint)", ink: "var(--color-ink)", sunken: "var(--color-sunken)", muted: "var(--color-line-strong)" };

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

/** Charts stay left-to-right in both languages so time reads consistently. */
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
  return (
    <div dir="ltr" style={{ height: height ?? 288 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            {(["pos", "neu", "neg"] as const).map((k) => (
              <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C[k]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={C[k]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="t" tickFormatter={(t) => fmtTick(t, unit, locale)} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtTick(String(t), unit, locale)} />
          <Legend iconType="circle" iconSize={7} verticalAlign="top" align="right" height={28} wrapperStyle={{ fontSize: 12, color: C.axis }} />
          <Area type="monotone" dataKey="negative" name={labels.negative} stackId="1" stroke={C.neg} fill="url(#g-neg)" strokeWidth={1.75} animationDuration={500} />
          <Area type="monotone" dataKey="neutral" name={labels.neutral} stackId="1" stroke={C.neu} fill="url(#g-neu)" strokeWidth={1.75} animationDuration={500} />
          <Area type="monotone" dataKey="positive" name={labels.positive} stackId="1" stroke={C.pos} fill="url(#g-pos)" strokeWidth={1.75} animationDuration={500} />
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
  return (
    <div dir="ltr" style={{ height: Math.max(120, data.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: C.ink }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} cursor={{ fill: C.sunken }} />
          <Bar animationDuration={500} dataKey="share" radius={[0, 6, 6, 0]} barSize={18} label={{ position: "right", fontSize: 12, fill: C.ink, formatter: (v: unknown) => `${v}%` }}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.isCompetitor ? C.muted : C.brand} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Net sentiment line (−100..100) with a zero baseline. */
export function NetTrendChart({ points, unit, locale, height = 220 }: { points: { t: string; net: number; total: number }[]; unit: string; locale: string; height?: number }) {
  return (
    <div dir="ltr" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="g-net" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.brand} stopOpacity={0.18} />
              <stop offset="100%" stopColor={C.brand} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="t" tickFormatter={(t) => fmtTick(t, unit, locale)} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke={C.axis} strokeDasharray="3 3" />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtTick(String(t), unit, locale)} formatter={(v) => [v, ""]} separator="" />
          <Area type="monotone" dataKey="net" stroke={C.brand} fill="url(#g-net)" strokeWidth={2} animationDuration={500} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
