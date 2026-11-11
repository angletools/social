import { describe, expect, it } from "vitest";
import { momentum, outlierRatio, reflowBeats, toSrt, viralityScore } from "@/lib/trends/score";
import { heuristicDialect } from "@/lib/ai/heuristics";
import { inboxPriority } from "@/lib/analytics";

const now = Date.UTC(2026, 10, 11, 12);
const hoursAgo = (h: number) => new Date(now - h * 3600_000);

describe("virality", () => {
  it("rewards posts that beat the creator's usual reach", () => {
    const small = viralityScore({ views: 500_000, likes: 40_000, comments: 2_000, shares: 5_000, followers: 5_000, publishedAt: hoursAgo(24) }, now);
    const big = viralityScore({ views: 500_000, likes: 40_000, comments: 2_000, shares: 5_000, followers: 2_000_000, publishedAt: hoursAgo(24) }, now);
    expect(small).toBeGreaterThan(big);
  });

  it("uses a follower floor so tiny accounts don't explode the ratio", () => {
    expect(outlierRatio({ views: 10_000, followers: 10 })).toBe(10);
  });

  it("is zero without views", () => {
    expect(viralityScore({ views: 0, likes: 0, comments: 0, shares: 0, followers: 100, publishedAt: hoursAgo(1) }, now)).toBe(0);
  });
});

describe("momentum", () => {
  const first = hoursAgo(24 * 10);
  it("detects rising, fading and new formats", () => {
    expect(momentum([{ publishedAt: hoursAgo(10), views: 900_000 }, { publishedAt: hoursAgo(24 * 5), views: 100_000 }], first, now)).toBe("RISING");
    expect(momentum([{ publishedAt: hoursAgo(10), views: 10_000 }, { publishedAt: hoursAgo(24 * 5), views: 900_000 }], first, now)).toBe("FADING");
    expect(momentum([{ publishedAt: hoursAgo(10), views: 300_000 }, { publishedAt: hoursAgo(24 * 5), views: 400_000 }], first, now)).toBe("PEAKING");
    expect(momentum([], hoursAgo(10), now)).toBe("NEW");
  });
});

describe("timeline", () => {
  const beats = [
    { start: 9, duration: 2, vo: "", onScreen: "أنا يوم ٢٧", visual: "", shot: 1 },
    { start: 0, duration: 3.5, vo: "الحل؟ ادفع لنفسك أول", onScreen: "", visual: "", shot: 2 },
    { start: 0, duration: 0, vo: "", onScreen: "", visual: "", shot: 3 },
  ];
  it("re-flows start times and clamps durations", () => {
    const r = reflowBeats(beats);
    expect(r.map((b) => b.start)).toEqual([0, 2, 5.5]);
    expect(r[2].duration).toBe(2); // 0 becomes the default
  });
  it("writes SubRip captions with VO or on-screen text", () => {
    const srt = toSrt(beats);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:02,000\nأنا يوم ٢٧");
    expect(srt).toContain("2\n00:00:02,000 --> 00:00:05,500\nالحل؟ ادفع لنفسك أول");
    expect(srt).not.toContain("3\n");
  });
});

describe("dialect heuristics (no-AI fallback)", () => {
  it.each([
    ["التطبيق جامد أوي بجد", "EGYPTIAN"],
    ["وش السالفة الحين؟ ابغى أسحب", "SAUDI"],
    ["التطبيق وايد زين يالس استخدمه", "KHALEEJI"],
    ["wallah el app 7elw 3ala fekra", "ARABIZI"],
    ["The app keeps crashing", "ENGLISH"],
    ["نرجو منكم توضيح آلية السحب", "MSA"],
  ])("%s → %s", (text, dialect) => {
    expect(heuristicDialect(text)).toBe(dialect);
  });
});

describe("inbox priority", () => {
  const base = { isRisk: false, authorFollowers: 1000, publishedAt: new Date(), sentiment: null };
  it("puts churn risk above questions, and reach breaks ties", () => {
    expect(inboxPriority({ ...base, intent: "CHURN_RISK" })).toBeGreaterThan(inboxPriority({ ...base, intent: "QUESTION" }));
    expect(inboxPriority({ ...base, intent: "QUESTION", authorFollowers: 500_000 })).toBeGreaterThan(inboxPriority({ ...base, intent: "QUESTION" }));
    expect(inboxPriority({ ...base, intent: "PRAISE", isRisk: true })).toBeGreaterThan(inboxPriority({ ...base, intent: "COMPLAINT" }));
  });
});
