/**
 * Static SVG visuals for the report document. They render on the server and
 * print exactly as they look on screen (no reveal animation to catch mid-way).
 */
import type { ReportSeries } from "@/lib/report-series";

const W = 792;
const H = 140;

type Pt = [number, number];

/** Monotone-ish cubic smoothing that never overshoots between two points (from the board). */
function smooth(P: Pt[]) {
  return P.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const a = P[i - 2] ?? P[i - 1];
    const b = P[i - 1];
    const c = p;
    const d = P[i + 1] ?? p;
    const lo = Math.min(b[1], c[1]);
    const hi = Math.max(b[1], c[1]);
    const cl = (y: number) => Math.min(hi, Math.max(lo, y));
    const c1 = [b[0] + (c[0] - a[0]) / 6, cl(b[1] + (c[1] - a[1]) / 6)];
    const c2 = [c[0] - (d[0] - b[0]) / 6, cl(c[1] - (d[1] - b[1]) / 6)];
    return `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }).join(" ");
}

const naive = (t: string) => new Date(`${t}Z`);

export function ConversationChart({ series, locale, peakLabel, ariaLabel }: { series: ReportSeries; locale: string; peakLabel: (n: number, when: string) => string; ariaLabel: string }) {
  const pts = series.points;
  if (pts.length < 2) return null;
  const loc = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB";
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { timeZone: "UTC", ...o });
  const mx = Math.max(1, ...pts.map((p) => p.n));
  const X = (i: number) => (i / (pts.length - 1)) * W;
  const Y = (v: number) => H - (v / mx) * 118;
  const line = smooth(pts.map((p, i) => [X(i), Y(p.n)]));
  const pk = pts.findIndex((p) => p.n === mx);

  // Gridlines and labels: days for a week, every 6 hours for a day, about 7 dates for longer periods.
  const ticks: { x: number; tx: number; label: string }[] = [];
  if (series.unit === "4h") {
    const starts = pts.map((p, i) => (naive(p.t).getUTCHours() === 0 ? i : -1)).filter((i) => i >= 0);
    const bounds = starts[0] === 0 ? starts : [0, ...starts];
    bounds.forEach((s, k) => {
      const e = bounds[k + 1] ?? pts.length - 1;
      if (e - s < 3) return; // a partial day at the edge has no room for a label
      ticks.push({ x: X(s), tx: (X(s) + X(e)) / 2, label: fmt({ weekday: "short", day: "numeric" }).format(naive(pts[s].t)) });
    });
  } else {
    const step = series.unit === "hour" ? 6 : Math.max(1, Math.ceil(pts.length / 7));
    for (let i = 0; i < pts.length; i += step) {
      const label = series.unit === "hour" ? fmt({ hour: "numeric", hour12: true }).format(naive(pts[i].t)) : fmt({ day: "numeric", month: "short" }).format(naive(pts[i].t));
      ticks.push({ x: X(i), tx: Math.min(W - 24, Math.max(24, X(i))), label });
    }
  }
  const peakWhen = series.unit === "day" ? fmt({ weekday: "short", day: "numeric", month: "short" }).format(naive(pts[pk].t)) : fmt({ weekday: "short", hour: "numeric", hour12: true }).format(naive(pts[pk].t));
  const px = X(pk);
  const flip = px > W * 0.62;
  // Arabic labels read right-to-left inside the left-to-right time axis; text-anchor follows the text direction.
  const rtl = locale === "ar";
  const textDir = { direction: rtl ? "rtl" : "ltr" } as const;
  const anchor = flip !== rtl ? "end" : "start";
  return (
    <div dir="ltr">
      <svg viewBox={`0 0 ${W} 164`} className="block h-auto w-full overflow-visible" role="img" aria-label={ariaLabel}>
        <defs>
          <pattern id="rd-dots" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
            <circle cx="2.25" cy="2.25" r="1.35" style={{ fill: "var(--color-chart)" }} />
          </pattern>
          <linearGradient id="rd-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.1" />
          </linearGradient>
          <mask id="rd-mask" maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill="url(#rd-fade)" />
          </mask>
        </defs>
        {ticks.map((g, i) => (
          <g key={i}>
            <line x1={g.x} x2={g.x} y1={0} y2={H} style={{ stroke: "var(--color-sunken)" }} />
            <text x={g.tx} y={160} fontSize={12} textAnchor="middle" style={{ fill: "var(--color-faint)", ...textDir }}>
              {g.label}
            </text>
          </g>
        ))}
        <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#rd-dots)" mask="url(#rd-mask)" />
        <path d={line} fill="none" strokeWidth={1.6} style={{ stroke: "var(--color-chart)" }} />
        <line x1={px} x2={px} y1={16} y2={H} strokeDasharray="2 4" style={{ stroke: "var(--color-faint)" }} />
        <circle cx={px} cy={Y(mx)} r={5} strokeWidth={2} style={{ fill: "var(--color-surface)", stroke: "var(--color-ink)" }} />
        <text x={flip ? px - 10 : px + 10} y={10} fontSize={12} textAnchor={anchor} style={{ fill: "var(--color-muted)", ...textDir }}>
          {peakLabel(mx, peakWhen)}
        </text>
      </svg>
    </div>
  );
}

/** Net sentiment as a notched half-gauge with the value in the middle. */
export function NetGauge({ net, label }: { net: number; label: string }) {
  const frac = (Math.max(-100, Math.min(100, net)) + 100) / 200;
  const text = `${net > 0 ? "+" : net < 0 ? "−" : ""}${Math.abs(net)}`;
  return (
    <svg viewBox="0 0 240 150" width={132} height={83} className="shrink-0" role="img" aria-label={`${label} ${text}`} style={{ direction: "ltr" }}>
      {Array.from({ length: 41 }, (_, i) => {
        const t = i / 40;
        const a = Math.PI * 1.15 - t * Math.PI * 1.3;
        const [cx, cy, r1, r2] = [120, 100, 76, 96];
        return (
          <line
            key={i}
            x1={(cx + r1 * Math.cos(a)).toFixed(1)}
            y1={(cy - r1 * Math.sin(a)).toFixed(1)}
            x2={(cx + r2 * Math.cos(a)).toFixed(1)}
            y2={(cy - r2 * Math.sin(a)).toFixed(1)}
            strokeWidth={4}
            strokeLinecap="round"
            style={{ stroke: t <= frac ? "var(--color-ink)" : "var(--color-dot-track)" }}
          />
        );
      })}
      <text x={120} y={118} textAnchor="middle" fontSize={46} fontWeight={600} style={{ fill: "var(--color-ink)" }}>
        {text}
      </text>
    </svg>
  );
}
