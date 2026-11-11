/**
 * Alert rules written as sentences. Shared by the alerts page (server) and the
 * "New alert" sentence builder (client), so a rule reads the same way in both.
 */
import type { AlertKind } from "@prisma/client";
import type { Dict } from "./i18n/en";
import { formatNumber, ltr } from "./utils";

/** Order of the trigger tiles in the builder. */
export const ALERT_KINDS: AlertKind[] = ["NEGATIVE_SPIKE", "VOLUME_SPIKE", "KEYWORD", "HIGH_REACH", "CHURN_RISK", "RISK"];

export const WINDOW_OPTIONS = ["60", "180", "1440", "10080"] as const;

/** Builder defaults. CHURN_RISK shows "at least N people", stored as threshold = N - 1. */
export const ALERT_DEFAULTS: Record<AlertKind, { value: string; window: string }> = {
  NEGATIVE_SPIKE: { value: "35", window: "1440" },
  VOLUME_SPIKE: { value: "120", window: "60" },
  KEYWORD: { value: "", window: "1440" },
  HIGH_REACH: { value: "50000", window: "1440" },
  CHURN_RISK: { value: "1", window: "1440" },
  RISK: { value: "", window: "1440" },
};

export type SentenceToken = "pct" | "count" | "window" | "words" | "followers";
export type SentencePart = { type: "text"; text: string } | { type: "token"; token: SentenceToken };

/** Splits "When mentions go above {count} within {window}" into text and field parts. */
export function sentenceParts(template: string): SentencePart[] {
  const parts: SentencePart[] = [];
  for (const chunk of template.split(/(\{\w+\})/)) {
    if (!chunk) continue;
    const m = chunk.match(/^\{(\w+)\}$/);
    if (m) parts.push({ type: "token", token: m[1] as SentenceToken });
    else if (chunk.trim()) parts.push({ type: "text", text: chunk.trim() });
  }
  return parts;
}

/** The template a kind uses for a given value (churn with "at least 1" reads as "someone"). */
export function templateFor(kind: AlertKind, t: Dict["alertsPage"], churnAtLeast?: number) {
  if (kind === "CHURN_RISK" && (churnAtLeast ?? 1) <= 1) return t.sentence.CHURN_ONE;
  return t.sentence[kind];
}

/** Splits a keyword list on Latin or Arabic commas. */
export const splitWords = (raw: string | null | undefined) =>
  (raw ?? "")
    .split(/[,،]/)
    .map((w) => w.trim())
    .filter(Boolean);

export function quoteWord(w: string, locale: string) {
  return locale === "ar" ? `«${w}»` : `“${w}”`;
}

export function windowLabel(minutes: number, t: Dict["alertsPage"], locale: string) {
  const known = (t.windows as Record<string, string>)[String(minutes)];
  if (known) return known;
  const h = Math.round(minutes / 60);
  return locale === "ar" ? `${h} ساعة` : `${h} hours`;
}

/** A saved rule as one plain sentence. */
export function ruleSentence(
  r: { kind: AlertKind; threshold: number; windowMinutes: number; keyword: string | null },
  t: Dict["alertsPage"],
  locale: string,
) {
  const churnAtLeast = Math.round(r.threshold) + 1;
  const template = templateFor(r.kind, t, churnAtLeast);
  const words = splitWords(r.keyword).map((w) => quoteWord(w, locale));
  const list = new Intl.ListFormat(locale === "ar" ? "ar" : "en", { type: "disjunction" }).format(words);
  const values: Record<SentenceToken, string> = {
    pct: ltr(`${Math.round(r.threshold)}%`),
    count: ltr(formatNumber(r.kind === "CHURN_RISK" ? churnAtLeast : Math.round(r.threshold), locale)),
    window: windowLabel(r.windowMinutes, t, locale),
    words: list,
    followers: ltr(formatNumber(Math.round(r.threshold), locale)),
  };
  return template.replace(/\{(\w+)\}/g, (_, k: SentenceToken) => values[k] ?? "");
}

/** Converts the builder's value field into the stored threshold. */
export function thresholdFromInput(kind: AlertKind, raw: string) {
  const n = Number(raw.replace(/[,\s٬]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return kind === "CHURN_RISK" ? Math.max(0, Math.round(n) - 1) : n;
}
