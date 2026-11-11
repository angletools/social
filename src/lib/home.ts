import { Prisma } from "@prisma/client";
import { db } from "./db";
import { cond, type Scope } from "./analytics";
import { viewsCurve } from "./insight";

const MOMENTUM_ORDER: Record<string, number> = { RISING: 0, NEW: 1, PEAKING: 2, FADING: 3 };

/**
 * The format to show on Home: rising first, then by score. Comes with its
 * cumulative views over time (from the posts that make it up) for the sparkline.
 */
export async function getTrendingFormat(orgId: string) {
  const formats = await db.trendFormat.findMany({
    where: { organizationId: orgId, dismissed: false },
    select: { id: true, nameEn: true, nameAr: true, momentum: true, score: true, totalViews: true, platforms: true },
    orderBy: { score: "desc" },
    take: 30,
  });
  const top = formats.sort((a, b) => (MOMENTUM_ORDER[a.momentum] ?? 9) - (MOMENTUM_ORDER[b.momentum] ?? 9) || b.score - a.score)[0];
  if (!top) return null;
  const posts = await db.trendPost.findMany({ where: { formatId: top.id }, select: { views: true, publishedAt: true }, orderBy: { publishedAt: "asc" } });
  return { ...top, views: viewsCurve(posts) };
}

/**
 * People signalling they may leave in the scope, how that moved, and how many
 * of them name a competitor you track (by its monitor name or terms).
 */
export async function getChurnSignals(s: Scope) {
  const competitors = await db.monitor.findMany({ where: { organizationId: s.orgId, isCompetitor: true }, select: { name: true, terms: true } });
  const names = [...new Set(competitors.flatMap((c) => [c.name, ...c.terms]).map((x) => x.trim()).filter((x) => x.length >= 3))];
  const named = names.length
    ? Prisma.sql`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest(${names}::text[]) AS c(term) WHERE m.text ILIKE '%' || c.term || '%'))`
    : Prisma.sql`0::bigint`;
  const [[cur], [prev]] = await Promise.all([
    db.$queryRaw<{ n: bigint; named: bigint }[]>`
      SELECT count(*) AS n, ${named} AS named
      FROM "Mention" m JOIN "Monitor" mo ON mo.id = m."monitorId"
      WHERE ${cond(s)} AND m.intent = 'CHURN_RISK' AND NOT mo."isCompetitor"`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Mention" m JOIN "Monitor" mo ON mo.id = m."monitorId"
      WHERE ${cond(s, true)} AND m.intent = 'CHURN_RISK' AND NOT mo."isCompetitor"`,
  ]);
  return { count: Number(cur?.n ?? 0), prev: Number(prev?.n ?? 0), namedCompetitor: Number(cur?.named ?? 0), tracksCompetitors: names.length > 0 };
}
