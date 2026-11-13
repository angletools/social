import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertRule } from "@prisma/client";

const count = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ db: { mention: { count, findFirst, findMany } } }));
vi.mock("@/lib/mention-query", () => ({ countUniqueMentions: (where: unknown) => count({ where }), findUniqueMentions: findMany }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/webhooks", () => ({ postWebhook: vi.fn() }));

const { checkRule } = await import("@/lib/alerts");

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: "r1",
  organizationId: "org1",
  monitorId: null,
  name: "May leave us",
  kind: "CHURN_RISK",
  threshold: 0,
  minimumVolume: 20,
  windowMinutes: 1440,
  keyword: null,
  notifyEmail: false,
  emails: [],
  webhookUrl: null,
  enabled: true,
  cooldownMinutes: 180,
  lastTriggeredAt: null,
  createdAt: new Date(),
  ...over,
});

describe("CHURN_RISK alerts", () => {
  beforeEach(() => {
    count.mockReset();
    findFirst.mockReset();
  });

  it("fires when churn-risk posts exceed the threshold", async () => {
    count.mockResolvedValue(3);
    findFirst.mockResolvedValue({ text: "خلاص بسكّر حسابي وأروح لمنافس" });
    const hit = await checkRule(rule({ threshold: 2 }));
    expect(hit).not.toBeNull();
    expect(hit!.titleEn).toBe("3 posts express intent to leave");
    expect(hit!.bodyAr).toContain("بسكّر حسابي");
    expect(hit!.link).toBe("/mentions?intent=CHURN_RISK");
  });

  it("does not fire at or below the threshold", async () => {
    count.mockResolvedValue(2);
    expect(await checkRule(rule({ threshold: 2 }))).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("with threshold 0, a single post is enough", async () => {
    count.mockResolvedValue(1);
    findFirst.mockResolvedValue({ text: "I'm moving my money elsewhere" });
    const hit = await checkRule(rule());
    expect(hit?.titleEn).toBe("Someone says they may leave us");
    expect(hit?.severity).toBe("WARNING");
  });

  it("queries only CHURN_RISK posts in the window, scoped to org and monitor", async () => {
    count.mockResolvedValue(0);
    const before = Date.now();
    await checkRule(rule({ monitorId: "m1", windowMinutes: 60 }));
    const where = count.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: "org1", monitorId: "m1", relevant: true, intent: "CHURN_RISK" });
    const since = where.publishedAt.gte as Date;
    expect(before - since.getTime()).toBeGreaterThanOrEqual(60 * 60_000 - 1000);
    expect(before - since.getTime()).toBeLessThan(61 * 60_000);
  });

  it("skips posts already counted by the previous alert", async () => {
    count.mockResolvedValue(0);
    const last = new Date(Date.now() - 30 * 60_000);
    await checkRule(rule({ lastTriggeredAt: last }));
    const where = count.mock.calls[0][0].where;
    expect(where.OR[0].enrichedAt.gte).toEqual(last);
    expect(where.OR[1].createdAt.gte).toEqual(last);
  });

  it("links to the monitor's churn posts", async () => {
    count.mockResolvedValue(5);
    findFirst.mockResolvedValue(null);
    const hit = await checkRule(rule({ monitorId: "m1" }));
    expect(hit?.link).toBe("/mentions?monitor=m1&intent=CHURN_RISK");
    expect(hit?.severity).toBe("CRITICAL");
  });
});

describe("KEYWORD alerts", () => {
  it("watches several comma-separated words, Arabic commas included", async () => {
    findMany.mockResolvedValue([{ text: "انتبهوا من حساب ينتحل الشركة، نصب واضح" }]);
    const hit = await checkRule(rule({ kind: "KEYWORD", keyword: "احتيال، نصب, hack" }));
    const where = findMany.mock.calls.at(-1)![0].where;
    expect(where.OR.map((o: { text: { contains: string } }) => o.text.contains)).toEqual(["احتيال", "نصب", "hack"]);
    expect(hit?.titleAr).toBe("ذُكرت كلمة «نصب»");
    expect(hit?.link).toBe(`/mentions?q=${encodeURIComponent("نصب")}`);
  });
});

describe("rules as sentences", async () => {
  const { ruleSentence, thresholdFromInput } = await import("@/lib/alert-rules");
  const { default: en } = await import("@/lib/i18n/en");
  const { default: ar } = await import("@/lib/i18n/ar");
  const base = { threshold: 0, windowMinutes: 1440, keyword: null };
  it("reads churn with one person as 'someone'", () => {
    expect(ruleSentence({ ...base, kind: "CHURN_RISK" }, en.alertsPage, "en")).toBe("When someone says they'll leave us or move to a competitor");
    expect(ruleSentence({ ...base, kind: "CHURN_RISK", threshold: 2, windowMinutes: 60 }, en.alertsPage, "en")).toBe("When ⁦3⁩ or more people say they'll leave us within 1 hour");
  });
  it("stores 'at least N people' as threshold N - 1", () => {
    expect(thresholdFromInput("CHURN_RISK", "3")).toBe(2);
    expect(thresholdFromInput("CHURN_RISK", "1")).toBe(0);
    expect(thresholdFromInput("HIGH_REACH", "50,000")).toBe(50000);
  });
  it("lists keywords in the reader's language", () => {
    expect(ruleSentence({ ...base, kind: "KEYWORD", keyword: "احتيال، نصب، hack" }, ar.alertsPage, "ar")).toBe("عندما يظهر منشور فيه «احتيال» أو «نصب» أو «hack»");
    expect(ruleSentence({ ...base, kind: "NEGATIVE_SPIKE", threshold: 35 }, ar.alertsPage, "ar")).toBe("عندما تتجاوز الإشارات السلبية ⁦35%⁩ خلال 24 ساعة");
  });
});
