import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mentionWhere } from "@/lib/analytics";
import { filtersFromParams } from "@/lib/filters";

const MAX_ROWS = 50_000;

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("|") : String(v);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await db.mention.findMany({
    where: mentionWhere(filtersFromParams(user.organizationId, sp)),
    orderBy: { publishedAt: "desc" },
    take: MAX_ROWS,
    include: { monitor: { select: { name: true } } },
  });
  const cols = [
    "publishedAt", "monitor", "platform", "authorHandle", "authorName", "authorFollowers", "text", "url", "lang",
    "sentiment", "sentimentScore", "topics", "isRisk", "riskReason", "likes", "comments", "shares", "views", "status",
  ] as const;
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => esc(c === "monitor" ? r.monitor.name : r[c])).join(","));
  }
  await db.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "mentions.export", meta: { rows: rows.length } } });
  // BOM so Excel opens Arabic text correctly.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rasd-mentions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
