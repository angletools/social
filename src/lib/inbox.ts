import { countUniqueMentions, uniqueMentionsSql } from "./mention-query";
import { Prisma } from "@prisma/client";
import { db } from "./db";

export const INBOX_INTENTS = ["CHURN_RISK", "COMPLAINT", "QUESTION", "PURCHASE_INTENT"] as const;
type Options = { userId?: string; allMonitors?: boolean };
export function inboxWhere(orgId: string, options: Options = {}): Prisma.MentionWhereInput {
  return {
    organizationId: orgId, relevant: true, repliedAt: null, status: { not: "ARCHIVED" },
    OR: [{ intent: { in: [...INBOX_INTENTS] } }, { isRisk: true }],
    ...(!options.allMonitors && { monitor: { isCompetitor: false, type: { not: "TOPIC" } } }),
    ...(options.userId && { assignedToId: options.userId }),
  };
}

/** Rank the complete unresolved backlog in SQL before paging, with stable ties. */
export async function getInboxPage(orgId: string, options: Options & { page?: number; pageSize?: number } = {}) {
  const pageSize = Math.max(1, Math.min(60, options.pageSize ?? 60));
  const total = await countUniqueMentions(inboxWhere(orgId, options));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(options.page) ? options.page! : 1));
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT m.id FROM ${uniqueMentionsSql(inboxWhere(orgId, options))} m JOIN "Monitor" mo ON mo.id = m."monitorId"
    WHERE m."organizationId" = ${orgId} AND m.relevant AND m."repliedAt" IS NULL AND m.status != 'ARCHIVED'
      AND (m.intent IN ('CHURN_RISK','COMPLAINT','QUESTION','PURCHASE_INTENT') OR m."isRisk")
      ${options.allMonitors ? Prisma.empty : Prisma.sql`AND mo."isCompetitor" = false AND mo.type != 'TOPIC'`}
      ${options.userId ? Prisma.sql`AND m."assignedToId" = ${options.userId}` : Prisma.empty}
    ORDER BY (
      CASE m.intent WHEN 'CHURN_RISK' THEN 40 WHEN 'COMPLAINT' THEN 25 WHEN 'PURCHASE_INTENT' THEN 20 WHEN 'QUESTION' THEN 15 ELSE 0 END
      + CASE WHEN m."isRisk" THEN 30 ELSE 0 END + CASE WHEN m.sentiment = 'NEGATIVE' THEN 5 ELSE 0 END
      + log(greatest(coalesce(m."authorFollowers",0),0)::numeric + 10) * 6
      + greatest(0,20 - extract(epoch FROM (${new Date().toISOString()}::timestamp - m."publishedAt")) / 3600)
    ) DESC, m."publishedAt" ASC, m.id ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const rows = await db.mention.findMany({ where: { organizationId: orgId, id: { in: ids.map((x) => x.id) } }, include: { assignedTo: { select: { id: true, name: true } } } });
  const byId = new Map(rows.map((m) => [m.id, m]));
  return { total, pages, page, items: ids.flatMap((x) => byId.has(x.id) ? [byId.get(x.id)!] : []) };
}
