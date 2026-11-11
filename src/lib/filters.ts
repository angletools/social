import type { Dialect, Intent, Platform, Prisma, Sentiment } from "@prisma/client";
import { INBOX_INTENTS, parseDays, type MentionFilters } from "./analytics";

const PLATFORMS = new Set(["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"]);
const SENTIMENTS = new Set(["POSITIVE", "NEUTRAL", "NEGATIVE"]);
const DIALECTS = new Set(["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"]);
const INTENTS = new Set(["COMPLAINT", "QUESTION", "PRAISE", "PURCHASE_INTENT", "CHURN_RISK", "SUGGESTION", "OTHER"]);

/** Parses mention filters from URL search params. */
export function filtersFromParams(orgId: string, sp: Record<string, string | undefined>, userId?: string): MentionFilters {
  return {
    orgId,
    days: sp.days ? parseDays(sp.days) : 30,
    monitorId: sp.monitor || undefined,
    platform: sp.platform && PLATFORMS.has(sp.platform) ? (sp.platform as Platform) : undefined,
    sentiment: sp.sentiment && SENTIMENTS.has(sp.sentiment) ? (sp.sentiment as Sentiment) : undefined,
    risk: sp.risk === "1",
    q: sp.q?.trim().slice(0, 100) || undefined,
    status: sp.status || undefined,
    topic: sp.topic || undefined,
    dialect: sp.dialect && DIALECTS.has(sp.dialect) ? (sp.dialect as Dialect) : undefined,
    intent: sp.intent && INTENTS.has(sp.intent) ? (sp.intent as Intent) : undefined,
    sarcasm: sp.sarcasm === "1",
    assignedToId: sp.mine === "1" && userId ? userId : undefined,
    needsReply: sp.reply === "1",
  };
}

// ---------- Mentions page: quick views and sorting ----------

/** Authors with at least this many followers count as influencers. */
export const INFLUENCER_FOLLOWERS = 50_000;

export const QUICK_VIEWS = ["all", "reply", "negative", "risks", "questions", "churn", "influencers", "mine"] as const;
export type QuickView = (typeof QUICK_VIEWS)[number];

/** Older links used one flag per view (`?risk=1`); they map onto `?view=`. */
const LEGACY_VIEWS: [string, QuickView][] = [
  ["reply", "reply"],
  ["risk", "risks"],
  ["mine", "mine"],
];

export function quickView(sp: Record<string, string | undefined>): QuickView {
  if (sp.view && (QUICK_VIEWS as readonly string[]).includes(sp.view)) return sp.view as QuickView;
  return LEGACY_VIEWS.find(([k]) => sp[k] === "1")?.[1] ?? "all";
}

/** Rewrites legacy view flags into `view=`; returns null when nothing needs to change. */
export function normalizeViewParams(sp: Record<string, string | undefined>): URLSearchParams | null {
  if (!LEGACY_VIEWS.some(([k]) => sp[k] !== undefined)) return null;
  const view = quickView(sp);
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v !== undefined && !LEGACY_VIEWS.some(([l]) => l === k)) next.set(k, v);
  if (view !== "all") next.set("view", view);
  return next;
}

/** Extra condition for a quick view. It is ANDed with the other filters, so views never fight the selects. */
export function viewWhere(view: QuickView, userId?: string): Prisma.MentionWhereInput {
  switch (view) {
    case "reply":
      return { repliedAt: null, intent: { in: INBOX_INTENTS } };
    case "negative":
      return { sentiment: "NEGATIVE" };
    case "risks":
      return { isRisk: true };
    case "questions":
      return { intent: "QUESTION" };
    case "churn":
      return { intent: "CHURN_RISK" };
    case "influencers":
      return { authorFollowers: { gte: INFLUENCER_FOLLOWERS } };
    case "mine":
      // No user means nobody: never fall back to "everything".
      return { assignedToId: userId ?? "__none__" };
    default:
      return {};
  }
}

export const SORTS = ["new", "engaged", "reach"] as const;
export type MentionSort = (typeof SORTS)[number];
export const parseSort = (v?: string): MentionSort => ((SORTS as readonly string[]).includes(v ?? "") ? (v as MentionSort) : "new");

export function sortOrder(sort: MentionSort): Prisma.MentionOrderByWithRelationInput[] {
  if (sort === "engaged") return [{ engagement: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }, { id: "desc" }];
  if (sort === "reach") return [{ authorFollowers: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }, { id: "desc" }];
  return [{ publishedAt: "desc" }, { id: "desc" }];
}
