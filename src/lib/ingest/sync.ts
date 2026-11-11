import type { Monitor, Platform, Prisma } from "@prisma/client";
import { db } from "../db";
import { guessLang } from "../utils";
import { MonidClient, runItems } from "../monid/client";
import { normalizeItem, type NormalizedPost } from "../monid/normalize";
import { sourceFor } from "../monid/sources";
import { generateDemoPosts, type DemoPost } from "./demo";

export const dataSource = () => (MonidClient.fromEnv() ? "monid" : "demo");

function passesFilters(m: Monitor, p: NormalizedPost) {
  const text = p.text.toLowerCase();
  if (m.excludeTerms.some((x) => x.trim() && text.includes(x.trim().toLowerCase()))) return false;
  if (m.languages.length > 0) {
    const lang = (p.lang ?? guessLang(p.text)).slice(0, 2);
    if (!m.languages.includes(lang)) return false;
  }
  return true;
}

async function fetchPlatform(m: Monitor, platform: Platform, runId: string): Promise<(NormalizedPost | DemoPost)[]> {
  const monid = MonidClient.fromEnv();
  if (!monid) {
    const to = new Date();
    const from = m.lastSyncAt ?? new Date(to.getTime() - 30 * 86400_000);
    const hours = Math.max(1, (to.getTime() - from.getTime()) / 3600_000);
    const perHour = m.isCompetitor ? 0.35 : 0.6;
    const count = Math.min(m.maxItemsPerRun * (m.lastSyncAt ? 1 : 8), Math.max(1, Math.round(hours * perHour)));
    return generateDemoPosts(m, platform, { count, from, to });
  }

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
export async function syncMonitor(monitorId: string): Promise<number> {
  const m = await db.monitor.findUnique({ where: { id: monitorId }, include: { organization: true } });
  if (!m || m.status !== "ACTIVE") return 0;

  const since30d = new Date(Date.now() - 30 * 86400_000);
  const used = await db.mention.count({ where: { organizationId: m.organizationId, createdAt: { gte: since30d } } });
  if (used >= m.organization.mentionQuota) {
    await db.monitor.update({
      where: { id: m.id },
      data: { nextSyncAt: new Date(Date.now() + m.refreshMinutes * 60_000) },
    });
    return 0;
  }

  let totalNew = 0;
  for (const platform of m.platforms) {
    const run = await db.syncRun.create({ data: { monitorId: m.id, platform, source: dataSource() } });
    try {
      const posts = (await fetchPlatform(m, platform, run.id)).filter((p) => passesFilters(m, p));
      const data: Prisma.MentionCreateManyInput[] = posts.map((p) => {
        const demo = "enrichment" in p ? p.enrichment : null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { enrichment: _e, durationSec: _d, ...post } = p as DemoPost;
        return {
          ...post,
          organizationId: m.organizationId,
          monitorId: m.id,
          platform,
          lang: post.lang ?? guessLang(post.text),
          ...(demo && {
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
      const res = await db.mention.createMany({ data, skipDuplicates: true });
      totalNew += res.count;
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", itemsFetched: posts.length, itemsNew: res.count, finishedAt: new Date() },
      });
    } catch (e) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: String((e as Error).message ?? e).slice(0, 500), finishedAt: new Date() },
      });
    }
  }

  await db.monitor.update({
    where: { id: m.id },
    data: { lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + m.refreshMinutes * 60_000) },
  });
  return totalNew;
}
