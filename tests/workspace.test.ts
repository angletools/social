import { describe, expect, it } from "vitest";
import { alertWebhooks, maskSecret, maskWebhook, monthStart, parseRules, senderFor, serializeRules, usageBand, webhookKind } from "@/lib/workspace";
import { beatForNote } from "@/lib/draft-notes";

const org = { slackWebhookUrl: "https://hooks.slack.com/services/T0/B0/x8Kd", teamsWebhookUrl: "https://acme.webhook.office.com/webhookb2/abc", emailFrom: "alerts@acme.sa" };

describe("alert delivery", () => {
  it("uses the rule's own webhook over the workspace defaults", () => {
    expect(alertWebhooks({ webhookUrl: "https://hooks.slack.com/services/own" }, org)).toEqual(["https://hooks.slack.com/services/own"]);
  });
  it("falls back to every workspace channel", () => {
    expect(alertWebhooks({ webhookUrl: null }, org)).toEqual([org.slackWebhookUrl, org.teamsWebhookUrl]);
    expect(alertWebhooks({ webhookUrl: null }, { slackWebhookUrl: null, teamsWebhookUrl: null, emailFrom: null })).toEqual([]);
    expect(alertWebhooks({ webhookUrl: null }, null)).toEqual([]);
  });
  it("picks the sender address", () => {
    expect(senderFor(org, "env@x.sa")).toBe("alerts@acme.sa");
    expect(senderFor({ emailFrom: null }, "env@x.sa")).toBe("env@x.sa");
    expect(senderFor(null, undefined)).toContain("angle social");
  });
  it("tells Slack from Teams", () => {
    expect(webhookKind(org.slackWebhookUrl)).toBe("slack");
    expect(webhookKind(org.teamsWebhookUrl)).toBe("teams");
    expect(webhookKind("https://example.com/hook")).toBeNull();
    expect(webhookKind("not a url")).toBeNull();
  });
});

describe("masking", () => {
  it("keeps a prefix and the last four characters", () => {
    expect(maskSecret("mnd_live_8a7sd6f87as6df4f2a")).toBe("mnd_live_••••••••4f2a");
    expect(maskSecret("sk-ant-api03-abcdefghijklmnopQ7wA")).toBe("sk-ant-••••••••Q7wA");
    expect(maskSecret("short")).toBe("••••••••");
    expect(maskSecret(undefined)).toBe("");
  });
  it("never shows a webhook's secret path", () => {
    expect(maskWebhook(org.slackWebhookUrl)).toBe("hooks.slack.com/…/x8Kd");
    expect(maskWebhook(null)).toBe("");
  });
});

describe("compliance rules", () => {
  it("reads one rule per line, dropping bullets and numbers", () => {
    expect(parseRules("- Never promise returns.\n2. Add a risk line\n\n• لا نذكر المنافسين")).toEqual(["Never promise returns.", "Add a risk line", "لا نذكر المنافسين"]);
  });
  it("splits an older one-paragraph value into sentences", () => {
    expect(parseRules("Never promise returns. Promotional posts say investing involves risk. لا نذكر المنافسين.")).toEqual([
      "Never promise returns.",
      "Promotional posts say investing involves risk.",
      "لا نذكر المنافسين.",
    ]);
  });
  it("round-trips through storage", () => {
    const rules = ["One", "Two\nlines", "  "];
    expect(parseRules(serializeRules(rules))).toEqual(["One", "Two lines"]);
    expect(parseRules(null)).toEqual([]);
  });
});

describe("usage", () => {
  it("starts the month at local midnight", () => {
    // 1 Nov 00:00 in Riyadh (UTC+3) is 31 Oct 21:00 UTC.
    expect(monthStart("Asia/Riyadh", new Date(Date.UTC(2026, 10, 11, 12))).toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(monthStart("UTC", new Date(Date.UTC(2026, 10, 11, 12))).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("bands the meters", () => {
    expect(usageBand(82_410, 100_000)).toEqual({ pct: 82, band: "warn" });
    expect(usageBand(7, 15).band).toBe("ok");
    expect(usageBand(120, 100)).toEqual({ pct: 100, band: "neg" });
    expect(usageBand(3, 0).pct).toBe(100);
  });
});

describe("compliance notes point at a line", () => {
  const beats = [
    { start: 0, duration: 3, vo: "كل شهر نفس القصة", onScreen: "أنا يوم 27" },
    { start: 3, duration: 5, vo: "المشكلة إنك تستثمر باللي يتبقى", onScreen: "" },
    { start: 16, duration: 8, vo: "بآخر السنة بتشوف الفرق.", onScreen: "500 ريال" },
  ];
  it("matches a quoted phrase", () => expect(beatForNote("“بتشوف الفرق” can read as a promise of returns", beats)).toBe(2));
  it("matches a time", () => expect(beatForNote("At 4s the claim needs a source", beats)).toBe(1));
  it("returns -1 for general notes", () => expect(beatForNote("Risk line is in the call to action.", beats)).toBe(-1));
});
