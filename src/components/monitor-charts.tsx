"use client";

import { useId, useMemo } from "react";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { PatternArea } from "@/components/charts/pattern-area";
import { PatternPreset } from "@/components/charts/pattern-preset";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { useChart } from "@/components/charts/chart-context";

/*
 * Monitor detail volume chart (Bklit UI): all mentions as a dotted area with
 * a coral line, negative mentions as a thin muted line, local day columns for
 * a week, and one event marker (the latest alert, else the busiest bucket).
 * Time reads left to right in both languages.
 */

type Point = { t: string; total: number; negative: number };
export type ChartEvent = { t: string; label: string };

const intl = (locale: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: "UTC", ...o });

/** Vertical rules at local midnight with weekday names centred in each day. */
function DayColumns({ points, locale }: { points: Point[]; locale: string }) {
  const { xScale, innerHeight, innerWidth } = useChart();
  const f = intl(locale, { weekday: "long" });
  const starts = points.map((p, i) => ({ p, i })).filter(({ p }) => p.t.endsWith("T00:00:00"));
  return (
    <g aria-hidden>
      {starts.map(({ p }, k) => {
        const x0 = xScale(new Date(`${p.t}Z`));
        const next = starts[k + 1];
        const x1 = next ? xScale(new Date(`${next.p.t}Z`)) : innerWidth;
        return (
          <g key={p.t}>
            <line x1={x0} x2={x0} y1={0} y2={innerHeight} stroke="var(--color-line)" strokeWidth={1} />
            <text x={(x0 + x1) / 2} y={innerHeight + 20} fontSize={12} textAnchor="middle" fill="var(--color-faint)">
              {f.format(new Date(`${p.t}Z`))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function EventMarker({ points, event }: { points: Point[]; event: ChartEvent }) {
  const { xScale, yScale, innerHeight, innerWidth } = useChart();
  let i = points.findIndex((p, k) => p.t <= event.t && (k === points.length - 1 || points[k + 1].t > event.t));
  if (i < 0) i = 0;
  const p = points[i];
  const x = xScale(new Date(`${p.t}Z`));
  const y = yScale(p.total);
  const label = event.label.length > 26 ? `${event.label.slice(0, 25)}…` : event.label;
  const anchor = x < 60 ? "start" : x > innerWidth - 60 ? "end" : "middle";
  return (
    <g aria-hidden>
      <line x1={x} x2={x} y1={-4} y2={innerHeight} stroke="var(--color-faint)" strokeDasharray="2 4" />
      <circle cx={x} cy={y} r={5} strokeWidth={2} fill="var(--color-surface)" stroke="var(--color-ink)" />
      <text x={x} y={-10} textAnchor={anchor} fontSize={12} fill="var(--color-muted)">
        {label}
      </text>
    </g>
  );
}

export function MonitorVolumeChart({
  points,
  hours,
  locale,
  labels,
  event,
  height = 236,
}: {
  points: Point[];
  hours: number;
  locale: string;
  labels: { all: string; negative: string };
  event: ChartEvent | null;
  height?: number;
}) {
  const id = `mv${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const data = useMemo(() => points.map((p) => ({ ...p, date: new Date(`${p.t}Z`) })), [points]);
  const titles = useMemo(() => {
    const f = intl(locale, { weekday: "short", day: "numeric", month: "short", ...(hours < 24 ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}) });
    return points.map((p) => f.format(new Date(`${p.t}Z`)));
  }, [points, hours, locale]);
  const ticks = useMemo(() => points.map((p) => intl(locale, { day: "numeric", month: "short" }).format(new Date(`${p.t}Z`))), [points, locale]);
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  if (data.length < 2) return null;
  return (
    <div dir="ltr">
      <AreaChart data={data} aspectRatio="auto" style={{ height }} margin={{ top: 26, right: 4, bottom: 28, left: 4 }} animationDuration={600}>
        <PatternPreset id={id} preset="circles-dense" color="var(--chart-1)" />
        {hours < 24 && <DayColumns points={points} locale={locale} />}
        <PatternArea dataKey="total" fill={`url(#${id})`} fadeBottom={100} />
        <Area dataKey="total" fillOpacity={0} strokeWidth={1.6} stroke="var(--chart-1)" />
        <Area dataKey="negative" fillOpacity={0} strokeWidth={1.3} stroke="var(--color-muted)" showHighlight={false} />
        {event && <EventMarker points={points} event={event} />}
        {hours >= 24 && <XAxis labels={ticks} numTicks={6} />}
        <ChartTooltip
          dateLabels={titles}
          showDatePill={false}
          dotColor="var(--chart-1)"
          rows={(p) => [
            { color: "var(--chart-1)", label: labels.all, value: nf.format(Number(p.total)) },
            { color: "var(--color-muted)", label: labels.negative, value: nf.format(Number(p.negative)) },
          ]}
        />
      </AreaChart>
    </div>
  );
}
