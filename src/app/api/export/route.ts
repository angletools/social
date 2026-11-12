import { uniqueMentionIds } from "@/lib/mention-query";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mentionWhere } from "@/lib/analytics";
import { filtersFromParams, parseSort, quickView, sortOrder, viewWhere } from "@/lib/filters";

const MAX_ROWS = 50_000;
const BATCH = 1_000;

const esc = (v: unknown) => {
  // Numbers are safe as they are (a negative score is not a formula).
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("|") : String(v);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const COLS = [
  "publishedAt", "monitor", "platform", "authorHandle", "authorName", "authorFollowers", "text", "url", "lang",
  "classificationSource", "classificationModel", "classificationVersion", "classificationContextHash", "classificationConfidence", "externalId",
  "sentiment", "sentimentScore", "intent", "dialect", "sarcasm", "topics", "isRisk", "riskReason",
  "likes", "comments", "shares", "views", "engagement", "status", "assignedTo", "repliedAt",
] as const;

/**
 * Streams the mentions matching the page's filters, quick view and sort as
 * CSV, a batch at a time, so large exports start downloading at once and
 * never sit in memory whole.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const where = { AND: [mentionWhere(filtersFromParams(user.organizationId, sp, user.id)), viewWhere(quickView(sp), user.id)] };
  const orderBy = sortOrder(parseSort(sp.sort));
  const enc = new TextEncoder();
  let sent = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // BOM so Excel opens Arabic text correctly.
      controller.enqueue(enc.encode("﻿" + COLS.join(",") + "\r\n"));
    },
    async pull(controller) {
      try {
        const current = await getCurrentUser();
        if (!current || current.id !== user.id || current.organizationId !== user.organizationId || req.signal.aborted) throw new Error("FORBIDDEN");
        const ids = await uniqueMentionIds(where, { orderBy, skip: sent, take: Math.min(BATCH, MAX_ROWS - sent) });
        const rows = await db.mention.findMany({
          where: { id: { in: ids }, organizationId: user.organizationId },
          orderBy,
          take: Math.min(BATCH, MAX_ROWS - sent),
          include: { monitor: { select: { name: true } }, assignedTo: { select: { name: true } } },
        });
        if (rows.length) {
          const lines = rows.map((r) =>
            COLS.map((c) => esc(c === "monitor" ? r.monitor.name : c === "assignedTo" ? (r.assignedTo?.name ?? "") : r[c])).join(","),
          );
          controller.enqueue(enc.encode(lines.join("\r\n") + "\r\n"));
          sent += rows.length;
        }
        if (rows.length < BATCH || sent >= MAX_ROWS) {
          await db.auditLog
            .create({ data: { organizationId: user.organizationId, userId: user.id, action: "mentions.export", meta: { rows: sent, view: quickView(sp), sort: parseSort(sp.sort) } } })
            .catch(() => null);
          controller.close();
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="angle-mentions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
