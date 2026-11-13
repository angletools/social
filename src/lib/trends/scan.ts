import type { DataMode, Platform } from "@prisma/client";
import { db } from "../db";
import { MonidClient, runItems } from "../monid/client";
import { normalizeItem } from "../monid/normalize";
import { trendSourceFor } from "../monid/sources";
import { extractFormats } from "../ai/trends";
import { aiEnabled } from "../ai/client";
import { DEMO_FORMATS, generateDemoTrendPosts } from "./demo";
import { momentum, outlierRatio, viralityScore } from "./score";

type Collected = {
  platform: Platform;
  externalId: string;
  url: string | null;
  text: string;
  authorHandle: string | null;
  authorFollowers: number | null;
  publishedAt: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  thumbnailUrl: string | null;
  durationSec: number | null;
  demoFormatKey?: string;
};

async function collect(watch: { id: string; platforms: Platform[]; seeds: string[]; accounts: string[]; organization: { dataMode: DataMode } }): Promise<{ posts: Collected[]; errors: string[] }> {
  const monid = MonidClient.fromEnv();
  if (watch.organization.dataMode === "DEMO") {
    const posts = generateDemoTrendPosts(watch.id, watch.platforms, Math.floor(Date.now() / 86400_000)).map((p) => ({
      ...p,
      url: null,
      thumbnailUrl: null,
      demoFormatKey: p.formatKey,
    }));
    return { posts, errors: [] };
  }
  if (!monid) throw new Error("Live collection is unavailable: configure Monid. No sample data was added.");
  const posts: Collected[] = [];
  const errors: string[] = [];
  for (const platform of watch.platforms) {
    const spec = trendSourceFor(platform);
    if (!spec) continue;
    try {
      const run = await monid.runAndWait(spec.provider, spec.endpoint, spec.build({ seeds: watch.seeds, accounts: watch.accounts, limit: 40 }));
      for (const raw of runItems(run)) {
        const p = normalizeItem(platform, raw);
        if (!p) continue;
        posts.push({
          platform,
          externalId: p.externalId,
          url: p.url,
          text: p.text,
          authorHandle: p.authorHandle,
          authorFollowers: p.authorFollowers,
          publishedAt: p.publishedAt,
          views: p.views,
          likes: p.likes,
          comments: p.comments,
          shares: p.shares,
          thumbnailUrl: p.mediaUrl,
          durationSec: p.durationSec,
        });
      }
    } catch (e) {
      errors.push(`${platform}: ${(e as Error).message}`.slice(0, 200));
    }
  }
  return { posts, errors };
}

/** Recomputes post count, views, score and momentum for every format of an organization. */
export async function refreshFormatStats(organizationId: string) {
  const formats = await db.trendFormat.findMany({
    where: { organizationId },
    include: { posts: { select: { publishedAt: true, views: true, viralityScore: true, platform: true } } },
  });
  for (const f of formats) {
    const recent = f.posts.filter((p) => Date.now() - p.publishedAt.getTime() < 14 * 86400_000);
    await db.trendFormat.update({
      where: { id: f.id },
      data: {
        postCount: f.posts.length,
        totalViews: f.posts.reduce((a, p) => a + p.views, 0),
        score: Math.round(recent.reduce((a, p) => a + p.viralityScore, 0) * 10) / 10,
        momentum: momentum(f.posts, f.firstSeenAt),
        platforms: [...new Set(f.posts.map((p) => p.platform))],
      },
    });
  }
}

/** Scans one niche: collects posts, scores them, detects formats. */
export async function scanWatch(watchId: string) {
  const watch = await db.trendWatch.findUnique({ where: { id: watchId }, include: { organization: { select: { dataMode: true } } } });
  if (!watch || !watch.enabled) return { posts: 0, formats: 0 };
  let collected: Awaited<ReturnType<typeof collect>>;
  try { collected = await collect(watch); }
  catch (e) {
    await db.trendWatch.update({ where: { id: watchId }, data: { lastScanError: String((e as Error).message).slice(0, 300) } });
    throw e;
  }
  const { posts, errors } = collected;
  const kept = posts.filter((p) => p.views >= watch.minViews || (p.platform === "X" && p.likes >= 200));

  // Demo formats are created once per organization so the demo has something to show without AI.
  const demoIds = new Map<string, string>();
  if (kept.some((p) => p.demoFormatKey)) {
    for (const f of DEMO_FORMATS) {
      const existing = await db.trendFormat.findFirst({ where: { organizationId: watch.organizationId, nameEn: f.nameEn } });
      if (existing && !existing.hookPatternAr) {
        await db.trendFormat.update({
          where: { id: existing.id },
          data: { hookPatternAr: f.hookPatternAr, whyItWorksAr: f.whyItWorksAr, structure: f.structure as unknown as object },
        });
      }
      const row =
        existing ??
        (await db.trendFormat.create({
          data: {
            organizationId: watch.organizationId,
            watchId,
            nameEn: f.nameEn,
            nameAr: f.nameAr,
            summaryEn: f.summaryEn,
            summaryAr: f.summaryAr,
            hookPattern: f.hookPattern,
            hookPatternAr: f.hookPatternAr,
            whyItWorks: f.whyItWorks,
            whyItWorksAr: f.whyItWorksAr,
            structure: f.structure as unknown as object,
            firstSeenAt: new Date(Date.now() - (f.momentum === "NEW" ? 1 : 9) * 86400_000),
          },
        }));
      demoIds.set(f.key, row.id);
    }
  }

  for (const p of kept) {
    const metrics = { views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, followers: p.authorFollowers, publishedAt: p.publishedAt };
    const data = {
      url: p.url,
      text: p.text.slice(0, 4000),
      authorHandle: p.authorHandle,
      authorFollowers: p.authorFollowers,
      publishedAt: p.publishedAt,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      thumbnailUrl: p.thumbnailUrl,
      durationSec: p.durationSec,
      viralityScore: viralityScore(metrics),
      outlierRatio: Math.round(outlierRatio(metrics) * 10) / 10,
      ...(p.demoFormatKey && { formatId: demoIds.get(p.demoFormatKey), analyzedAt: new Date() }),
    };
    await db.trendPost.upsert({
      where: { watchId_platform_externalId: { watchId, platform: p.platform, externalId: p.externalId } },
      create: { ...data, source: watch.organization.dataMode, organizationId: watch.organizationId, watchId, platform: p.platform, externalId: p.externalId },
      update: data,
    });
  }

  let formats = 0;
  let aiError: string | null = null;
  if (!kept.some((p) => p.demoFormatKey) && aiEnabled()) {
    try {
      formats = await extractFormats(watchId);
    } catch (e) {
      aiError = `AI: ${(e as Error).message}`.slice(0, 200);
    }
  }
  await refreshFormatStats(watch.organizationId);
  await db.trendWatch.update({
    where: { id: watchId },
    data: { ...(!errors.length && { lastScanAt: new Date() }), lastScanError: [...errors, aiError].filter(Boolean).join(" | ") || null },
  });
  if (errors.length) throw new Error(`Trend collection incomplete: ${errors.join("; ")}`);

  // Tell the team about formats that are taking off.
  const rising = await db.trendFormat.findMany({
    where: { watchId, momentum: { in: ["RISING", "NEW"] }, dismissed: false, lastSeenAt: { gte: new Date(Date.now() - 86400_000) } },
    orderBy: { score: "desc" },
    take: 3,
  });
  if (rising.length) {
    await db.notification.create({
      data: {
        organizationId: watch.organizationId,
        severity: "INFO",
        titleEn: `${rising.length} formats rising in “${watch.name}”`,
        titleAr: `${rising.length} قوالب صاعدة في «${watch.name}»`,
        bodyEn: rising.map((f) => f.nameEn).join(" · "),
        bodyAr: rising.map((f) => f.nameAr).join(" · "),
        link: "/studio",
      },
    });
  }
  return { posts: kept.length, formats };
}
