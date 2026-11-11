/**
 * Pure functions behind the Intelligence hub: ranking what drives sentiment,
 * spotting emerging themes and writing a no-AI fallback brief. No database
 * access here so it can be unit-tested.
 */

export type TopicPeriodRow = {
  key: string;
  labelEn: string;
  labelAr: string;
  n: number;
  pos: number;
  neg: number;
  prevN: number;
  prevPos: number;
  prevNeg: number;
};

export type Driver = {
  key: string;
  labelEn: string;
  labelAr: string;
  count: number;
  /** Mentions of this sentiment for the topic. */
  hits: number;
  /** Share of all mentions of that sentiment in the period, 0–100. */
  share: number;
  /** Change in hits vs the previous equal period, in % (null when there was nothing before). */
  change: number | null;
  /** Net sentiment of the topic, −100..100. */
  net: number;
};

export type Emerging = { key: string; labelEn: string; labelAr: string; count: number; prevCount: number; change: number | null; net: number };

/**
 * % change; null when the previous period is too small to compare against
 * (a "new" item rather than +∞ or a meaningless +4000%).
 */
export function pctChange(cur: number, prev: number, minBase = 3): number | null {
  if (prev < minBase) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export const net = (pos: number, neg: number, n: number) => (n ? Math.round(((pos - neg) / n) * 100) : 0);

/** Topics ranked by how much of the period's negative (or positive) conversation they account for. */
export function rankDrivers(rows: TopicPeriodRow[], kind: "negative" | "positive", limit = 5): Driver[] {
  const field = kind === "negative" ? "neg" : "pos";
  const prevField = kind === "negative" ? "prevNeg" : "prevPos";
  const total = rows.reduce((a, r) => a + r[field], 0);
  if (!total) return [];
  return rows
    .filter((r) => r[field] > 0)
    .map((r) => ({
      key: r.key,
      labelEn: r.labelEn,
      labelAr: r.labelAr,
      count: r.n,
      hits: r[field],
      share: Math.round((r[field] / total) * 1000) / 10,
      change: pctChange(r[field], r[prevField]),
      net: net(r.pos, r.neg, r.n),
    }))
    // Primary: share of that sentiment. Tie-break: the bigger topic.
    .sort((a, b) => b.hits - a.hits || b.count - a.count)
    .slice(0, limit);
}

/**
 * Themes growing fastest vs the previous period. Needs a minimum volume so a
 * topic going from 1 to 3 posts doesn't top the list; brand-new topics are
 * ranked by volume.
 */
export function emergingThemes(rows: TopicPeriodRow[], limit = 5, minCount = 5): Emerging[] {
  return rows
    .filter((r) => r.n >= minCount && r.n > r.prevN)
    .map((r) => ({
      key: r.key,
      labelEn: r.labelEn,
      labelAr: r.labelAr,
      count: r.n,
      prevCount: r.prevN,
      change: pctChange(r.n, r.prevN),
      net: net(r.pos, r.neg, r.n),
    }))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

// Growth weighted by volume: +200% on 60 posts beats +400% on 6.
const score = (e: Emerging) => (e.count - e.prevCount) * Math.log10(e.count + 1);

export type BriefTheme = {
  title_ar: string;
  title_en: string;
  sentiment: "POSITIVE" | "NEGATIVE" | "MIXED";
  sharePct: number;
  summary_ar: string;
  summary_en: string;
  recommendation_ar: string;
  recommendation_en: string;
  topicKey?: string;
  exampleMentionIds: string[];
};

export type BriefContent = { summaryAr: string; summaryEn: string; themes: BriefTheme[] };

export type BriefInput = {
  days: number;
  /** False when the previous period has too little data to compare against. */
  comparable?: boolean;
  total: number;
  netSentiment: number;
  netChange: number;
  churn: number;
  churnPrev: number;
  negative: Driver[];
  positive: Driver[];
  emerging: Emerging[];
  examples?: Record<string, string[]>;
};

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
const chg = (c: number | null, ar: boolean) =>
  c === null ? (ar ? "جديد هذه الفترة" : "new this period") : ar ? `${c >= 0 ? "ارتفع" : "انخفض"} ${Math.abs(c)}٪` : `${c >= 0 ? "up" : "down"} ${Math.abs(c)}%`;

/** Deterministic brief from the numbers, used when AI is not configured or fails. */
export function fallbackBrief(i: BriefInput): BriefContent {
  const ex = (k: string) => (i.examples?.[k] ?? []).slice(0, 3);
  const themes: BriefTheme[] = [];
  for (const d of i.negative.slice(0, 3)) {
    themes.push({
      title_ar: d.labelAr,
      title_en: d.labelEn,
      sentiment: "NEGATIVE",
      sharePct: d.share,
      summary_ar: `${d.share}٪ من المحادثة السلبية (${d.hits} منشور)، ${chg(d.change, true)}.`,
      summary_en: `${d.share}% of negative conversation (${d.hits} posts), ${chg(d.change, false)}.`,
      recommendation_ar: "",
      recommendation_en: "",
      topicKey: d.key,
      exampleMentionIds: ex(d.key),
    });
  }
  for (const d of i.positive.slice(0, 2)) {
    if (themes.some((t) => t.topicKey === d.key)) continue;
    themes.push({
      title_ar: d.labelAr,
      title_en: d.labelEn,
      sentiment: "POSITIVE",
      sharePct: d.share,
      summary_ar: `${d.share}٪ من المحادثة الإيجابية (${d.hits} منشور).`,
      summary_en: `${d.share}% of positive conversation (${d.hits} posts).`,
      recommendation_ar: "",
      recommendation_en: "",
      topicKey: d.key,
      exampleMentionIds: ex(d.key),
    });
  }
  const top = i.negative[0];
  const rising = i.emerging.find((e) => !themes.some((t) => t.topicKey === e.key));
  if (rising && themes.length < 6) {
    themes.push({
      title_ar: rising.labelAr,
      title_en: rising.labelEn,
      sentiment: rising.net < -10 ? "NEGATIVE" : rising.net > 10 ? "POSITIVE" : "MIXED",
      sharePct: i.total ? Math.round((rising.count / i.total) * 1000) / 10 : 0,
      summary_ar: `موضوع صاعد: ${rising.count} منشور، ${chg(rising.change, true)}.`,
      summary_en: `Rising: ${rising.count} posts, ${chg(rising.change, false)}.`,
      recommendation_ar: "",
      recommendation_en: "",
      topicKey: rising.key,
      exampleMentionIds: ex(rising.key),
    });
  }

  const cmp = i.comparable !== false;
  const churnLineAr = i.churn ? ` ${i.churn} منشور يلمّح لترك الخدمة${cmp && i.churnPrev ? ` (كان ${i.churnPrev})` : ""}.` : "";
  const churnLineEn = i.churn ? ` ${i.churn} posts signal churn${cmp && i.churnPrev ? ` (was ${i.churnPrev})` : ""}.` : "";
  const summaryAr = i.total
    ? `صافي المشاعر ${sign(i.netSentiment)}${cmp ? ` (${sign(i.netChange)} عن الفترة السابقة)` : ""} عبر ${i.total} منشور في آخر ${i.days} يوم.${top ? ` أكبر مصدر للاستياء: ${top.labelAr} (${top.share}٪).` : ""}${churnLineAr}`
    : "لا توجد بيانات كافية لهذه الفترة بعد.";
  const summaryEn = i.total
    ? `Net sentiment ${sign(i.netSentiment)}${cmp ? ` (${sign(i.netChange)} vs previous period)` : ""} across ${i.total} posts in the last ${i.days} days.${top ? ` Biggest source of frustration: ${top.labelEn} (${top.share}%).` : ""}${churnLineEn}`
    : "Not enough data for this period yet.";
  return { summaryAr, summaryEn, themes: themes.slice(0, 6) };
}
