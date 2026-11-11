/**
 * Pure helpers behind the monitors pages (no database access, unit tested):
 * shaping per-day counts, change vs the previous week, the wizard's
 * posts-per-day estimate and keyword highlighting.
 */
import type { MonitorType, Sentiment } from "@prisma/client";

/** Adds `n` days to a YYYY-MM-DD calendar date. */
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `count` days starting at `first`, with zero for days that had no mentions. */
export function fillDays(first: string, count: number, rows: { day: string; n: number }[]) {
  const by = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(first, i);
    return { day, n: by.get(day) ?? 0 };
  });
}

/** Percent change, or null when there is nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** % positive minus % negative among analysed posts (−100…100). */
export function netSentiment(pos: number, neg: number, analysed: number) {
  return analysed ? Math.round(((pos - neg) / analysed) * 100) : 0;
}

/** Index of the day a paused monitor stopped collecting (null while active or when it paused before the window). */
export function pauseIndex(days: string[], pausedAt: Date | null, tz: string) {
  if (!pausedAt) return null;
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(pausedAt);
  const i = days.indexOf(local);
  if (i >= 0) return i;
  return local < (days[0] ?? "") ? 0 : null;
}

// ---------- New-monitor wizard: estimate and highlighting ----------

/** Typical matches per term per day across all six platforms, from our own monitors. */
const BASE_PER_TERM: Record<MonitorType, number> = { KEYWORD: 45, HASHTAG: 110, PROFILE: 55, TOPIC: 8 };

/**
 * A labelled rough guess for posts a day when there is no history to measure:
 * a per-type base, diminishing returns for extra terms, scaled by the share of
 * supported platforms chosen and by language.
 */
export function roughPerDay(input: { type: MonitorType; terms: number; platforms: number; supported: number; languages: number }) {
  if (input.terms <= 0 || input.platforms <= 0) return 0;
  const terms = Math.pow(Math.min(input.terms, 8), 0.7);
  const plat = Math.min(1, input.platforms / Math.max(1, input.supported));
  const lang = input.languages === 1 ? 0.6 : 1;
  const raw = BASE_PER_TERM[input.type] * terms * plat * lang;
  return raw >= 20 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
}

/** Matches a week of collected posts into a daily rate (at least 1 when anything matched). */
export function perDayFromWeek(count: number, days = 7) {
  return count > 0 ? Math.max(1, Math.round(count / days)) : 0;
}

/** How a term appears in post text for each monitor type. */
export function needleFor(type: MonitorType, term: string) {
  const t = term.trim().replace(/^[#@]/, "");
  return type === "HASHTAG" ? `#${t}` : type === "PROFILE" ? `@${t}` : t;
}

/**
 * Splits `text` into plain and highlighted runs for the given needles
 * (case-insensitive, longest needle first so "Nakhla Invest" beats "Nakhla").
 */
export function highlight(text: string, needles: string[]): { t: string; hit: boolean }[] {
  const list = [...new Set(needles.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return [{ t: text, hit: false }];
  const esc = list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${esc.join("|")})`, "gi");
  const out: { t: string; hit: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ t: text.slice(at, i), hit: false });
    out.push({ t: m[0], hit: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at), hit: false });
  return out;
}

// ---------- Monitor detail ----------

/** Colour family for a topic bar: what most people feel about it. */
export function topicTone(count: number, pos: number, neg: number): "neg" | "warn" | "pos" | "neutral" {
  if (!count) return "neutral";
  if (neg / count >= 0.5) return "neg";
  if (pos / count >= 0.5) return "pos";
  if (neg / count >= 0.25) return "warn";
  return "neutral";
}

/**
 * Splits `total` squares between positive, neutral and negative so they add
 * up exactly (largest remainder), for the sentiment square grid.
 */
export function squares(counts: Record<Sentiment, number>, total = 60): Record<Sentiment, number> {
  const keys: Sentiment[] = ["POSITIVE", "NEUTRAL", "NEGATIVE"];
  const sum = keys.reduce((a, k) => a + counts[k], 0);
  if (!sum) return { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  const raw = keys.map((k) => (counts[k] / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw
    .map((v, i) => [v - Math.floor(v), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left > 0) {
        out[i] += 1;
        left -= 1;
      }
    });
  return { POSITIVE: out[0], NEUTRAL: out[1], NEGATIVE: out[2] };
}

// ---------- Sparkline geometry ----------

type Pt = [number, number];

/** Smooth path through points (Catmull-Rom style, control points clamped so it never overshoots). */
export function smoothPath(P: Pt[]) {
  return P.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const a = P[i - 2] ?? P[i - 1];
    const b = P[i - 1];
    const c = p;
    const d = P[i + 1] ?? p;
    const lo = Math.min(b[1], c[1]);
    const hi = Math.max(b[1], c[1]);
    const cl = (y: number) => Math.min(hi, Math.max(lo, y));
    const c1: Pt = [b[0] + (c[0] - a[0]) / 6, cl(b[1] + (c[1] - a[1]) / 6)];
    const c2: Pt = [c[0] - (d[0] - b[0]) / 6, cl(c[1] - (d[1] - b[1]) / 6)];
    return `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }).join(" ");
}

/**
 * Line and area paths for a sparkline `w`×`h`. With `stopAt`, the line ends at
 * that index (a paused monitor) and `last` is where a dashed tail starts.
 */
export function sparkPaths(values: number[], w: number, h: number, stopAt?: number | null) {
  const n = values.length;
  const end = stopAt === null || stopAt === undefined ? n : Math.max(1, Math.min(n, stopAt + 1));
  const shown = values.slice(0, end);
  const max = Math.max(1, ...values) * 1.05;
  const pad = 2;
  const P: Pt[] = shown.map((v, i) => [n > 1 ? (i / (n - 1)) * w : w / 2, h - pad - (v / max) * (h - pad * 2)]);
  if (P.length === 1) P.push([P[0][0] + 0.01, P[0][1]]);
  const line = smoothPath(P);
  const last = P[P.length - 1];
  return { line, area: `${line} L${last[0].toFixed(1)} ${h} L0 ${h} Z`, last };
}

/** "Every hour", "Every 3 hours", "Every 30 minutes", "Every day" from a refresh interval in minutes. */
export function everyLabel(minutes: number, forms: { minutes: string; hour: string; hours: string; day: string }) {
  if (minutes === 1440) return forms.day;
  if (minutes === 60) return forms.hour;
  if (minutes % 60 === 0) return forms.hours.replace("{n}", String(minutes / 60));
  return forms.minutes.replace("{n}", String(minutes));
}
