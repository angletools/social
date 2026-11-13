"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { writeDraftContent } from "@/lib/drafts";

/** Puts an earlier version back as the current script; the restore is itself a new version. */
export async function restoreDraftVersion(draftId: string, n: number, revision: number) {
  const user = await requireRole("ANALYST");
  const d = await db.contentDraft.findFirst({ where: { id: draftId, organizationId: user.organizationId } });
  if (!d || d.status === "GENERATING") return { ok: false as const, error: "invalid" };
  const v = await db.draftVersion.findUnique({ where: { draftId_n: { draftId, n } } });
  if (!v) return { ok: false as const, error: "invalid" };
  const saved = await writeDraftContent({ id: draftId, orgId: user.organizationId, revision, content: v.content as object, kind: "RESTORE", instruction: String(n), userId: user.id });
  await audit(user, "draft.restore", draftId, { n });
  revalidatePath(`/studio/drafts/${draftId}`);
  return { ok: true as const, revision: saved.revision, content: saved.content };
}

/** Comments refer to the saved revision; optionally hand it to an active reviewer. */
export async function addDraftComment(draftId: string, revision: number, text: string, reviewerId: string | null) {
  const user = await requireRole("ANALYST");
  const { z } = await import("zod");
  const input = z.object({ draftId: z.string().min(1), revision: z.number().int().min(0), text: z.string().trim().min(1).max(2000), reviewerId: z.string().nullable() }).parse({ draftId, revision, text, reviewerId });
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ContentDraft" WHERE id = ${input.draftId} AND "organizationId" = ${user.organizationId} FOR UPDATE`;
    const draft = await tx.contentDraft.findFirst({ where: { id: input.draftId, organizationId: user.organizationId } });
    if (!draft) throw new Error("NOT_FOUND");
    if (draft.revision !== input.revision) throw new Error("STALE");
    const reviewer = input.reviewerId ? await tx.user.findFirst({ where: { id: input.reviewerId, organizationId: user.organizationId, active: true, role: { in: ["ADMIN", "OWNER"] } } }) : null;
    if (input.reviewerId && !reviewer) throw new Error("INVALID_REVIEWER");
    await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "draft.comment", target: draft.id, meta: { text: input.text, revision: draft.revision, reviewerId: reviewer?.id ?? null, reviewerName: reviewer?.name ?? null } } });
    if (reviewer && reviewer.id !== user.id) await tx.notification.create({ data: { organizationId: user.organizationId, userId: reviewer.id, severity: "INFO", titleEn: `${user.name} requested your review`, titleAr: `${user.name} طلب مراجعتك`, bodyEn: `${draft.title} · revision ${draft.revision}`, bodyAr: `${draft.title} · النسخة ${draft.revision}`, link: `/studio/drafts/${draft.id}` } });
  });
  revalidatePath(`/studio/drafts/${draftId}`);
}
