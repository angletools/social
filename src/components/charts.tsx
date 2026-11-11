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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const C = { pos: "#16a34a", neu: "#94a3b8", neg: "#dc2626", brand: "#0b8a6b", grid: "#eef2f0" };

type Point = { t: string; positive: number; negative: number; neutral: number; total: number };

function fmtTick(t: string, unit: string, locale: string) {
  const d = new Date(t);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", unit === "hour" ? { hour: "numeric" } : { day: "numeric", month: "short" }).format(d);
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #e6ebe9", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.06)" };

/** Charts stay left-to-right in both languages so time reads consistently. */
export function VolumeChart({
  points,
  unit,
  locale,
  labels,
}: {
  points: Point[];
  unit: string;
  locale: string;
  labels: { positive: string; neutral: string; negative: string };
}) {
  return (
    <div dir="ltr" className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            {(["pos", "neu", "neg"] as const).map((k) => (
              <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C[k]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C[k]} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="t" tickFormatter={(t) => fmtTick(t, unit, locale)} tick={{ fontSize: 11, fill: "#5b6965" }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: "#5b6965" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtTick(String(t), unit, locale)} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="negative" name={labels.negative} stackId="1" stroke={C.neg} fill="url(#g-neg)" strokeWidth={2} />
          <Area type="monotone" dataKey="neutral" name={labels.neutral} stackId="1" stroke={C.neu} fill="url(#g-neu)" strokeWidth={2} />
          <Area type="monotone" dataKey="positive" name={labels.positive} stackId="1" stroke={C.pos} fill="url(#g-pos)" strokeWidth={2} />
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
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="none">
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold">{centerValue}</span>
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
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "#0f1a17" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} cursor={{ fill: "#f6f8f7" }} />
          <Bar dataKey="share" radius={[0, 8, 8, 0]} barSize={22} label={{ position: "right", fontSize: 12, formatter: (v: unknown) => `${v}%` }}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.isCompetitor ? "#cbd5e1" : C.brand} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
