import type { Prisma } from "@prisma/client";
import { db } from "./db";

export type VersionKind = "GENERATED" | "REWRITE" | "EDIT" | "RESTORE";

/** Saves a numbered version of a draft. Retries once if two saves race for the same number. */
export async function recordVersion(draftId: string, kind: VersionKind, content: unknown, opts: { instruction?: string | null; userId?: string | null } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.draftVersion.findFirst({ where: { draftId }, orderBy: { n: "desc" }, select: { n: true } });
    try {
      return await db.draftVersion.create({
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
