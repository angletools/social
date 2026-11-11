/**
 * Pure helpers behind Home and Intelligence: busiest/quietest slots, slot
 * labels in both languages, the sharpest drop in a trend, gauge geometry and
 * smooth sparkline paths. No database access so it can be unit-tested.
 */

type Locale = "ar" | "en" | string;

const ar = (l: Locale) => l === "ar";
const intlLocale = (l: Locale) => (ar(l) ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB");

/** Weekday name for 0 = Sunday … 6 = Saturday. */
export function weekdayName(dow: number, locale: Locale, style: "long" | "short" = "long") {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + dow)));
}

/** "9 PM" / "9 مساءً". Arabic names the part of the day the way people say it. */
export function hourLabel(h: number, locale: Locale) {
  const n = h % 12 || 12;
  if (!ar(locale)) return `${n} ${h < 12 ? "AM" : "PM"}`;
  const part = h < 4 ? "ليلًا" : h < 6 ? "فجرًا" : h < 12 ? "صباحًا" : h < 15 ? "ظهرًا" : h < 18 ? "عصرًا" : "مساءً";
  return `${n} ${part}`;
}

/** Weekday + hour: "Sunday, 9 PM" / "الأحد 9 مساءً". */
export function dowHourLabel(dow: number, hour: number, locale: Locale) {
  return `${weekdayName(dow, locale)}${ar(locale) ? " " : ", "}${hourLabel(hour, locale)}`;
}

/**
 * Label for a timeseries bucket. `t` is local wall-clock time (no offset), as
 * returned by getTimeseries, so it is read as UTC.
 */
export function slotLabel(t: string, unit: string, locale: Locale) {
  const d = new Date(`${t}Z`);
  if (unit === "hour") return dowHourLabel(d.getUTCDay(), d.getUTCHours(), locale);
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  return `${weekdayName(d.getUTCDay(), locale)}${ar(locale) ? " " : ", "}${day}`;
}

/** The busiest and the quietest bucket of a series (first one wins on ties). */
export function extremes<T extends { total: number }>(points: T[]): { busiest: T; quietest: T } | null {
  if (points.length < 2 || !points.some((p) => p.total > 0)) return null;
  let busiest = points[0];
  let quietest = points[0];
  for (const p of points) {
    if (p.total > busiest.total) busiest = p;
    if (p.total < quietest.total) quietest = p;
  }
  return { busiest, quietest };
}

/** Peak and quietest cell of a weekday × hour grid. */
export function gridExtremes(grid: number[][]): { peak: { dow: number; hour: number; n: number }; quiet: { dow: number; hour: number; n: number } } | null {
  let peak: { dow: number; hour: number; n: number } | null = null;
  let quiet: { dow: number; hour: number; n: number } | null = null;
  grid.forEach((row, dow) =>
    row.forEach((n, hour) => {
      if (!peak || n > peak.n) peak = { dow, hour, n };
      if (!quiet || n < quiet.n) quiet = { dow, hour, n };
    }),
  );
  if (!peak || !quiet || (peak as { n: number }).n <= 0) return null;
  return { peak, quiet };
}

/** Sum a long series into `n` roughly equal groups (sparklines). */
export function bucketize(values: number[], n: number) {
  if (values.length <= n) return values;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * values.length) / n);
    const b = Math.floor(((i + 1) * values.length) / n);
    out.push(values.slice(a, b).reduce((s, v) => s + v, 0));
  }
  return out;
}

/**
 * The largest fall between two consecutive buckets with enough volume to
 * mean something. Null when nothing fell by at least `minDrop` points.
 */
export function sharpestDrop(points: { t: string; net: number; total: number }[], { minTotal = 5, minDrop = 5 } = {}) {
  let best: { index: number; t: string; drop: number; net: number } | null = null;
  let prev: { net: number } | null = null;
  points.forEach((p, index) => {
    if (p.total < minTotal) return;
    if (prev) {
      const drop = prev.net - p.net;
      if (drop >= minDrop && (!best || drop > best.drop)) best = { index, t: p.t, drop, net: p.net };
    }
    prev = p;
  });
  return best as { index: number; t: string; drop: number; net: number } | null;
}

/** City name for a timezone id, e.g. Asia/Riyadh → Riyadh / الرياض. */
const CITY_AR: Record<string, string> = {
  Riyadh: "الرياض",
  Dubai: "دبي",
  Kuwait: "الكويت",
  Qatar: "الدوحة",
  Bahrain: "البحرين",
  Muscat: "مسقط",
  Cairo: "القاهرة",
  Amman: "عمّان",
  Beirut: "بيروت",
  Baghdad: "بغداد",
  Casablanca: "الدار البيضاء",
  London: "لندن",
};
export function tzCity(tz: string, locale: Locale) {
  const city = (tz.split("/").pop() ?? tz).replace(/_/g, " ");
  return ar(locale) ? (CITY_AR[city] ?? city) : city;
}

/**
 * Notch positions for a −100…100 gauge on a 234° arc (open at the bottom).
 * `mirror` fills from the right, for right-to-left pages.
 */
export function gaugeNotches(net: number, { count = 41, cx = 120, cy = 100, r1 = 78, r2 = 94, width = 240, mirror = false } = {}) {
  const fill = (Math.max(-100, Math.min(100, net)) + 100) / 200;
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const a = Math.PI * 1.15 - t * Math.PI * 1.3;
    const x = (v: number) => +(mirror ? width - v : v).toFixed(1);
    return {
      x1: x(cx + r1 * Math.cos(a)),
      y1: +(cy - r1 * Math.sin(a)).toFixed(1),
      x2: x(cx + r2 * Math.cos(a)),
      y2: +(cy - r2 * Math.sin(a)).toFixed(1),
      on: t <= fill + 1e-9,
    };
  });
}

/** Smooth path through points (Catmull-Rom style, clamped so it never overshoots). */
export function smoothPath(P: [number, number][]) {
  return P.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const a = P[i - 2] || P[i - 1];
    const b = P[i - 1];
    const c = p;
    const d = P[i + 1] || p;
    const lo = Math.min(b[1], c[1]);
    const hi = Math.max(b[1], c[1]);
    const cl = (y: number) => Math.min(hi, Math.max(lo, y));
    const c1 = [b[0] + (c[0] - a[0]) / 6, cl(b[1] + (c[1] - a[1]) / 6)];
    const c2 = [c[0] - (d[0] - b[0]) / 6, cl(c[1] - (d[1] - b[1]) / 6)];
    return `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }).join(" ");
}

/** A sparkline path for `values` inside a w × h box (top padding `pad`). */
export function sparkPath(values: number[], w: number, h: number, pad = 2) {
  if (values.length < 2) return "";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return smoothPath(values.map((v, i) => [(i / (values.length - 1)) * w, h - 1 - ((v - lo) / span) * (h - pad - 1)]));
}

/** Signed delta for display: "+12" / "−3" (true minus). */
export const signedInt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}`;

/** "↗ 13%" style delta glyph. */
export const arrowPct = (n: number) => `${n > 0 ? "↗" : n < 0 ? "↘" : "→"} ${Math.abs(Math.round(n))}%`;

/** Cumulative views of a format's posts over time, sampled at `n` even steps (linear between posts). */
export function viewsCurve(posts: { views: number; publishedAt: Date }[], n = 20) {
  if (posts.length === 0) return [];
  const xs: number[] = [];
  const ys: number[] = [];
  let sum = 0;
  for (const p of posts) {
    sum += p.views;
    xs.push(p.publishedAt.getTime());
    ys.push(sum);
  }
  const t0 = xs[0];
  const t1 = Math.max(t0 + 1, xs[xs.length - 1]);
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const at = t0 + ((t1 - t0) * k) / (n - 1);
    while (j < xs.length - 1 && xs[j + 1] <= at) j++;
    if (j >= xs.length - 1 || at <= xs[0]) out.push(at <= xs[0] ? ys[0] : ys[ys.length - 1]);
    else out.push(ys[j] + ((ys[j + 1] - ys[j]) * (at - xs[j])) / Math.max(1, xs[j + 1] - xs[j]));
  }
  return out;
}
