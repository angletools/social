import type { Platform, Sentiment } from "@prisma/client";
import { parseDays, type MentionFilters } from "./analytics";

const PLATFORMS = new Set(["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"]);
const SENTIMENTS = new Set(["POSITIVE", "NEUTRAL", "NEGATIVE"]);

/** Parses mention filters from URL search params. */
export function filtersFromParams(orgId: string, sp: Record<string, string | undefined>): MentionFilters {
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
  };
}
