import { describe, expect, it } from "vitest";
import { isAllowedWebhook } from "@/lib/webhooks";

describe("webhook allowlist", () => {
  it("accepts Slack and Microsoft Teams webhooks", () => {
    expect(isAllowedWebhook("https://hooks.slack.com/services/T0/B0/xyz")).toBe(true);
    expect(isAllowedWebhook("https://acme.webhook.office.com/webhookb2/abc")).toBe(true);
    expect(isAllowedWebhook("https://prod-12.westeurope.logic.azure.com/workflows/1")).toBe(true);
  });

  it("rejects plain http, internal hosts and look-alikes", () => {
    expect(isAllowedWebhook("http://hooks.slack.com/services/x")).toBe(false);
    expect(isAllowedWebhook("https://localhost:5432/")).toBe(false);
    expect(isAllowedWebhook("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedWebhook("https://hooks.slack.com.evil.example/x")).toBe(false);
    expect(isAllowedWebhook("not a url")).toBe(false);
  });

  it("allows extra hosts from the environment", () => {
    process.env.WEBHOOK_ALLOWED_HOSTS = "chat.example.com";
    expect(isAllowedWebhook("https://chat.example.com/hook")).toBe(true);
    delete process.env.WEBHOOK_ALLOWED_HOSTS;
  });
});
