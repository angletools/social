import { describe, expect, it } from "vitest";
import { normalizeItem } from "@/lib/monid/normalize";
import { runItems } from "@/lib/monid/client";
import { sourceFor, supportedPlatforms } from "@/lib/monid/sources";
import { heuristicSentiment } from "@/lib/ai/heuristics";
import { guessLang } from "@/lib/utils";

describe("normalizeItem", () => {
  it("maps an X (tweet-scraper) item", () => {
    const p = normalizeItem("X", {
      id: "1789",
      text: "تطبيق ممتاز",
      url: "https://x.com/a/status/1789",
      createdAt: "Mon Nov 10 08:00:00 +0000 2026",
      likeCount: 12,
      retweetCount: 3,
      replyCount: 1,
      viewCount: 900,
      lang: "ar",
      author: { userName: "saud", name: "Saud", followers: 5000, isBlueVerified: true },
    })!;
    expect(p).toMatchObject({ externalId: "1789", authorHandle: "saud", authorFollowers: 5000, authorVerified: true, likes: 12, shares: 3, comments: 1, views: 900, lang: "ar" });
    expect(p.publishedAt.toISOString()).toBe("2026-11-10T08:00:00.000Z");
  });

  it("maps a TikTok item with nested authorMeta and unix time", () => {
    const p = normalizeItem("TIKTOK", {
      id: "tt1",
      text: "video",
      createTime: 1762761600,
      diggCount: 50,
      playCount: 1000,
      authorMeta: { name: "creator", fans: 200 },
      webVideoUrl: "https://tiktok.com/v/1",
    })!;
    expect(p.authorHandle).toBe("creator");
    expect(p.likes).toBe(50);
    expect(p.views).toBe(1000);
    expect(p.publishedAt.getTime()).toBe(1762761600 * 1000);
  });

  it("joins YouTube title and description", () => {
    const p = normalizeItem("YOUTUBE", { id: "v1", title: "Title", text: "Body", date: "2026-11-01", viewCount: 5 })!;
    expect(p.text).toBe("Title\n\nBody");
  });

  it("rejects items without id or text", () => {
    expect(normalizeItem("X", { text: "no id" })).toBeNull();
    expect(normalizeItem("X", { id: "1" })).toBeNull();
    expect(normalizeItem("X", null)).toBeNull();
  });
});

describe("runItems", () => {
  it("finds the item list in different envelopes", () => {
    expect(runItems({ runId: "r", status: "COMPLETED", providerResponse: { data: [1, 2] } })).toEqual([1, 2]);
    expect(runItems({ runId: "r", status: "COMPLETED", providerResponse: { data: { items: [1] } } })).toEqual([1]);
    expect(runItems({ runId: "r", status: "COMPLETED", output: { results: [3] } })).toEqual([3]);
    expect(runItems({ runId: "r", status: "COMPLETED" })).toEqual([]);
  });
});

describe("sources", () => {
  const m = { terms: ["Malaa", "#مالأ"], excludeTerms: ["job"], languages: ["ar"], maxItemsPerRun: 25 };

  it("builds an X search query", () => {
    const body = sourceFor("X", "KEYWORD")!.build({ ...m, type: "KEYWORD" });
    expect(body).toEqual({ searchTerms: ["(Malaa OR مالأ) -job lang:ar"], maxItems: 25, sort: "Latest" });
  });

  it("builds X profile and hashtag queries", () => {
    expect(sourceFor("X", "PROFILE")!.build({ ...m, terms: ["@brand"], type: "PROFILE" }).searchTerms).toEqual([
      "((from:brand OR to:brand OR @brand)) -job lang:ar",
    ]);
    expect(sourceFor("X", "HASHTAG")!.build({ ...m, terms: ["tag"], type: "HASHTAG" }).searchTerms).toEqual(["(#tag) -job lang:ar"]);
  });

  it("lets env override the endpoint", () => {
    process.env.MONID_ENDPOINT_X_KEYWORD = "other#vendor/x-search";
    expect(sourceFor("X", "KEYWORD")).toMatchObject({ provider: "other", endpoint: "vendor/x-search" });
    delete process.env.MONID_ENDPOINT_X_KEYWORD;
  });

  it("reports platform support per monitor type", () => {
    expect(supportedPlatforms("PROFILE")).toContain("FACEBOOK");
    expect(supportedPlatforms("HASHTAG")).not.toContain("FACEBOOK");
  });
});

describe("heuristics", () => {
  it("scores Arabic and English", () => {
    expect(heuristicSentiment("التطبيق ممتاز وسهل").sentiment).toBe("POSITIVE");
    expect(heuristicSentiment("the app froze, terrible").sentiment).toBe("NEGATIVE");
    expect(heuristicSentiment("حساب وهمي احتيال").isRisk).toBe(true);
    expect(guessLang("مرحبا hello")).toBe("ar");
    expect(guessLang("hello there")).toBe("en");
  });
});
