/**
 * Outgoing chat webhooks (Slack, Microsoft Teams). Only well-known webhook
 * hosts are allowed so a pasted URL can't be used to reach internal services.
 * Extra hosts: WEBHOOK_ALLOWED_HOSTS="hooks.example.com,other.example.com".
 */
const DEFAULT_HOSTS = ["hooks.slack.com", "outlook.office.com", "webhook.office.com", "logic.azure.com", "environment.api.powerplatform.com"];

export function isAllowedWebhook(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const extra = (process.env.WEBHOOK_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    return [...DEFAULT_HOSTS, ...extra].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Posts a plain-text message. Slack and Teams both accept {"text": "..."}. */
export async function postWebhook(url: string, text: string) {
  if (!isAllowedWebhook(url)) throw new Error("webhook host not allowed");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
}
