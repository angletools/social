"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MonitorType, Platform, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { enqueue, QUEUES } from "@/lib/queue";
import { supportedPlatforms } from "@/lib/monid/sources";
import { needleFor, perDayFromWeek, roughPerDay } from "@/lib/monitor-stats";

const PLATFORMS = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"] as const;
const TYPES = ["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"] as const;
const term = z.string().trim().min(1).max(100);

const MonitorUpdate = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(TYPES),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  terms: z.array(term).min(1).max(20),
  excludeTerms: z.array(term).max(20),
  languages: z.array(z.enum(["ar", "en"])),
  description: z.string().trim().max(500).optional(),
  isCompetitor: z.boolean(),
  refreshMinutes: z.number().int().min(15).max(1440),
});

/** Saves an edited monitor. Changing what it tracks queues a fresh collection. */
export async function updateMonitor(id: string, input: z.infer<typeof MonitorUpdate>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireRole("ADMIN");
  const parsed = MonitorUpdate.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const m = await db.monitor.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!m) return { ok: false, error: "not_found" };
  const d = parsed.data;
  const platforms = d.platforms.filter((p) => supportedPlatforms(d.type as MonitorType).includes(p as Platform));
  if (!platforms.length) return { ok: false, error: "invalid" };
  const tracking = JSON.stringify([d.type, d.terms, d.excludeTerms, platforms]) !== JSON.stringify([m.type, m.terms, m.excludeTerms, m.platforms]);
  await db.monitor.update({
    where: { id },
    data: {
      name: d.name,
      type: d.type as MonitorType,
      platforms: platforms as Platform[],
      terms: d.terms,
      excludeTerms: d.excludeTerms,
      languages: d.languages.length === 2 ? [] : d.languages,
      description: d.type === "TOPIC" ? d.description : null,
      isCompetitor: d.isCompetitor,
      refreshMinutes: d.refreshMinutes,
      ...(m.refreshMinutes !== d.refreshMinutes && { nextSyncAt: new Date(Date.now() + d.refreshMinutes * 60_000) }),
    },
  });
  await audit(user, "monitor.update", id, { name: d.name });
  if (tracking && m.status === "ACTIVE") await enqueue(QUEUES.sync, { monitorId: id }, id).catch(() => null);
  revalidatePath("/monitors");
  revalidatePath(`/monitors/${id}`);
  return { ok: true, id };
}

const PreviewInput = z.object({
  type: z.enum(TYPES),
  terms: z.array(term).max(20),
  excludeTerms: z.array(term).max(20),
  platforms: z.array(z.enum(PLATFORMS)),
  languages: z.array(z.enum(["ar", "en"])),
});

export type MonitorPreview = {
  /** "history": measured on posts already collected; "rough": no history, a labelled guess. */
  basis: "history" | "rough" | "none";
  perDay: number;
  matches: number;
  examples: { id: string; name: string; seed: string; platform: Platform; publishedAt: string; text: string }[];
};

/**
 * Example posts and a posts-a-day estimate for the new-monitor wizard,
 * measured on posts this organization already collected in the last 7 days.
 * With nothing to measure, a rough per-type estimate is returned instead.
 */
export async function previewMonitor(input: z.infer<typeof PreviewInput>): Promise<MonitorPreview> {
  const user = await requireRole("ADMIN");
  const parsed = PreviewInput.safeParse(input);
  if (!parsed.success || !parsed.data.terms.length) return { basis: "none", perDay: 0, matches: 0, examples: [] };
  const d = parsed.data;
  const supported = supportedPlatforms(d.type as MonitorType);
  const platforms = d.platforms.filter((p) => supported.includes(p as Platform)) as Platform[];
  if (!platforms.length) return { basis: "none", perDay: 0, matches: 0, examples: [] };

  const anyTerm: Prisma.MentionWhereInput[] = d.terms.flatMap((t) => {
    const clean = t.replace(/^[#@]/, "");
    const byText = { text: { contains: needleFor(d.type as MonitorType, clean), mode: "insensitive" as const } };
    return d.type === "PROFILE" ? [byText, { authorHandle: { equals: clean, mode: "insensitive" as const } }] : [byText];
  });
  const where: Prisma.MentionWhereInput = {
    organizationId: user.organizationId,
    relevant: true,
    publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
    platform: { in: platforms },
    ...(d.languages.length === 1 && { lang: d.languages[0] }),
    OR: anyTerm,
    AND: d.excludeTerms.map((x) => ({ NOT: { text: { contains: x, mode: "insensitive" as const } } })),
  };
  const [matches, rows] = await Promise.all([
    db.mention.count({ where }),
    db.mention.findMany({
      where,
      orderBy: [{ engagement: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }],
      take: 40,
      select: { id: true, authorName: true, authorHandle: true, platform: true, publishedAt: true, text: true },
    }),
  ]);
  // One post per author, newest of the most engaged first.
  const seen = new Set<string>();
  const examples = rows
    .filter((r) => {
      const k = r.authorHandle ?? r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .map((r) => ({
      id: r.id,
      name: r.authorName ?? (r.authorHandle ? `@${r.authorHandle}` : ""),
      seed: r.authorHandle ?? r.authorName ?? r.id,
      platform: r.platform,
      publishedAt: r.publishedAt.toISOString(),
      text: r.text.length > 240 ? `${r.text.slice(0, 240)}…` : r.text,
    }));
  if (matches > 0) return { basis: "history", perDay: perDayFromWeek(matches), matches, examples };
  return {
    basis: "rough",
    perDay: roughPerDay({ type: d.type as MonitorType, terms: d.terms.length, platforms: platforms.length, supported: supported.length, languages: d.languages.length || 2 }),
    matches: 0,
    examples: [],
  };
}
