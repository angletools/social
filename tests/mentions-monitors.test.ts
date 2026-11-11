import { describe, expect, it } from "vitest";
import { INFLUENCER_FOLLOWERS, normalizeViewParams, parseSort, quickView, sortOrder, viewWhere } from "@/lib/filters";
import {
  addDays,
  everyLabel,
  fillDays,
  highlight,
  needleFor,
  netSentiment,
  pauseIndex,
  pctChange,
  perDayFromWeek,
  roughPerDay,
  sparkPaths,
  squares,
  topicTone,
} from "@/lib/monitor-stats";

describe("mentions quick views", () => {
  it("reads view= and maps the older one-flag links onto it", () => {
    expect(quickView({ view: "influencers" })).toBe("influencers");
    expect(quickView({ view: "nonsense" })).toBe("all");
    expect(quickView({ risk: "1" })).toBe("risks");
    expect(quickView({ reply: "1", days: "7" })).toBe("reply");
    expect(quickView({})).toBe("all");
  });

  it("rewrites legacy links and keeps the other filters", () => {
    expect(normalizeViewParams({ days: "7" })).toBeNull();
    expect(normalizeViewParams({ risk: "1", days: "7" })?.toString()).toBe("days=7&view=risks");
    expect(normalizeViewParams({ mine: "1" })?.toString()).toBe("view=mine");
  });

  it("builds a condition per view", () => {
    expect(viewWhere("all")).toEqual({});
    expect(viewWhere("influencers")).toEqual({ authorFollowers: { gte: INFLUENCER_FOLLOWERS } });
    expect(INFLUENCER_FOLLOWERS).toBe(50_000);
    expect(viewWhere("churn")).toEqual({ intent: "CHURN_RISK" });
    expect(viewWhere("mine", "u1")).toEqual({ assignedToId: "u1" });
    // Without a user, "mine" must match nothing rather than everything.
    expect(viewWhere("mine")).toEqual({ assignedToId: "__none__" });
    expect(viewWhere("reply")).toMatchObject({ repliedAt: null });
  });

  it("sorts newest, most engaged or biggest reach, newest breaking ties", () => {
    expect(parseSort("engaged")).toBe("engaged");
    expect(parseSort("drop table")).toBe("new");
    expect(sortOrder("new")[0]).toEqual({ publishedAt: "desc" });
    expect(sortOrder("engaged")[0]).toEqual({ engagement: { sort: "desc", nulls: "last" } });
    expect(sortOrder("reach")[0]).toEqual({ authorFollowers: { sort: "desc", nulls: "last" } });
    expect(sortOrder("reach")[1]).toEqual({ publishedAt: "desc" });
  });
});

describe("monitor week stats", () => {
  it("fills missing days with zero, across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    const d = fillDays("2026-10-29", 7, [{ day: "2026-10-31", n: 4 }, { day: "2026-11-04", n: 2 }]);
    expect(d.map((x) => x.n)).toEqual([0, 0, 4, 0, 0, 0, 2]);
    expect(d[6].day).toBe("2026-11-04");
  });

  it("compares with the previous week", () => {
    expect(pctChange(113, 100)).toBe(13);
    expect(pctChange(92, 100)).toBe(-8);
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(5, 0)).toBeNull();
    expect(netSentiment(24, 37, 100)).toBe(-13);
    expect(netSentiment(0, 0, 0)).toBe(0);
  });

  it("finds the day a monitor paused, in the organization's timezone", () => {
    const days = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"];
    // 22:30 UTC on the 7th is already the 8th in Riyadh (UTC+3).
    expect(pauseIndex(days, new Date("2026-11-07T22:30:00Z"), "Asia/Riyadh")).toBe(3);
    expect(pauseIndex(days, new Date("2026-11-07T22:30:00Z"), "UTC")).toBe(2);
    expect(pauseIndex(days, new Date("2026-10-01T00:00:00Z"), "UTC")).toBe(0);
    expect(pauseIndex(days, null, "UTC")).toBeNull();
  });

  it("draws a sparkline that stops where the monitor paused", () => {
    const full = sparkPaths([1, 2, 3, 4, 5, 6, 7], 150, 40);
    expect(full.last[0]).toBeCloseTo(150);
    const cut = sparkPaths([1, 2, 3, 4, 5, 6, 7], 150, 40, 3);
    expect(cut.last[0]).toBeCloseTo(75);
    expect(cut.area.endsWith("Z")).toBe(true);
    // All zeros stays on the baseline instead of dividing by zero.
    expect(sparkPaths([0, 0, 0], 150, 40).line).not.toContain("NaN");
  });
});

describe("new monitor preview", () => {
  it("turns a week of matches into posts a day", () => {
    expect(perDayFromWeek(945)).toBe(135);
    expect(perDayFromWeek(2)).toBe(1);
    expect(perDayFromWeek(0)).toBe(0);
  });

  it("gives a rough estimate that grows with terms and platforms", () => {
    const base = { type: "KEYWORD" as const, terms: 3, platforms: 3, supported: 5, languages: 2 };
    const one = roughPerDay({ ...base, terms: 1 });
    expect(roughPerDay(base)).toBeGreaterThan(one);
    expect(roughPerDay({ ...base, platforms: 5 })).toBeGreaterThan(roughPerDay(base));
    expect(roughPerDay({ ...base, languages: 1 })).toBeLessThan(roughPerDay(base));
    expect(roughPerDay({ ...base, type: "TOPIC" })).toBeLessThan(roughPerDay(base));
    expect(roughPerDay({ ...base, terms: 0 })).toBe(0);
    expect(roughPerDay({ ...base, platforms: 0 })).toBe(0);
  });

  it("highlights the longest matching term, ignoring case", () => {
    expect(needleFor("HASHTAG", "#SaudiStocks")).toBe("#SaudiStocks");
    expect(needleFor("PROFILE", "NakhlaInvest")).toBe("@NakhlaInvest");
    const parts = highlight("nakhla invest's screen and Nakhla app", ["Nakhla", "Nakhla Invest"]);
    expect(parts.filter((p) => p.hit).map((p) => p.t)).toEqual(["nakhla invest", "Nakhla"]);
    expect(parts.map((p) => p.t).join("")).toBe("nakhla invest's screen and Nakhla app");
    expect(highlight("no match (here)", ["a+b"])).toEqual([{ t: "no match (here)", hit: false }]);
    expect(highlight("ثالث مرة تطبيق نخلة يطلعني", ["نخلة"]).find((p) => p.hit)?.t).toBe("نخلة");
  });
});

describe("monitor detail helpers", () => {
  it("splits sentiment squares so they always add up", () => {
    const s = squares({ POSITIVE: 227, NEUTRAL: 369, NEGATIVE: 349 }, 60);
    expect(s.POSITIVE + s.NEUTRAL + s.NEGATIVE).toBe(60);
    expect(s).toEqual({ POSITIVE: 14, NEUTRAL: 24, NEGATIVE: 22 });
    expect(squares({ POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 })).toEqual({ POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 });
  });

  it("colours topics by what most people feel", () => {
    expect(topicTone(182, 10, 120)).toBe("neg");
    expect(topicTone(64, 50, 2)).toBe("pos");
    expect(topicTone(121, 30, 40)).toBe("warn");
    expect(topicTone(41, 5, 5)).toBe("neutral");
  });

  it("names the check frequency", () => {
    const forms = { minutes: "Every {n} minutes", hour: "Every hour", hours: "Every {n} hours", day: "Every day" };
    expect(everyLabel(60, forms)).toBe("Every hour");
    expect(everyLabel(120, forms)).toBe("Every 2 hours");
    expect(everyLabel(30, forms)).toBe("Every 30 minutes");
    expect(everyLabel(1440, forms)).toBe("Every day");
  });
});
