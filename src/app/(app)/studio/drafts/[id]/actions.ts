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
