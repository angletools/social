import type { Prisma } from "@prisma/client";
import { db } from "./db";

export type VersionKind = "GENERATED" | "REWRITE" | "EDIT" | "RESTORE" | "APPROVAL";

/** Saves a numbered version of a draft. Retries once if two saves race for the same number. */
export async function recordVersion(draftId: string, kind: VersionKind, content: unknown, opts: { instruction?: string | null; userId?: string | null } = {}, client: Prisma.TransactionClient = db) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await client.draftVersion.findFirst({ where: { draftId }, orderBy: { n: "desc" }, select: { n: true } });
    try {
      return await client.draftVersion.create({
        data: {
          draftId,
          n: (last?.n ?? 0) + 1,
          kind,
          instruction: opts.instruction?.slice(0, 500) ?? null,
          content: content as Prisma.InputJsonValue,
          createdById: opts.userId ?? null,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  throw new Error("could not record draft version");
}

/** Serialize all draft writers. Content and its immutable history commit together. */
export async function writeDraftContent(input: {
  id: string; orgId: string; revision: number; content: object; kind: VersionKind;
  userId?: string; instruction?: string; generating?: boolean; title?: string;
}) {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("DRAFT_CONFLICT");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContentDraft" WHERE id = ${input.id} AND "organizationId" = ${input.orgId} FOR UPDATE`;
    const d = await tx.contentDraft.findFirst({ where: { id: input.id, organizationId: input.orgId } });
    if (!d || d.revision !== input.revision || (input.generating ? d.status !== "GENERATING" : d.status === "GENERATING")) throw new Error("DRAFT_CONFLICT");
    await recordVersion(d.id, input.kind, input.content, { userId: input.userId, instruction: input.instruction }, tx);
    return tx.contentDraft.update({
      where: { id: d.id },
      data: { content: input.content, revision: { increment: 1 }, status: "DRAFT", approvedById: null, approvedRevision: null, approvedAt: null, error: null, ...(input.title && { title: input.title }) },
    });
  });
}

export async function transitionDraft(input: { id: string; orgId: string; userId: string; revision: number; status: string }) {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("DRAFT_CONFLICT");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContentDraft" WHERE id = ${input.id} AND "organizationId" = ${input.orgId} FOR UPDATE`;
    const d = await tx.contentDraft.findFirst({ where: { id: input.id, organizationId: input.orgId } });
    const allowed: Record<string, string[]> = { DRAFT: ["IN_REVIEW"], IN_REVIEW: ["DRAFT", "APPROVED"], APPROVED: ["DRAFT", "PUBLISHED"], PUBLISHED: ["DRAFT"] };
    if (!d || d.revision !== input.revision || !d.content || !allowed[d.status]?.includes(input.status)) throw new Error("DRAFT_CONFLICT");
    if (input.status === "PUBLISHED" && (d.approvedRevision !== d.revision || !d.approvedById)) throw new Error("DRAFT_CONFLICT");
    // Legacy drafts also get an immutable snapshot before approval.
    if (input.status === "APPROVED") await recordVersion(d.id, "APPROVAL", d.content, { userId: input.userId }, tx);
    return tx.contentDraft.update({ where: { id: d.id }, data: {
      status: input.status,
      ...(input.status === "APPROVED" ? { approvedById: input.userId, approvedRevision: d.revision, approvedAt: new Date() } : input.status === "PUBLISHED" ? {} : { approvedById: null, approvedRevision: null, approvedAt: null }),
    } });
  });
}
