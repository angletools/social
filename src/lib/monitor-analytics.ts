import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { fillDays, netSentiment, pctChange } from "./monitor-stats";

const DEFAULT_TZ = "Asia/Riyadh";
const safeTz = (tz?: string) => (tz && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(tz) ? tz : DEFAULT_TZ);

/** Local calendar `days` ago at 00:00 in `tz`, as a UTC timestamp, plus that date (YYYY-MM-DD). */
const localStart = (tz: string, daysBack: number) => Prisma.sql`
  SELECT ((date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${daysBack}::int)) AT TIME ZONE ${tz}) AT TIME ZONE 'UTC' AS s,
         to_char(date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${daysBack}::int), 'YYYY-MM-DD') AS d0`;

export type MonitorWeek = {
  days: { day: string; n: number }[];
  total: number;
  previous: number;
  change: number | null;
  net: number;
  analysed: number;
};

/**
 * The last 7 calendar days per monitor, in the organization's timezone
 * (today included, so far): daily counts for the sparkline, the total, the
 * same stretch of time one week earlier, and net sentiment.
 */
export async function getMonitorsWeek(orgId: string, tz?: string): Promise<{ days: string[]; byMonitor: Map<string, MonitorWeek> }> {
  const zone = safeTz(tz);
  const [b] = await db.$queryRaw<{ s: Date; d0: string }[]>(localStart(zone, 6));
  const [daily, totals] = await Promise.all([
    db.$queryRaw<{ id: string; day: string; n: bigint }[]>`
      SELECT m."monitorId" AS id,
             to_char(date_trunc('day', (m."publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS day,
             count(*) AS n
      FROM "Mention" m
      WHERE m."organizationId" = ${orgId} AND m."relevant" = true AND m."publishedAt" >= ${b.s}
      GROUP BY 1, 2`,
    db.$queryRaw<{ id: string; cur: bigint; prev: bigint; pos: bigint; neg: bigint; analysed: bigint }[]>`
      SELECT m."monitorId" AS id,
             count(*) FILTER (WHERE m."publishedAt" >= ${b.s}) AS cur,
             count(*) FILTER (WHERE m."publishedAt" < (now() AT TIME ZONE 'UTC') - interval '7 days') AS prev,
             count(*) FILTER (WHERE m."publishedAt" >= ${b.s} AND m.sentiment = 'POSITIVE') AS pos,
             count(*) FILTER (WHERE m."publishedAt" >= ${b.s} AND m.sentiment = 'NEGATIVE') AS neg,
             count(*) FILTER (WHERE m."publishedAt" >= ${b.s} AND m.sentiment IS NOT NULL) AS analysed
      FROM "Mention" m
      WHERE m."organizationId" = ${orgId} AND m."relevant" = true
        AND m."publishedAt" >= ${b.s}::timestamp - interval '7 days'
      GROUP BY 1`,
  ]);
  const days = fillDays(b.d0, 7, []).map((d) => d.day);
  const rowsBy = new Map<string, { day: string; n: number }[]>();
  for (const r of daily) {
    const list = rowsBy.get(r.id) ?? [];
    list.push({ day: r.day, n: Number(r.n) });
    rowsBy.set(r.id, list);
  }
  const byMonitor = new Map<string, MonitorWeek>();
  const ids = new Set([...rowsBy.keys(), ...totals.map((t) => t.id)]);
  for (const id of ids) {
    const t = totals.find((x) => x.id === id);
    const total = Number(t?.cur ?? 0);
    const previous = Number(t?.prev ?? 0);
    const analysed = Number(t?.analysed ?? 0);
    byMonitor.set(id, {
      days: fillDays(b.d0, 7, rowsBy.get(id) ?? []),
      total,
      previous,
      change: pctChange(total, previous),
      net: netSentiment(Number(t?.pos ?? 0), Number(t?.neg ?? 0), analysed),
      analysed,
    });
  }
  return { days, byMonitor };
}

export type SeriesPoint = { t: string; total: number; negative: number };

/**
 * Mentions and negative mentions for one monitor over the last `days`
 * calendar days in the organization's timezone: 4-hour buckets for a week,
 * daily buckets for longer ranges. Empty buckets are included. `t` is the
 * local wall-clock start of the bucket (no offset).
 */
export async function getMonitorSeries(s: { orgId: string; monitorId: string; days: number; tz?: string }) {
  const zone = safeTz(s.tz);
  const hours = s.days <= 7 ? 4 : 24;
  const step = `${hours} hours`;
  const [b] = await db.$queryRaw<{ s: Date; d0: string }[]>(localStart(zone, s.days - 1));
  const bucket = (col: Prisma.Sql) => Prisma.sql`date_bin(${step}::interval, ${col}, timestamp '2000-01-01')`;
  const local = (col: Prisma.Sql) => Prisma.sql`((${col}) AT TIME ZONE 'UTC') AT TIME ZONE ${zone}`;
  const rows = await db.$queryRaw<{ t: string; total: bigint; neg: bigint }[]>`
    WITH buckets AS (
      SELECT generate_series(${bucket(local(Prisma.sql`${b.s}::timestamp`))}, ${bucket(Prisma.sql`now() AT TIME ZONE ${zone}`)}, ${step}::interval) AS b
    ), hits AS (
      SELECT ${bucket(local(Prisma.sql`m."publishedAt"`))} AS b, count(*) AS total, count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg
      FROM "Mention" m
      WHERE m."organizationId" = ${s.orgId} AND m."monitorId" = ${s.monitorId} AND m."relevant" = true AND m."publishedAt" >= ${b.s}
      GROUP BY 1
    )
    SELECT to_char(buckets.b, 'YYYY-MM-DD"T"HH24:MI:SS') AS t, coalesce(hits.total, 0) AS total, coalesce(hits.neg, 0) AS neg
    FROM buckets LEFT JOIN hits ON hits.b = buckets.b
    ORDER BY buckets.b`;
  return {
    hours,
    firstDay: b.d0,
    points: rows.map((r): SeriesPoint => ({ t: r.t, total: Number(r.total), negative: Number(r.neg) })),
  };
}

/**
 * Alerts that fired for this monitor in the window, newest first, as chart
 * events. `t` is local wall-clock time in the organization's timezone.
 */
export async function getMonitorEvents(s: { orgId: string; monitorId: string; since: Date; tz?: string }) {
  const zone = safeTz(s.tz);
  const rows = await db.$queryRaw<{ t: string; name: string; severity: string }[]>`
    SELECT to_char((n."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD"T"HH24:MI:SS') AS t,
           r.name AS name, n.severity::text AS severity
    FROM "Notification" n JOIN "AlertRule" r ON r.id = n."ruleId"
    WHERE n."organizationId" = ${s.orgId} AND r."monitorId" = ${s.monitorId} AND n."createdAt" >= ${s.since}
    ORDER BY n."createdAt" DESC LIMIT 5`;
  return rows;
}
