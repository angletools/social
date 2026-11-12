"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { aiEnabled } from "@/lib/ai/client";

const Correction = z.object({
  id: z.string().min(1), revision: z.number().int().min(0),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  dialect: z.enum(["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"]),
  intent: z.enum(["COMPLAINT", "QUESTION", "PRAISE", "PURCHASE_INTENT", "CHURN_RISK", "SUGGESTION", "OTHER"]),
  relevant: z.boolean(), isRisk: z.boolean(), sarcasm: z.boolean(), reason: z.string().trim().min(3).max(500),
}).strict();
export async function correctClassification(input: z.infer<typeof Correction>) {
  const user = await requireRole("ANALYST");
  const d = Correction.parse(input);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Mention" WHERE id = ${d.id} AND "organizationId" = ${user.organizationId} FOR UPDATE`;
    const m = await tx.mention.findFirst({ where: { id: d.id, organizationId: user.organizationId } });
    if (!m) throw new Error("NOT_FOUND");
    if (m.classificationRevision !== d.revision) throw new Error("STALE");
    const after = { sentiment: d.sentiment, dialect: d.dialect, intent: d.intent, relevant: d.relevant, isRisk: d.isRisk, sarcasm: d.sarcasm };
    await tx.mention.update({ where: { id: m.id }, data: { ...after, sentimentScore: null, riskReason: d.isRisk ? d.reason : null,
      classificationSource: "HUMAN", classificationModel: null, classificationConfidence: null, classificationVersion: null, classificationContextHash: null,
      classificationRevision: { increment: 1 }, correctedById: user.id, correctedAt: new Date(), enrichedAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "mention.correct", target: m.id,
      meta: { reason: d.reason, before: { sentiment: m.sentiment, dialect: m.dialect, intent: m.intent, relevant: m.relevant, isRisk: m.isRisk, sarcasm: m.sarcasm, source: m.classificationSource, model: m.classificationModel, version: m.classificationVersion, contextHash: m.classificationContextHash, confidence: m.classificationConfidence }, after } } });
  });
  revalidatePath("/", "layout");
}

/** Queued in the same database transaction; the periodic worker drains pending classifications. */
export async function reprocessClassifications(limit: number) {
  const user = await requireRole("ADMIN");
  const count = z.number().int().min(1).max(1000).parse(limit);
  if (!aiEnabled()) throw new Error("AI_DISABLED");
  const changed = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${user.organizationId} FOR UPDATE`;
    const rows = await tx.mention.findMany({ where: { organizationId: user.organizationId, classificationSource: { in: ["HEURISTIC", "MODEL", "LEGACY"] }, enrichedAt: { not: null } }, orderBy: [{ enrichedAt: "asc" }, { id: "asc" }], take: count, select: { id: true } });
    const result = await tx.mention.updateMany({ where: { id: { in: rows.map(r => r.id) }, classificationSource: { not: "HUMAN" } }, data: { enrichedAt: null, classificationSource: "PENDING", classificationRevision: { increment: 1 }, classificationConfidence: null } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "classification.reprocess", meta: { count: result.count, mentionIds: rows.map(r => r.id) } } });
    return result.count;
  });
  revalidatePath("/settings");
  return changed;
}

export async function addHandoffNote(id: string, text: string) {
  const user = await requireRole("ANALYST");
  const note = z.string().trim().min(1).max(2000).parse(text);
  await db.$transaction(async tx => {
    const mention = await tx.mention.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    if (!mention) throw new Error("NOT_FOUND");
    await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "mention.note", target: id, meta: { text: note } } });
  });
  revalidatePath("/inbox");
}
