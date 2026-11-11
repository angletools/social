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

type BeatText = { start: number; duration: number; vo: string; onScreen: string };

/**
 * Finds the script beat a compliance note talks about, so "Go to line" can
 * jump there. Notes usually quote the line ("…", «…», "…") or give a time ("at 17s").
 * Returns -1 when the note doesn't point at one line.
 */
export function beatForNote(note: string, beats: BeatText[]): number {
  const quotes = [...note.matchAll(/[“"«„‘']([^”"»‘’']{2,})[”"»’']/g)].map((m) => m[1].trim()).filter((q) => q.length >= 2);
  for (const q of quotes) {
    const i = beats.findIndex((b) => b.vo.includes(q) || b.onScreen.includes(q));
    if (i !== -1) return i;
  }
  const t = note.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|ث|ثانية)/i);
  if (t) {
    const sec = Number(t[1]);
    const i = beats.findIndex((b) => sec >= b.start && sec < b.start + b.duration);
    if (i !== -1) return i;
  }
  return -1;
}
