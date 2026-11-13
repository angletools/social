import { cond, uniqueSource } from "./analytics";
import { db } from "./db";

export type SeriesUnit = "hour" | "4h" | "day";
/** `t` is the local wall-clock start of the bucket in the org timezone, written as "YYYY-MM-DDTHH:00:00" (no offset). */
export type ReportSeries = { unit: SeriesUnit; points: { t: string; n: number }[] };

const safeTz = (tz?: string) => (tz && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(tz) ? tz : "Asia/Riyadh");

/** Bucket size for a report period: hourly for a day, every 4 hours for a week, daily beyond. */
export function seriesUnit(days: number): SeriesUnit {
  return days <= 1.5 ? "hour" : days <= 8 ? "4h" : "day";
}

/** Local wall-clock time of an instant, as a Date whose UTC fields hold the local time. */
export function toLocalNaive(d: Date, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24));
}

const iso = (d: Date) => d.toISOString().slice(0, 19);

/**
 * Fills hourly counts into evenly sized buckets from the start to the end of
 * a period. Pure, so it can be tested without a database.
 */
export function bucketHours(hourly: Map<string, number>, startLocal: Date, endLocal: Date, unit: SeriesUnit): ReportSeries {
  const step = unit === "hour" ? 1 : unit === "4h" ? 4 : 24;
  const first = new Date(startLocal);
  first.setUTCMinutes(0, 0, 0);
  if (unit === "day") first.setUTCHours(0);
  else first.setUTCHours(Math.floor(first.getUTCHours() / step) * step);
  const points: { t: string; n: number }[] = [];
  const ms = step * 3600_000;
  // Include every intersecting bucket; dropping a partial bucket loses real evidence.
  for (let b = first.getTime(); b < endLocal.getTime(); b += ms) {
    let n = 0;
    for (let h = 0; h < step; h++) n += hourly.get(iso(new Date(b + h * 3600_000))) ?? 0;
    points.push({ t: iso(new Date(b)), n });
  }
  if (points.length === 0) points.push({ t: iso(first), n: 0 });
  return { unit, points };
}

/** Mention volume over a report's period, bucketed in the organization's timezone. */
export async function getReportSeries(opts: { orgId: string; monitorId?: string | null; start: Date; end: Date; tz?: string }): Promise<ReportSeries> {
  const tz = safeTz(opts.tz);
  const rows = await db.$queryRaw<{ h: string; n: bigint }[]>`
    SELECT to_char(date_trunc('hour', (m."publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD"T"HH24:MI:SS') AS h, count(*) AS n
    FROM ${uniqueSource({ orgId: opts.orgId, days: 1, start: opts.start, end: opts.end, monitorId: opts.monitorId ?? undefined })} m
    WHERE ${cond({ orgId: opts.orgId, days: 1, start: opts.start, end: opts.end, monitorId: opts.monitorId ?? undefined })}
    GROUP BY 1`;
  const hourly = new Map(rows.map((r) => [r.h, Number(r.n)]));
  const days = (opts.end.getTime() - opts.start.getTime()) / 86400_000;
  return bucketHours(hourly, toLocalNaive(opts.start, tz), toLocalNaive(opts.end, tz), seriesUnit(days));
}
