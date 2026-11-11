import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Dialect, Intent, Platform, Sentiment } from "@prisma/client";
import { db } from "../db";
import {
  getDialectBreakdown,
  getIntentBreakdown,
  getKpis,
  getShareOfVoice,
  getTimeseries,
  getTopAuthors,
  getTopSlang,
  getTopTopics,
  mentionWhere,
} from "../analytics";

const DIALECTS = ["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"] as const;
const INTENTS = ["COMPLAINT", "QUESTION", "PRAISE", "PURCHASE_INTENT", "CHURN_RISK", "SUGGESTION", "OTHER"] as const;

const PLATFORMS = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"] as const;
const days = z.number().int().min(1).max(365).describe("Look-back window in days, e.g. 1, 7, 30");
const monitorId = z.string().optional().describe("Limit to one monitor id (from list_monitors). Omit for all.");
const platform = z.enum(PLATFORMS).optional();

/**
 * Data tools for the assistant. Every query is hard-scoped to the caller's
 * organization; the model never supplies the organization id.
 */
export function assistantTools(orgId: string, onTool?: (name: string) => void) {
  const wrap = <T,>(name: string, fn: (i: T) => Promise<unknown>) => async (input: T) => {
    onTool?.(name);
    return JSON.stringify(await fn(input));
  };

  return [
    betaZodTool({
      name: "list_monitors",
      description: "List the organization's monitors (what is being tracked) with ids, types, terms, platforms and whether each is a competitor.",
      inputSchema: z.object({}),
      run: wrap("list_monitors", async () =>
        db.monitor.findMany({
          where: { organizationId: orgId },
          select: { id: true, name: true, type: true, terms: true, platforms: true, isCompetitor: true, status: true, description: true },
        }),
      ),
    }),
    betaZodTool({
      name: "get_overview_stats",
      description:
        "Totals for a period: mentions, engagement, potential reach, risk flags, sentiment counts and net sentiment, each with % change vs the previous period of equal length. Also returns share of voice across brand/competitor monitors.",
      inputSchema: z.object({ days, monitorId, platform }),
      run: wrap("get_overview_stats", async (i: { days: number; monitorId?: string; platform?: Platform }) => {
        const scope = { orgId, ...i };
        const [kpis, sov] = await Promise.all([getKpis(scope), getShareOfVoice(scope)]);
        return { kpis, shareOfVoice: sov };
      }),
    }),
    betaZodTool({
      name: "get_timeseries",
      description: "Mention counts per day (or per hour when days=1) split by sentiment. Use to find spikes and when they started.",
      inputSchema: z.object({ days, monitorId, platform }),
      run: wrap("get_timeseries", async (i: { days: number; monitorId?: string; platform?: Platform }) =>
        getTimeseries({ orgId, ...i }),
      ),
    }),
    betaZodTool({
      name: "get_top_topics",
      description: "Most discussed topics with mention counts and positive/negative counts per topic.",
      inputSchema: z.object({ days, monitorId, platform, limit: z.number().int().min(1).max(25).optional() }),
      run: wrap("get_top_topics", async (i: { days: number; monitorId?: string; platform?: Platform; limit?: number }) =>
        getTopTopics({ orgId, ...i }, i.limit ?? 10),
      ),
    }),
    betaZodTool({
      name: "get_top_authors",
      description: "Most influential authors (by followers) who posted about the monitored subjects, with mention count, engagement and average sentiment.",
      inputSchema: z.object({ days, monitorId, platform, limit: z.number().int().min(1).max(25).optional() }),
      run: wrap("get_top_authors", async (i: { days: number; monitorId?: string; platform?: Platform; limit?: number }) =>
        getTopAuthors({ orgId, ...i }, i.limit ?? 10),
      ),
    }),
    betaZodTool({
      name: "search_mentions",
      description:
        "Read actual posts. Filter by text query, sentiment, platform, topic key, risk flag, dialect, intent (e.g. CHURN_RISK), sarcasm, monitor and period. Sort by recency or engagement. Returns up to 40 posts with author, followers, engagement, sentiment, topics and URL.",
      inputSchema: z.object({
        days: days.optional(),
        monitorId,
        platform,
        query: z.string().optional().describe("Text to search for (Arabic or English)"),
        sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
        topic: z.string().optional().describe("Topic key from get_top_topics"),
        risksOnly: z.boolean().optional(),
        dialect: z.enum(DIALECTS).optional(),
        intent: z.enum(INTENTS).optional(),
        sarcasmOnly: z.boolean().optional(),
        sort: z.enum(["recent", "engagement", "reach"]).optional(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
      run: wrap(
        "search_mentions",
        async (i: {
          days?: number;
          monitorId?: string;
          platform?: Platform;
          query?: string;
          sentiment?: Sentiment;
          topic?: string;
          risksOnly?: boolean;
          dialect?: Dialect;
          intent?: Intent;
          sarcasmOnly?: boolean;
          sort?: "recent" | "engagement" | "reach";
          limit?: number;
        }) => {
          const rows = await db.mention.findMany({
            where: mentionWhere({
              orgId,
              days: i.days ?? 30,
              monitorId: i.monitorId,
              platform: i.platform,
              sentiment: i.sentiment,
              topic: i.topic,
              risk: i.risksOnly,
              q: i.query,
              dialect: i.dialect,
              intent: i.intent,
              sarcasm: i.sarcasmOnly,
            }),
            orderBy:
              i.sort === "engagement" ? { likes: "desc" } : i.sort === "reach" ? { authorFollowers: { sort: "desc", nulls: "last" } } : { publishedAt: "desc" },
            take: i.limit ?? 20,
            select: {
              id: true, platform: true, text: true, url: true, publishedAt: true, authorHandle: true, authorName: true,
              authorFollowers: true, likes: true, comments: true, shares: true, views: true, sentiment: true,
              topics: true, isRisk: true, riskReason: true, dialect: true, intent: true, sarcasm: true, slang: true,
              repliedAt: true, monitor: { select: { name: true } },
            },
          });
          return rows.map((r) => ({ ...r, text: r.text.slice(0, 600), monitor: r.monitor.name }));
        },
      ),
    }),
    betaZodTool({
      name: "get_dialect_insights",
      description:
        "Breakdown of mentions by Arabic dialect (Saudi, Gulf, Egyptian, Arabizi, MSA, English…) with sentiment and sarcasm counts, by intent (complaint, question, churn risk, purchase intent…), and the most frequent dialect slang terms with meanings.",
      inputSchema: z.object({ days, monitorId }),
      run: wrap("get_dialect_insights", async (i: { days: number; monitorId?: string }) => {
        const scope = { orgId, ...i };
        const [dialects, intents, slang] = await Promise.all([getDialectBreakdown(scope), getIntentBreakdown(scope), getTopSlang(scope, 15)]);
        return { dialects, intents, slang };
      }),
    }),
    betaZodTool({
      name: "get_trending_formats",
      description:
        "Viral short-form video formats detected in the organization's niches (content studio), with momentum (NEW/RISING/PEAKING/FADING), hook pattern, why it works, structure and top example posts. Use for content ideas.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      run: wrap("get_trending_formats", async (i: { limit?: number }) =>
        db.trendFormat.findMany({
          where: { organizationId: orgId, dismissed: false },
          orderBy: { score: "desc" },
          take: i.limit ?? 8,
          select: {
            id: true, nameEn: true, nameAr: true, summaryEn: true, hookPattern: true, whyItWorks: true, structure: true,
            momentum: true, score: true, postCount: true, totalViews: true,
            posts: { orderBy: { viralityScore: "desc" }, take: 2, select: { text: true, views: true, outlierRatio: true, platform: true, url: true } },
          },
        }),
      ),
    }),
  ];
}
