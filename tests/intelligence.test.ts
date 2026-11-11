import { describe, expect, it } from "vitest";
import { emergingThemes, fallbackBrief, pctChange, rankDrivers, type TopicPeriodRow } from "@/lib/intelligence/core";

const row = (key: string, n: number, pos: number, neg: number, prevN = 0, prevPos = 0, prevNeg = 0): TopicPeriodRow => ({
  key,
  labelEn: key,
  labelAr: `ع-${key}`,
  n,
  pos,
  neg,
  prevN,
  prevPos,
  prevNeg,
});

const rows = [
  row("app-outage", 120, 5, 90, 40, 2, 30),
  row("fees", 60, 4, 30, 60, 5, 30),
  row("onboarding", 80, 60, 4, 70, 50, 5),
  row("cashback", 30, 25, 1, 0, 0, 0),
  row("tiny", 3, 0, 3, 0, 0, 0),
];

describe("pctChange", () => {
  it("returns null when nothing came before", () => expect(pctChange(5, 0)).toBeNull());
  it("rounds the % change", () => {
    expect(pctChange(90, 30)).toBe(200);
    expect(pctChange(30, 60)).toBe(-50);
  });
});

describe("rankDrivers", () => {
  it("ranks topics by their share of negative conversation", () => {
    const d = rankDrivers(rows, "negative");
    expect(d.map((x) => x.key)).toEqual(["app-outage", "fees", "onboarding", "tiny", "cashback"]);
    expect(d[0].share).toBe(70.3); // 90 / 128
    expect(d[0].change).toBe(200);
    expect(d[1].change).toBe(0);
    expect(d.reduce((a, x) => a + x.share, 0)).toBeCloseTo(100, 0);
  });
  it("ranks positive drivers and reports net sentiment", () => {
    const d = rankDrivers(rows, "positive", 2);
    expect(d.map((x) => x.key)).toEqual(["onboarding", "cashback"]);
    expect(d[1].change).toBeNull();
    expect(d[0].net).toBe(70);
  });
  it("is empty when there is no sentiment of that kind", () => expect(rankDrivers([row("a", 5, 0, 0)], "negative")).toEqual([]));
});

describe("emergingThemes", () => {
  it("weights growth by volume and ignores tiny topics", () => {
    const e = emergingThemes(rows);
    expect(e[0].key).toBe("app-outage");
    expect(e.map((x) => x.key)).toContain("cashback");
    expect(e.map((x) => x.key)).not.toContain("tiny");
    expect(e.map((x) => x.key)).not.toContain("fees"); // flat
  });
});

describe("fallbackBrief", () => {
  const input = {
    days: 7,
    total: 290,
    netSentiment: -18,
    netChange: -6,
    churn: 12,
    churnPrev: 5,
    negative: rankDrivers(rows, "negative"),
    positive: rankDrivers(rows, "positive"),
    emerging: emergingThemes(rows),
    examples: { "app-outage": ["m1", "m2", "m3", "m4"] },
  };
  it("writes both languages from the numbers", () => {
    const b = fallbackBrief(input);
    expect(b.summaryEn).toContain("Net sentiment -18");
    expect(b.summaryEn).toContain("app-outage");
    expect(b.summaryEn).toContain("12 posts signal churn");
    expect(b.summaryAr).toContain("ع-app-outage");
  });
  it("leads with frustrations, adds what people love, never repeats a topic", () => {
    const b = fallbackBrief(input);
    expect(b.themes[0]).toMatchObject({ topicKey: "app-outage", sentiment: "NEGATIVE", exampleMentionIds: ["m1", "m2", "m3"] });
    expect(b.themes.some((t) => t.sentiment === "POSITIVE")).toBe(true);
    const keys = b.themes.map((t) => t.topicKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(b.themes.length).toBeLessThanOrEqual(6);
  });
  it("handles an empty period", () => {
    const b = fallbackBrief({ ...input, total: 0, negative: [], positive: [], emerging: [] });
    expect(b.themes).toEqual([]);
    expect(b.summaryEn).toMatch(/Not enough data/);
  });
});
