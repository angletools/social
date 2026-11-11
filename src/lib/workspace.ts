/**
 * Workspace settings helpers: delivery channels, compliance rule lists, key
 * masking and the usage period. Pure functions, so they are easy to test and
 * safe to import from server and client code.
 */

export type Channels = { slackWebhookUrl: string | null; teamsWebhookUrl: string | null; emailFrom: string | null };

export const DEFAULT_SENDER = "angle social <alerts@rasd.local>";

/** Where an alert is posted: the rule's own webhook wins, otherwise every workspace default. */
export function alertWebhooks(rule: { webhookUrl: string | null }, org: Partial<Channels> | null | undefined): string[] {
  if (rule.webhookUrl) return [rule.webhookUrl];
  return [org?.slackWebhookUrl, org?.teamsWebhookUrl].filter((u): u is string => Boolean(u));
}

/** Sender for alert and report emails: the workspace address, then EMAIL_FROM, then the default. */
export function senderFor(org: Partial<Channels> | null | undefined, env = process.env.EMAIL_FROM) {
  return org?.emailFrom || env || DEFAULT_SENDER;
}

/** Which chat tool a webhook URL belongs to. */
export function webhookKind(url: string): "slack" | "teams" | null {
  try {
    const host = new URL(url).hostname;
    if (host === "hooks.slack.com" || host.endsWith(".slack.com")) return "slack";
    if (/(^|\.)(webhook\.office\.com|outlook\.office\.com|logic\.azure\.com|environment\.api\.powerplatform\.com)$/.test(host)) return "teams";
    return null;
  } catch {
    return null;
  }
}

/** "mnd_live_••••••••4f2a": keeps a recognisable prefix and the last four characters. */
export function maskSecret(v: string | undefined | null) {
  if (!v) return "";
  const s = v.trim();
  if (s.length <= 8) return "••••••••";
  const prefix = s.match(/^([a-z]+[-_](?:[a-z0-9]+[-_])?)/i)?.[1] ?? s.slice(0, 3);
  return `${prefix.slice(0, 14)}••••••••${s.slice(-4)}`;
}

/** "hooks.slack.com/…/x8Kd": host plus the last four characters, never the secret path. */
export function maskWebhook(url: string | null | undefined) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/\/+$/, "").slice(-4);
    return `${u.hostname}/…/${tail}`;
  } catch {
    return maskSecret(url);
  }
}

/**
 * Compliance rules are stored as one rule per line. Older free-text values
 * ("- rule", "1. rule", or rules separated by ". ") still read as a list.
 */
export function parseRules(text: string | null | undefined): string[] {
  if (!text) return [];
  const lines = /\n/.test(text.trim()) ? text.split(/\r?\n/) : text.split(/(?<=[.!?؟])\s+(?=[A-Z؀-ۿ])/);
  return lines
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export const serializeRules = (rules: string[]) => rules.map((r) => r.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean).join("\n");

/** Start of the current calendar month in a timezone, as a UTC instant. */
export function monthStart(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Offset of the zone right now, so local midnight on day 1 maps back to UTC.
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const offset = localAsUtc - Math.floor(now.getTime() / 60_000) * 60_000;
  return new Date(Date.UTC(get("year"), get("month") - 1, 1) - offset);
}

/** Share of a limit used, 0..100 (rounded), and the colour band the meters use. */
export function usageBand(used: number, limit: number) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return { pct, band: pct > 90 ? ("neg" as const) : pct > 70 ? ("warn" as const) : ("ok" as const) };
}
