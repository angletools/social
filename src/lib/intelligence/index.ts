import { Prisma, type Intent } from "@prisma/client";
import { db } from "../db";
import { uniqueSource, cond, getDialectBreakdown, getKpis, getTimeseries, type Scope } from "../analytics";
import { emergingThemes, net, pctChange, rankDrivers, type BriefContent, type TopicPeriodRow } from "./core";

export * from "./core";

/** Per-topic volume and sentiment for the current and previous equal window. */
export async function getTopicPeriods(s: Scope): Promise<TopicPeriodRow[]> {
  const rows = await db.$queryRaw<
    { key: string; en: string | null; ar: string | null; n: bigint; pos: bigint; neg: bigint; pn: bigint; ppos: bigint; pneg: bigint }[]
  >`
    WITH cur AS (
      SELECT t.key, count(*) AS n,
             count(*) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
             count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg
      FROM ${uniqueSource(s)} m CROSS JOIN LATERAL unnest(m.topics) AS t(key) WHERE ${cond(s)} GROUP BY 1
    ), prev AS (
      SELECT t.key, count(*) AS n,
             count(*) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
             count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg
      FROM ${uniqueSource(s, true)} m CROSS JOIN LATERAL unnest(m.topics) AS t(key) WHERE ${cond(s, true)} GROUP BY 1
    )
    SELECT cur.key, tp."labelEn" AS en, tp."labelAr" AS ar, cur.n, cur.pos, cur.neg,
           coalesce(prev.n, 0) AS pn, coalesce(prev.pos, 0) AS ppos, coalesce(prev.neg, 0) AS pneg
    FROM cur LEFT JOIN prev ON prev.key = cur.key
    LEFT JOIN "Topic" tp ON tp."organizationId" = ${s.orgId} AND tp.key = cur.key
    ORDER BY cur.n DESC LIMIT 60`;
  return rows.map((r) => ({
    key: r.key,
    labelEn: r.en ?? r.key,
    labelAr: r.ar ?? r.en ?? r.key,
    n: Number(r.n),
    pos: Number(r.pos),
    neg: Number(r.neg),
    prevN: Number(r.pn),
    prevPos: Number(r.ppos),
    prevNeg: Number(r.pneg),
  }));
}

/** Why people post, with how each intent feels and how it moved. */
export async function getIntentSentiment(s: Scope) {
  const rows = await db.$queryRaw<{ intent: Intent; n: bigint; pos: bigint; neg: bigint; pn: bigint }[]>`
    WITH cur AS (
      SELECT m.intent, count(*) AS n,
             count(*) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
             count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg
      FROM ${uniqueSource(s)} m WHERE ${cond(s)} AND m.intent IS NOT NULL GROUP BY 1
    ), prev AS (
      SELECT m.intent, count(*) AS n FROM ${uniqueSource(s, true)} m WHERE ${cond(s, true)} AND m.intent IS NOT NULL GROUP BY 1
    )
    SELECT cur.intent, cur.n, cur.pos, cur.neg, coalesce(prev.n, 0) AS pn
    FROM cur LEFT JOIN prev ON prev.intent = cur.intent ORDER BY cur.n DESC`;
  return rows.map((r) => {
    const n = Number(r.n);
    return { intent: r.intent, count: n, prevCount: Number(r.pn), change: pctChange(n, Number(r.pn)), net: net(Number(r.pos), Number(r.neg), n) };
  });
}

/** Complaints and churn signals grouped by topic, each with its most-seen post. */
export async function getRecurringComplaints(s: Scope, limit = 5) {
  const rows = await db.$queryRaw<{ key: string; en: string | null; ar: string | null; n: bigint; churn: bigint; id: string; text: string }[]>`
    WITH c AS (
      SELECT m.id, m.text, m.intent, t.key, (m.likes + m.comments + m.shares + coalesce(m."authorFollowers", 0) / 100) AS w
      FROM ${uniqueSource(s)} m CROSS JOIN LATERAL unnest(m.topics) AS t(key)
      WHERE ${cond(s)} AND m.intent IN ('COMPLAINT', 'CHURN_RISK')
    ), g AS (
      SELECT key, count(*) AS n, count(*) FILTER (WHERE intent = 'CHURN_RISK') AS churn FROM c GROUP BY key
    )
    SELECT g.key, tp."labelEn" AS en, tp."labelAr" AS ar, g.n, g.churn, top.id, top.text
    FROM g
    CROSS JOIN LATERAL (SELECT c.id, c.text FROM c WHERE c.key = g.key ORDER BY c.w DESC LIMIT 1) top
    LEFT JOIN "Topic" tp ON tp."organizationId" = ${s.orgId} AND tp.key = g.key
    ORDER BY g.n DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    key: r.key,
    labelEn: r.en ?? r.key,
    labelAr: r.ar ?? r.en ?? r.key,
    count: Number(r.n),
    churn: Number(r.churn),
    example: { id: r.id, text: r.text.slice(0, 220) },
  }));
}

/** A few representative mention ids per topic (most engaged negative first). */
export async function getTopicExamples(s: Scope, keys: string[], per = 3) {
  if (!keys.length) return {} as Record<string, string[]>;
  const rows = await db.$queryRaw<{ key: string; id: string }[]>`
    SELECT key, id FROM (
      SELECT t.key, m.id, row_number() OVER (
        PARTITION BY t.key ORDER BY (m.sentiment = 'NEGATIVE') DESC, (m.likes + m.comments + m.shares) DESC
      ) AS rn
      FROM ${uniqueSource(s)} m CROSS JOIN LATERAL unnest(m.topics) AS t(key)
      WHERE ${cond(s)} AND t.key IN (${Prisma.join(keys)})
    ) x WHERE rn <= ${per}`;
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.key] ??= []).push(r.id);
  return out;
}

/** Everything the Intelligence hub shows for a scope. */
export async function getIntelligence(s: Scope) {
  const [kpis, series, topics, intents, dialects, complaints] = await Promise.all([
    getKpis(s),
    getTimeseries(s),
    getTopicPeriods(s),
    getIntentSentiment(s),
    getDialectBreakdown(s),
    getRecurringComplaints(s),
  ]);
  const churn = intents.find((i) => i.intent === "CHURN_RISK");
  // Comparisons only mean something when the previous window has real data
  // (e.g. not right after a monitor was created).
  const comparable = kpis.previousMentions >= Math.max(20, kpis.mentions * 0.25);
  return {
    comparable,
    kpis,
    trend: series.points.map((p) => ({ t: p.t, net: p.net, total: p.total })),
    unit: series.unit,
    negative: rankDrivers(topics, "negative", kpis.negative),
    positive: rankDrivers(topics, "positive", kpis.positive),
    emerging: comparable ? emergingThemes(topics) : [],
    intents,
    dialects,
    complaints,
    churn: { count: churn?.count ?? 0, prev: churn?.prevCount ?? 0, change: churn?.change ?? null },
  };
}

export type Intelligence = Awaited<ReturnType<typeof getIntelligence>>;

export function readBrief(row: { summaryAr: string; summaryEn: string; themes: unknown } | null): BriefContent | null {
  if (!row) return null;
  return { summaryAr: row.summaryAr, summaryEn: row.summaryEn, themes: Array.isArray(row.themes) ? (row.themes as BriefContent["themes"]) : [] };
}
