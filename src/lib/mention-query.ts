import { Prisma } from "@prisma/client";
import { db } from "./db";

export const METRIC_DEFINITIONS = {
  posts: "Unique platform + post ID within the selected scope. If monitors overlap, use the earliest matching capture (creation time, then ID) and its classification. Monitor-specific views retain that monitor's context.",
  engagement: "Likes + comments + shares once per unique post; latest collected values, not necessarily activity during the reporting period.",
  reach: "Follower estimate: maximum observed followers per known platform account in the period, summed once per account. Audience overlap is unknown; this is not unique reach, impressions or views. Unknown handles are excluded. Time buckets use their own accounts and must not be added together.",
  shareOfVoice: "Share of brand/competitor monitor captures. A post mentioning multiple monitored subjects can count for each; this is not a unique-post market share.",
  netSentiment: "(Positive minus negative) divided by classified posts, including neutral. Unclassified posts are excluded from the denominator.",
};

const ENUMS = new Set(["platform", "sentiment", "dialect", "intent", "status"]);
const COLUMNS = new Set(["id", "organizationId", "monitorId", "platform", "externalId", "relevant", "publishedAt", "createdAt", "sentiment", "isRisk", "topics", "dialect", "intent", "sarcasm", "assignedToId", "repliedAt", "status", "text", "authorHandle", "authorName", "authorFollowers", "likes", "engagement", "enrichedAt"]);
const col = (key: string, alias: "m" | "d" = "m") => { if (!COLUMNS.has(key)) throw new Error(`Unsupported mention field: ${key}`); return Prisma.raw(`${alias}."${key}"${ENUMS.has(key) ? "::text" : ""}`); };
const value = (v: unknown) => v instanceof Date ? Prisma.sql`${v.toISOString()}::timestamp` : Prisma.sql`${v}`;

/** Restricted, parameterized translation of the filters this app exposes. Unsupported filters fail closed. */
export function mentionSql(where: Prisma.MentionWhereInput, alias: "m" | "d" = "m"): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  for (const [key, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (["AND", "OR", "NOT"].includes(key)) {
      const children = (Array.isArray(v) ? v : [v]) as Prisma.MentionWhereInput[];
      const group = children.length ? Prisma.join(children.map(x => key === "NOT" ? Prisma.sql`NOT (${mentionSql(x, alias)})` : Prisma.sql`(${mentionSql(x, alias)})`), key === "OR" ? " OR " : " AND ") : Prisma.raw(key === "OR" ? "FALSE" : "TRUE");
      parts.push(Prisma.sql`(${group})`); continue;
    }
    if (key === "monitor") {
      // Inbox's own-brand scope is the only relation filter exposed here.
      const f = v as { isCompetitor?: boolean; type?: { not?: string } };
      if (Object.keys(f).some(k => !["isCompetitor", "type"].includes(k))) throw new Error("Unsupported monitor filter");
      parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "Monitor" mo WHERE mo.id = ${Prisma.raw(`${alias}."monitorId"`)} ${f.isCompetitor !== undefined ? Prisma.sql`AND mo."isCompetitor" = ${f.isCompetitor}` : Prisma.empty} ${f.type?.not ? Prisma.sql`AND mo.type::text != ${f.type.not}` : Prisma.empty})`); continue;
    }
    const c = col(key, alias);
    if (v === null) { parts.push(Prisma.sql`${c} IS NULL`); continue; }
    if (typeof v !== "object" || v instanceof Date) { parts.push(Prisma.sql`${c} = ${value(v)}`); continue; }
    const filter = v as Record<string, unknown>;
    for (const [op, x] of Object.entries(filter)) {
      if (op === "mode") continue;
      if (op === "equals") parts.push(x === null ? Prisma.sql`${c} IS NULL` : Prisma.sql`${c} = ${value(x)}`);
      else if (op === "not") parts.push(x === null ? Prisma.sql`${c} IS NOT NULL` : Prisma.sql`${c} != ${value(x)}`);
      else if (op === "in") { const xs = x as unknown[]; parts.push(xs.length ? Prisma.sql`${c} IN (${Prisma.join(xs.map(value))})` : Prisma.sql`FALSE`); }
      else if (op === "has") parts.push(Prisma.sql`${value(x)} = ANY(${c})`);
      else if (op === "contains") { const pattern = `%${String(x).replace(/[\\%_]/g, "\\$&")}%`; parts.push(filter.mode === "insensitive" ? Prisma.sql`${c} ILIKE ${pattern}` : Prisma.sql`${c} LIKE ${pattern}`); }
      else if (["gte", "gt", "lte", "lt"].includes(op)) parts.push(Prisma.sql`${c} ${Prisma.raw({ gte: ">=", gt: ">", lte: "<=", lt: "<" }[op]!)} ${value(x)}`);
      else throw new Error(`Unsupported mention operator: ${op}`);
    }
  }
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`;
}

/** Deduplicate once before aggregation or sorting; avoid a membership subquery per outer row. */
export function uniqueMentionsSql(where: Prisma.MentionWhereInput) {
  return Prisma.sql`(SELECT DISTINCT ON (d.platform, d."externalId") d.* FROM "Mention" d WHERE ${mentionSql(where, "d")} ORDER BY d.platform, d."externalId", d."createdAt", d.id)`;
}

export async function countUniqueMentions(where: Prisma.MentionWhereInput) {
  const [r] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(DISTINCT (m.platform, m."externalId")) n FROM "Mention" m WHERE ${mentionSql(where)}`;
  return Number(r.n);
}

export async function uniqueMentionIds(where: Prisma.MentionWhereInput, opts: { take?: number; skip?: number; orderBy?: Prisma.MentionOrderByWithRelationInput | Prisma.MentionOrderByWithRelationInput[] } = {}) {
  const orders = [opts.orderBy ?? [{ publishedAt: "desc" }, { id: "desc" }]].flat();
  const order = orders.flatMap(o => Object.entries(o).map(([key, dir]) => {
    const sort = typeof dir === "string" ? dir : (dir as { sort: string }).sort;
    const nulls = typeof dir === "object" ? (dir as { nulls?: string }).nulls : undefined;
    if (!["asc", "desc"].includes(sort)) throw new Error("Unsupported order");
    return Prisma.sql`${col(key)} ${Prisma.raw(sort === "asc" ? "ASC" : "DESC")} ${nulls ? Prisma.raw(nulls === "first" ? "NULLS FIRST" : "NULLS LAST") : Prisma.empty}`;
  }));
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT m.id FROM ${uniqueMentionsSql(where)} m ORDER BY ${Prisma.join(order)} LIMIT ${Math.min(1000, Math.max(1, opts.take ?? 40))} OFFSET ${Math.max(0, opts.skip ?? 0)}`;
  return rows.map(r => r.id);
}

/** Apply the same identity rule before pagination and fetch only the selected rows. */
export async function findUniqueMentions<T extends Prisma.MentionFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.MentionFindManyArgs>): Promise<Prisma.MentionGetPayload<T>[]> {
  const ids = await uniqueMentionIds(args.where ?? {}, { take: args.take ?? 40, skip: args.skip, orderBy: args.orderBy });
  const query = args as Prisma.MentionFindManyArgs;
  return db.mention.findMany({ ...query, skip: undefined, where: { AND: [args.where ?? {}, { id: { in: ids } }] } } as Prisma.SelectSubset<T, Prisma.MentionFindManyArgs>) as Promise<Prisma.MentionGetPayload<T>[]>;
}
