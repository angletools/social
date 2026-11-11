"use client";

import { useMemo, useState } from "react";
import { dowHourLabel, gridExtremes, weekdayName } from "@/lib/insight";

const SCALE = [35, 55, 78, 100];

/** Colour for a cell at intensity v (0..1): the track below 12%, then the chart colour mixed in. */
const cellBg = (v: number) => (v < 0.12 ? "var(--color-dot-track)" : `color-mix(in srgb, var(--color-chart) ${Math.round(15 + v * 85)}%, transparent)`);

/**
 * When people post: weekday × hour grid in the org timezone, stretched to the
 * card width. Hovering a cell replaces the peak/quiet line with that hour.
 */
export function PostingHeatmapCard({
  grid,
  locale,
  labels,
}: {
  grid: number[][];
  locale: string;
  labels: { less: string; more: string; posts: string; peak: string; quiet: string; summary: string };
}) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = useMemo(() => Math.max(1, ...grid.flat()), [grid]);
  const ext = useMemo(() => gridExtremes(grid), [grid]);
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const days = Array.from({ length: 7 }, (_, d) => weekdayName(d, locale, locale === "ar" ? "long" : "short"));
  const summary = ext ? labels.summary.replace("{peak}", dowHourLabel(ext.peak.dow, ext.peak.hour, locale)).replace("{quiet}", dowHourLabel(ext.quiet.dow, ext.quiet.hour, locale)) : "";

  return (
    <>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          dir="ltr"
          role="img"
          aria-label={summary}
          className="grid min-w-[560px] grid-cols-[56px_repeat(24,minmax(0,1fr))] items-center gap-1"
          onMouseLeave={() => setHover(null)}
        >
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <span dir={locale === "ar" ? "rtl" : "ltr"} className="pe-2 text-end text-[12.5px] text-muted" aria-hidden>
                {days[d]}
              </span>
              {row.map((n, h) => (
                <span
                  key={h}
                  aria-hidden
                  onMouseEnter={() => setHover({ d, h })}
                  className="aspect-square rounded-[4px] transition-[outline-color] duration-100"
                  style={{ background: cellBg(n / max), outline: hover?.d === d && hover.h === h ? "1.5px solid var(--color-ink)" : "1.5px solid transparent", outlineOffset: 1 }}
                />
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[11.5px] text-faint ltr-nums" aria-hidden>
              {h % 6 === 0 ? `${String(h).padStart(2, "0")}:00` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px] text-muted">
        <span aria-live="polite" className="min-h-5">
          {hover ? (
            <>
              <span className="font-semibold text-ink">{dowHourLabel(hover.d, hover.h, locale)}</span> · <span className="ltr-nums">{labels.posts.replace("{n}", nf.format(grid[hover.d]?.[hover.h] ?? 0))}</span>
            </>
          ) : ext ? (
            <>
              {labels.peak} <span className="font-semibold text-ink">{dowHourLabel(ext.peak.dow, ext.peak.hour, locale)}</span> · {labels.quiet}{" "}
              <span className="font-semibold text-ink">{dowHourLabel(ext.quiet.dow, ext.quiet.hour, locale)}</span>
            </>
          ) : null}
        </span>
        <span dir="ltr" className="flex items-center gap-1 text-[12px] text-faint" aria-hidden>
          {labels.less}
          <span className="h-3 w-3 rounded-[3px]" style={{ background: "var(--color-dot-track)" }} />
          {SCALE.map((p) => (
            <span key={p} className="h-3 w-3 rounded-[3px]" style={{ background: p === 100 ? "var(--color-chart)" : `color-mix(in srgb, var(--color-chart) ${p}%, transparent)` }} />
          ))}
          {labels.more}
        </span>
      </div>
    </>
  );
}
