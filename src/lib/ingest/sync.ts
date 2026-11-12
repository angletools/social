import { randomUUID } from "node:crypto";
import { monthStart } from "../workspace";
import type { DataMode, Monitor, Platform, Prisma } from "@prisma/client";
import { db } from "../db";
import { guessLang } from "../utils";
import { MonidClient, runItems } from "../monid/client";
import { normalizeItem, type NormalizedPost } from "../monid/normalize";
import { sourceFor } from "../monid/sources";
import { generateDemoPosts, type DemoPost } from "./demo";

export const dataSource = (mode: DataMode) => mode === "DEMO" ? "demo" : "monid";

function passesFilters(m: Monitor, p: NormalizedPost) {
  const text = p.text.toLowerCase();
  if (m.excludeTerms.some((x) => x.trim() && text.includes(x.trim().toLowerCase()))) return false;
  if (m.languages.length > 0) {
    const lang = (p.lang ?? guessLang(p.text)).slice(0, 2);
    if (!m.languages.includes(lang)) return false;
  }
  return true;
}

async function fetchPlatform(m: Monitor, platform: Platform, runId: string, mode: DataMode, previousRunId?: string | null): Promise<(NormalizedPost | DemoPost)[]> {
  const monid = MonidClient.fromEnv();
  if (mode === "DEMO") {
    const to = new Date();
    const from = m.lastSyncAt ?? new Date(to.getTime() - 30 * 86400_000);
    const hours = Math.max(1, (to.getTime() - from.getTime()) / 3600_000);
    const perHour = m.isCompetitor ? 0.35 : 0.6;
    const count = Math.min(m.maxItemsPerRun * (m.lastSyncAt ? 1 : 8), Math.max(1, Math.round(hours * perHour)));
    return generateDemoPosts(m, platform, { count, from, to });
  }

  if (!monid) throw new Error("Live collection is unavailable: configure Monid. No sample data was added.");
  if (previousRunId) return runItems(await monid.waitForRun(await monid.getRun(previousRunId))).map((raw) => normalizeItem(platform, raw)).filter((p): p is NormalizedPost => p !== null);
  const spec = sourceFor(platform, m.type);
  if (!spec) throw new Error(`${platform} does not support ${m.type} monitors`);
  const done = await monid.runAndWait(spec.provider, spec.endpoint, spec.build(m), 5 * 60_000, (providerRunId) =>
    db.syncRun.update({ where: { id: runId }, data: { providerRunId } }).then(() => undefined),
  );
  return runItems(done)
    .map((raw) => normalizeItem(platform, raw))
    .filter((p): p is NormalizedPost => p !== null);
}

/**
 * Collects new posts for every platform of a monitor and stores them as mentions.
 * Returns the number of new mentions.
 */
export async function syncMonitor(monitorId: string, jobKey: string = randomUUID()): Promise<number> {
  const m = await db.monitor.findUnique({ where: { id: monitorId }, include: { organization: true } });
  if (!m || m.status !== "ACTIVE") return 0;

  const since30d = monthStart(m.organization.timezone);
  const used = await db.mention.count({ where: { organizationId: m.organizationId, createdAt: { gte: since30d } } });
  if (used >= m.organization.mentionQuota) {
    await db.monitor.update({
      where: { id: m.id },
      data: { nextSyncAt: new Date(Date.now() + m.refreshMinutes * 60_000) },
    });
    return 0;
  }

  const token = randomUUID();
  const lease = () => new Date(Date.now() + 120_000);
  const claimed = await db.monitor.updateMany({ where: { id: m.id, status: "ACTIVE", OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: new Date() } }] }, data: { syncToken: token, syncLeaseUntil: lease(), lastAttemptAt: new Date() } });
  if (!claimed.count) throw new Error("Collection already in progress");
  const heartbeat = setInterval(() => { void db.monitor.updateMany({ where: { id: m.id, syncToken: token }, data: { syncLeaseUntil: lease() } }).catch(() => undefined); }, 30_000);
  let totalNew = 0;
  const failures: string[] = [];
  try {
  for (const platform of m.platforms) {
    const prior = await db.syncRun.findUnique({ where: { monitorId_platform_jobKey: { monitorId: m.id, platform, jobKey } } });
    if (prior?.status === "SUCCESS") continue;
    const run = prior ?? await db.syncRun.create({ data: { monitorId: m.id, platform, source: dataSource(m.organization.dataMode), jobKey } });
    try {
      if (prior && !prior.providerRunId && m.organization.dataMode === "LIVE") throw new Error("Previous collection did not return a run ID; automatic restart refused to avoid a duplicate paid run.");
      const posts = (await fetchPlatform(m, platform, run.id, m.organization.dataMode, prior?.providerRunId)).filter((p) => passesFilters(m, p));
      const data: Prisma.MentionCreateManyInput[] = posts.map((p) => {
        const demo = "enrichment" in p ? p.enrichment : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { enrichment: _e, durationSec: _d, ...post } = p as DemoPost;
        return {
          ...post,
          organizationId: m.organizationId,
          monitorId: m.id,
          platform,
          source: m.organization.dataMode,
          observedAt: new Date(),
          lang: post.lang ?? guessLang(post.text),
          ...(demo && {
            classificationSource: "SAMPLE",
            sentiment: demo.sentiment,
            sentimentScore: demo.sentimentScore,
            topics: demo.topics.map(([k]) => k),
            isRisk: demo.isRisk,
            riskReason: demo.riskReason,
            emotion: demo.emotion,
            dialect: demo.dialect,
            intent: demo.intent,
            sarcasm: demo.sarcasm,
            slang: demo.slang,
            enrichedAt: new Date(),
          }),
        };
      });
      // Demo posts arrive pre-labelled; register their bilingual topic labels.
      const topicLabels = new Map<string, [string, string]>();
      for (const p of posts) if ("enrichment" in p) for (const [k, en, ar] of p.enrichment.topics) topicLabels.set(k, [en, ar]);
      for (const [key, [labelEn, labelAr]] of topicLabels) {
        await db.topic.upsert({
          where: { organizationId_key: { organizationId: m.organizationId, key } },
          create: { organizationId: m.organizationId, key, labelEn, labelAr },
          update: {},
        });
      }
      const res = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${m.organizationId} FOR UPDATE`;
        const current = await tx.monitor.findUniqueOrThrow({ where: { id: m.id } });
        if (current.syncToken !== token) throw new Error("Collection claim expired");
        let remaining = Math.max(0, m.organization.mentionQuota - await tx.mention.count({ where: { organizationId: m.organizationId, createdAt: { gte: since30d } } }));
        let count = 0, skipped = 0;
        for (const post of data) {
          const where = { monitorId_platform_externalId: { monitorId: m.id, platform, externalId: post.externalId } };
          const exists = await tx.mention.findUnique({ where, select: { id: true } });
          if (exists) {
            // Preserve enrichment, assignments, notes, and reply history.
            // Shared metrics are refreshed below for every capture of this post.
          } else if (remaining > 0) {
            const priorCapture = await tx.mention.findFirst({ where: { organizationId: m.organizationId, platform, externalId: post.externalId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { status: true, assignedToId: true, repliedAt: true, note: true } });
            await tx.mention.create({ data: { ...post, ...(priorCapture ?? {}) } });
            remaining--; count++;
          } else skipped++;
          await tx.mention.updateMany({ where: { organizationId: m.organizationId, platform, externalId: post.externalId, observedAt: { lte: post.observedAt } }, data: { likes: post.likes, comments: post.comments, shares: post.shares, views: post.views, authorFollowers: post.authorFollowers, observedAt: post.observedAt } });
        }
        return { count, skipped };
      }, { timeout: 30_000 });
      totalNew += res.count;
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: res.skipped ? "PARTIAL" : "SUCCESS", error: res.skipped ? "Monthly collection allowance reached" : null, itemsFetched: posts.length, itemsNew: res.count, finishedAt: new Date() },
      });
      if (res.skipped) failures.push(`${platform}: monthly allowance reached`);
    } catch (e) {
      failures.push(`${platform}: ${(e as Error).message}`);
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: String((e as Error).message ?? e).slice(0, 500), finishedAt: new Date() },
      });
    }
  }

  await db.monitor.updateMany({
    where: { id: m.id, syncToken: token },
    data: { ...(failures.length === 0 && { lastSyncAt: new Date() }), nextSyncAt: new Date(Date.now() + m.refreshMinutes * 60_000) },
  });
  if (failures.length) throw new Error(`Collection incomplete: ${failures.join("; ")}`);
  return totalNew;
  } finally {
    clearInterval(heartbeat);
    await db.monitor.updateMany({ where: { id: m.id, syncToken: token }, data: { syncToken: null, syncLeaseUntil: null } });
  }
}
