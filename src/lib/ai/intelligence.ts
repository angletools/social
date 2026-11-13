import { findUniqueMentions } from "../mention-query";
import { parseWithBudget } from "./budget";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { fallbackBrief, getIntelligence, getTopicExamples, type BriefContent, type BriefTheme } from "../intelligence";
import { AI_MODEL, fallbackParams, getAI } from "./client";

const BriefSchema = z.object({
  summary_ar: z.string().describe("2-3 sentences in Modern Standard Arabic: what customers are saying and how it moved"),
  summary_en: z.string().describe("The same summary in English"),
  themes: z
    .array(
      z.object({
        title_ar: z.string().describe("2-5 word theme name, Arabic"),
        title_en: z.string().describe("2-5 word theme name, English"),
        sentiment: z.enum(["POSITIVE", "NEGATIVE", "MIXED"]),
        sharePct: z.number().describe("Approximate % of the period's conversation this theme covers"),
        summary_ar: z.string().describe("One or two sentences, grounded in the posts"),
        summary_en: z.string(),
        recommendation_ar: z.string().describe("One concrete action for the social / CX team"),
        recommendation_en: z.string(),
        topic: z.string().describe("The topic key this theme maps to best, from the statistics, or empty"),
        examples: z.array(z.number()).describe("Post numbers (1-based) that illustrate the theme, up to 3"),
      }),
    )
    .describe("3-6 themes, most important first. Lead with risks and frustrations, then what customers love."),
});

const SYSTEM = `You are the customer-intelligence analyst for a Saudi company's in-house social and CX team.
From the statistics and sample posts, explain what customers are actually saying: the main themes, why sentiment moved, and what to do next.
Be specific (product features, issues, competitors named in posts). Ground every claim in the data; quote numbers. Understand Gulf, Saudi and Egyptian dialect and sarcasm (posts marked sarcastic are complaints).
Plain sentences, no markdown, no filler.`;

/** Builds and stores the latest brief for an org/range. Falls back to a numbers-only brief without AI. */
export async function generateIntelligenceBrief(organizationId: string, days: number) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { brandContext: true, timezone: true } });
  const scope = { orgId: organizationId, days, tz: org.timezone };
  const intel = await getIntelligence(scope);
  const keys = [...new Set([...intel.negative, ...intel.positive, ...intel.emerging].map((d) => d.key))];
  const examples = await getTopicExamples(scope, keys);
  const base = {
    days,
    comparable: intel.comparable,
    total: intel.kpis.mentions,
    netSentiment: intel.kpis.netSentiment,
    netChange: intel.kpis.deltas.netSentiment,
    churn: intel.churn.count,
    churnPrev: intel.churn.prev,
    negative: intel.negative,
    positive: intel.positive,
    emerging: intel.emerging,
    examples,
  };

  let content: BriefContent = fallbackBrief(base);
  let source = "fallback";
  const ai = getAI();
  if (ai && intel.kpis.mentions > 0) {
    try {
      const ai_content = await writeWithAI(ai, scope, intel, org.brandContext);
      if (ai_content) {
        content = ai_content;
        source = "ai";
      }
    } catch (e) {
      console.error("[intelligence] AI brief failed, using fallback", e);
    }
  }

  return db.intelligenceBrief.create({
    data: { organizationId, days, summaryAr: content.summaryAr, summaryEn: content.summaryEn, themes: content.themes as object[], source },
  });
}

async function writeWithAI(
  ai: NonNullable<ReturnType<typeof getAI>>,
  scope: { orgId: string; days: number },
  intel: Awaited<ReturnType<typeof getIntelligence>>,
  brandContext: string | null,
): Promise<BriefContent | null> {
  const since = new Date(Date.now() - scope.days * 86400_000);
  const where = { organizationId: scope.orgId, relevant: true, publishedAt: { gte: since } };
  const select = { id: true, text: true, platform: true, sentiment: true, intent: true, dialect: true, sarcasm: true, topics: true, likes: true, authorFollowers: true } as const;
  const [neg, top, churn] = await Promise.all([
    findUniqueMentions({ where: { ...where, sentiment: "NEGATIVE" }, orderBy: { likes: "desc" }, take: 35, select }),
    findUniqueMentions({ where, orderBy: { likes: "desc" }, take: 30, select }),
    findUniqueMentions({ where: { ...where, intent: "CHURN_RISK" }, orderBy: { publishedAt: "desc" }, take: 15, select }),
  ]);
  const seen = new Set<string>();
  const sample = [...churn, ...neg, ...top].filter((p) => !seen.has(p.id) && seen.add(p.id));
  const posts = sample
    .map(
      (p, i) =>
        `<post n="${i + 1}" platform="${p.platform}" sentiment="${p.sentiment}" intent="${p.intent}" dialect="${p.dialect}"${p.sarcasm ? ' sarcastic="true"' : ""} topics="${p.topics.join(",")}" likes="${p.likes}">${p.text.slice(0, 400)}</post>`,
    )
    .join("\n");
  const stats = {
    days: scope.days,
    kpis: intel.kpis,
    negativeDrivers: intel.negative,
    positiveDrivers: intel.positive,
    emerging: intel.emerging,
    intents: intel.intents,
    dialects: intel.dialects,
    comparableToPreviousPeriod: intel.comparable,
    churn: intel.churn,
    complaints: intel.complaints.map((c) => ({ key: c.key, labelEn: c.labelEn, labelAr: c.labelAr, count: c.count, churn: c.churn })),
  };

  const { betas, ...fb } = fallbackParams(AI_MODEL);
  const res = await parseWithBudget(scope.orgId, "intelligence", {
    model: AI_MODEL,
    max_tokens: 8000,
    betas,
    ...fb,
    system: `${SYSTEM}${brandContext ? `\n\nAbout the company: ${brandContext}` : ""}`,
    output_config: { effort: "medium", format: betaZodOutputFormat(BriefSchema) },
    messages: [{ role: "user", content: `<statistics>\n${JSON.stringify(stats)}\n</statistics>\n\n<posts>\n${posts}\n</posts>` }],
  });
  const out = res.parsed_output;
  if (!out) return null;
  const themes: BriefTheme[] = out.themes.slice(0, 6).map((t) => ({
    title_ar: t.title_ar,
    title_en: t.title_en,
    sentiment: t.sentiment,
    sharePct: Math.max(0, Math.min(100, Math.round(t.sharePct * 10) / 10)),
    summary_ar: t.summary_ar,
    summary_en: t.summary_en,
    recommendation_ar: t.recommendation_ar,
    recommendation_en: t.recommendation_en,
    topicKey: t.topic || undefined,
    exampleMentionIds: t.examples.map((n) => sample[n - 1]?.id).filter((x): x is string => Boolean(x)).slice(0, 3),
  }));
  return { summaryAr: out.summary_ar, summaryEn: out.summary_en, themes };
}
