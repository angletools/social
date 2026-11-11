import { Prisma, type Dialect, type Intent, type Platform, type Sentiment } from "@prisma/client";
import { db } from "./db";

export type Scope = { orgId: string; days: number; monitorId?: string; platform?: Platform; tz?: string };

const DEFAULT_TZ = "Asia/Riyadh";
const safeTz = (tz?: string) => (tz && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(tz) ? tz : DEFAULT_TZ);

export const RANGES = [1, 7, 30, 90] as const;
export const parseDays = (v?: string | string[]) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGES as readonly number[]).includes(n) ? n : 7;
};

function window(s: Scope, previous = false) {
  const end = new Date(Date.now() - (previous ? s.days * 86400_000 : 0));
  const start = new Date(end.getTime() - s.days * 86400_000);
  return { start, end };
}

function cond(s: Scope, previous = false) {
  const { start, end } = window(s, previous);
  const parts = [
    Prisma.sql`m."organizationId" = ${s.orgId}`,
    Prisma.sql`m."relevant" = true`,
    Prisma.sql`m."publishedAt" >= ${start} AND m."publishedAt" < ${end}`,
  ];
  if (s.monitorId) parts.push(Prisma.sql`m."monitorId" = ${s.monitorId}`);
  if (s.platform) parts.push(Prisma.sql`m."platform" = ${s.platform}::"Platform"`);
  return Prisma.join(parts, " AND ");
}

type KpiRow = {
  mentions: bigint;
  engagement: bigint | null;
  reach: bigint | null;
  risks: bigint;
  pos: bigint;
  neg: bigint;
  neu: bigint;
};

async function kpiRow(s: Scope, previous: boolean) {
  const [r] = await db.$queryRaw<KpiRow[]>`
    SELECT count(*) AS mentions,
           sum(m.likes + m.comments + m.shares) AS engagement,
           sum(coalesce(m."authorFollowers", 0)) AS reach,
           count(*) FILTER (WHERE m."isRisk") AS risks,
           count(*) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
           count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg,
           count(*) FILTER (WHERE m.sentiment = 'NEUTRAL') AS neu
    FROM "Mention" m WHERE ${cond(s, previous)}`;
  const n = (v: bigint | null) => Number(v ?? 0);
  const total = n(r.pos) + n(r.neg) + n(r.neu);
  return {
    mentions: n(r.mentions),
    engagement: n(r.engagement),
    reach: n(r.reach),
    risks: n(r.risks),
    positive: n(r.pos),
    negative: n(r.neg),
    neutral: n(r.neu),
    netSentiment: total ? Math.round(((n(r.pos) - n(r.neg)) / total) * 100) : 0,
  };
}

export async function getKpis(s: Scope) {
  const [current, previous] = await Promise.all([kpiRow(s, false), kpiRow(s, true)]);
  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100));
  return {
    ...current,
    deltas: {
      mentions: delta(current.mentions, previous.mentions),
      engagement: delta(current.engagement, previous.engagement),
      reach: delta(current.reach, previous.reach),
      risks: delta(current.risks, previous.risks),
      netSentiment: current.netSentiment - previous.netSentiment,
    },
  };
}

/**
 * Mentions per hour (1-day range) or per day, bucketed in the organization's
 * timezone so "today" means today in Riyadh, not in UTC. Empty buckets are
 * included. `t` is the local wall-clock start of the bucket (no offset).
 */
export async function getTimeseries(s: Scope) {
  const unit = s.days <= 1 ? "hour" : "day";
  const tz = safeTz(s.tz);
  const { start, end } = window(s);
  const local = (col: Prisma.Sql) => Prisma.sql`date_trunc(${unit}, (${col} AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;
  const rows = await db.$queryRaw<
    { t: string; pos: bigint; neg: bigint; neu: bigint; total: bigint; eng: bigint | null; risks: bigint }[]
  >`
    WITH buckets AS (
      SELECT generate_series(
        ${local(Prisma.sql`${start}::timestamp`)},
        ${local(Prisma.sql`${end}::timestamp`)},
        ${`1 ${unit}`}::interval
      ) AS b
    )
    SELECT to_char(buckets.b, 'YYYY-MM-DD"T"HH24:MI:SS') AS t,
           count(m.id) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
           count(m.id) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg,
           count(m.id) FILTER (WHERE m.sentiment = 'NEUTRAL' OR (m.id IS NOT NULL AND m.sentiment IS NULL)) AS neu,
           count(m.id) AS total,
           sum(m.likes + m.comments + m.shares) AS eng,
           count(m.id) FILTER (WHERE m."isRisk") AS risks
    FROM buckets
    LEFT JOIN "Mention" m ON ${local(Prisma.sql`m."publishedAt"`)} = buckets.b AND ${cond(s)}
    GROUP BY buckets.b ORDER BY buckets.b`;
  return {
    unit,
    points: rows.map((r) => {
      const total = Number(r.total);
      const pos = Number(r.pos);
      const neg = Number(r.neg);
      return {
        t: r.t,
        positive: pos,
        negative: neg,
        neutral: Number(r.neu),
        total,
        engagement: Number(r.eng ?? 0),
        risks: Number(r.risks),
        net: total ? Math.round(((pos - neg) / total) * 100) : 0,
      };
    }),
  };
}

export async function getPlatformBreakdown(s: Scope) {
  const rows = await db.$queryRaw<{ platform: Platform; n: bigint }[]>`
    SELECT m.platform, count(*) AS n FROM "Mention" m WHERE ${cond(s)} GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ platform: r.platform, count: Number(r.n) }));
}

export async function getTopTopics(s: Scope, limit = 8) {
  const rows = await db.$queryRaw<{ key: string; n: bigint; pos: bigint; neg: bigint; en: string | null; ar: string | null }[]>`
    SELECT t.key, count(*) AS n,
           count(*) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
           count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg,
           tp."labelEn" AS en, tp."labelAr" AS ar
    FROM "Mention" m CROSS JOIN LATERAL unnest(m.topics) AS t(key)
    LEFT JOIN "Topic" tp ON tp."organizationId" = m."organizationId" AND tp.key = t.key
    WHERE ${cond(s)}
    GROUP BY t.key, tp."labelEn", tp."labelAr" ORDER BY n DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    key: r.key,
    labelEn: r.en ?? r.key,
    labelAr: r.ar ?? r.en ?? r.key,
    count: Number(r.n),
    positive: Number(r.pos),
    negative: Number(r.neg),
  }));
}

export async function getTopAuthors(s: Scope, limit = 6) {
  // One row per person: the same handle on several platforms is merged; the
  // platform shown is where they posted most.
  const rows = await db.$queryRaw<
    { handle: string; name: string | null; platform: Platform; followers: number | null; verified: boolean; n: bigint; eng: bigint; score: number | null }[]
  >`
    SELECT m."authorHandle" AS handle, max(m."authorName") AS name,
           mode() WITHIN GROUP (ORDER BY m.platform) AS platform,
           max(m."authorFollowers") AS followers, bool_or(m."authorVerified") AS verified,
           count(*) AS n, sum(m.likes + m.comments + m.shares) AS eng, avg(m."sentimentScore") AS score
    FROM "Mention" m WHERE ${cond(s)} AND m."authorHandle" IS NOT NULL
    GROUP BY m."authorHandle"
    ORDER BY max(coalesce(m."authorFollowers",0)) DESC, count(*) DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    handle: r.handle,
    name: r.name,
    platform: r.platform,
    followers: Number(r.followers ?? 0),
    verified: r.verified,
    mentions: Number(r.n),
    engagement: Number(r.eng ?? 0),
    avgSentiment: r.score === null ? null : Math.round(Number(r.score) * 100) / 100,
  }));
}

/** Mentions per brand/competitor monitor, for share-of-voice. */
export async function getShareOfVoice(s: Omit<Scope, "monitorId">) {
  const rows = await db.$queryRaw<{ id: string; name: string; competitor: boolean; n: bigint; net: number | null }[]>`
    SELECT mo.id, mo.name, mo."isCompetitor" AS competitor, count(m.id) AS n,
           avg(CASE m.sentiment WHEN 'POSITIVE' THEN 1 WHEN 'NEGATIVE' THEN -1 ELSE 0 END) AS net
    FROM "Monitor" mo JOIN "Mention" m ON m."monitorId" = mo.id
    WHERE ${cond({ ...s, monitorId: undefined })} AND mo.type IN ('KEYWORD','PROFILE')
    GROUP BY mo.id ORDER BY n DESC`;
  const total = rows.reduce((a, r) => a + Number(r.n), 0);
  return rows.map((r) => ({
    monitorId: r.id,
    name: r.name,
    isCompetitor: r.competitor,
    count: Number(r.n),
    share: total ? Math.round((Number(r.n) / total) * 1000) / 10 : 0,
    netSentiment: Math.round(Number(r.net ?? 0) * 100),
  }));
}

export type MentionFilters = {
  orgId: string;
  days?: number;
  monitorId?: string;
  platform?: Platform;
  sentiment?: Sentiment;
  risk?: boolean;
  q?: string;
  status?: string;
  topic?: string;
  dialect?: Dialect;
  intent?: Intent;
  sarcasm?: boolean;
  assignedToId?: string;
  needsReply?: boolean;
};

export function mentionWhere(f: MentionFilters): Prisma.MentionWhereInput {
  return {
    organizationId: f.orgId,
    relevant: true,
    ...(f.days && { publishedAt: { gte: new Date(Date.now() - f.days * 86400_000) } }),
    ...(f.monitorId && { monitorId: f.monitorId }),
    ...(f.platform && { platform: f.platform }),
    ...(f.sentiment && { sentiment: f.sentiment }),
    ...(f.risk && { isRisk: true }),
    ...(f.topic && { topics: { has: f.topic } }),
    ...(f.dialect && { dialect: f.dialect }),
    ...(f.intent && { intent: f.intent }),
    ...(f.sarcasm && { sarcasm: true }),
    ...(f.assignedToId && { assignedToId: f.assignedToId }),
    ...(f.needsReply && { repliedAt: null, intent: { in: INBOX_INTENTS } }),
    ...(f.status && ["NEW", "REVIEWED", "FLAGGED", "ARCHIVED"].includes(f.status)
      ? { status: f.status as never }
      : { status: { not: "ARCHIVED" as const } }),
    ...(f.q && {
      OR: [
        { text: { contains: f.q, mode: "insensitive" as const } },
        { authorHandle: { contains: f.q, mode: "insensitive" as const } },
        { authorName: { contains: f.q, mode: "insensitive" as const } },
      ],
    }),
  };
}

// ---------- Dialect intelligence ----------

export async function getDialectBreakdown(s: Scope) {
  const rows = await db.$queryRaw<{ dialect: Dialect; n: bigint; pos: bigint; neg: bigint; sarc: bigint }[]>`
    SELECT m.dialect, count(*) AS n,
           count(*) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
           count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg,
           count(*) FILTER (WHERE m.sarcasm) AS sarc
    FROM "Mention" m WHERE ${cond(s)} AND m.dialect IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => {
    const n = Number(r.n);
    return {
      dialect: r.dialect,
      count: n,
      positive: Number(r.pos),
      negative: Number(r.neg),
      sarcasm: Number(r.sarc),
      netSentiment: n ? Math.round(((Number(r.pos) - Number(r.neg)) / n) * 100) : 0,
    };
  });
}

export async function getIntentBreakdown(s: Scope) {
  const rows = await db.$queryRaw<{ intent: Intent; n: bigint }[]>`
    SELECT m.intent, count(*) AS n FROM "Mention" m WHERE ${cond(s)} AND m.intent IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ intent: r.intent, count: Number(r.n) }));
}

/** Most frequent dialect slang terms in the period, with a gloss and sentiment mix. */
export async function getTopSlang(s: Scope, limit = 12) {
  const rows = await db.$queryRaw<{ term: string; gloss: string; n: bigint; pos: bigint; neg: bigint; dialect: Dialect | null }[]>`
    SELECT x->>'term' AS term, max(x->>'gloss') AS gloss, count(*) AS n,
           count(*) FILTER (WHERE m.sentiment = 'POSITIVE') AS pos,
           count(*) FILTER (WHERE m.sentiment = 'NEGATIVE') AS neg,
           mode() WITHIN GROUP (ORDER BY m.dialect) AS dialect
    FROM "Mention" m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.slang, '[]'::jsonb)) AS x
    WHERE ${cond(s)}
    GROUP BY 1 ORDER BY n DESC LIMIT ${limit}`;
  return rows.map((r) => ({ term: r.term, gloss: r.gloss, count: Number(r.n), positive: Number(r.pos), negative: Number(r.neg), dialect: r.dialect }));
}

export const INBOX_INTENTS: Intent[] = ["CHURN_RISK", "COMPLAINT", "QUESTION", "PURCHASE_INTENT"];

export async function getInboxStats(orgId: string) {
  const since = new Date(Date.now() - 7 * 86400_000);
  const dayStart = new Date(Date.now() - 86400_000);
  const [awaiting, repliedToday, [rt]] = await Promise.all([
    db.mention.count({
      where: { organizationId: orgId, relevant: true, repliedAt: null, status: { not: "ARCHIVED" }, publishedAt: { gte: since }, OR: [{ intent: { in: INBOX_INTENTS } }, { isRisk: true }] },
    }),
    db.mention.count({ where: { organizationId: orgId, repliedAt: { gte: dayStart } } }),
    db.$queryRaw<{ avg: number | null; p50: number | null }[]>`
      SELECT avg(extract(epoch FROM ("repliedAt" - "publishedAt")) / 60) AS avg,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("repliedAt" - "publishedAt")) / 60) AS p50
      FROM "Mention" WHERE "organizationId" = ${orgId} AND "repliedAt" >= ${new Date(Date.now() - 30 * 86400_000)}`,
  ]);
  return {
    awaiting,
    repliedToday,
    avgResponseMinutes: rt?.avg === null || rt?.avg === undefined ? null : Math.round(Number(rt.avg)),
    medianResponseMinutes: rt?.p50 === null || rt?.p50 === undefined ? null : Math.round(Number(rt.p50)),
  };
}

/** Priority for the engagement inbox: churn & risk first, then reach, then recency. */
export function inboxPriority(m: { intent: Intent | null; isRisk: boolean; authorFollowers: number | null; publishedAt: Date; sentiment: Sentiment | null }) {
  const intentW = { CHURN_RISK: 40, COMPLAINT: 25, PURCHASE_INTENT: 20, QUESTION: 15, SUGGESTION: 5, PRAISE: 2, OTHER: 0 }[m.intent ?? "OTHER"];
  const reach = Math.log10((m.authorFollowers ?? 0) + 10) * 6; // 6..~40
  const ageH = (Date.now() - m.publishedAt.getTime()) / 3600_000;
  const fresh = Math.max(0, 20 - ageH); // decays over the first 20h
  return intentW + (m.isRisk ? 30 : 0) + (m.sentiment === "NEGATIVE" ? 5 : 0) + reach + fresh;
}
