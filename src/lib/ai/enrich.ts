import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { guessLang } from "../utils";
import { AI_ENRICH_MODEL, fallbackParams, getAI } from "./client";
import { heuristicSentiment } from "./heuristics";

const BATCH = 25;

const Result = z.object({
  results: z.array(
    z.object({
      n: z.number().describe("The item number from the input"),
      sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
      score: z.number().describe("-1 (very negative) to 1 (very positive)"),
      emotion: z.string().describe("One lowercase english word, e.g. joy, anger, frustration, curiosity, fear"),
      topics: z
        .array(z.object({ key: z.string(), en: z.string(), ar: z.string() }))
        .describe("1-3 topics. Reuse existing keys whenever they fit."),
      relevant: z.boolean(),
      is_risk: z.boolean(),
      risk_reason: z.string().nullable(),
    }),
  ),
});

const SYSTEM = `You classify social media posts for a brand-monitoring product used by a Saudi company. Posts are in Arabic (often Saudi/Gulf dialect), English, or a mix.

For each numbered post return:
- sentiment toward the brand or subject being monitored (not the general mood of the post). Sarcasm counts as negative. Questions with no opinion are NEUTRAL.
- score from -1 to 1.
- emotion: one english word.
- topics: 1-3 business topics the post is about. Each topic has a stable lowercase kebab-case english key (e.g. "app-performance", "fees-pricing", "customer-support"), a short English label and a short Arabic label. Reuse a key from the existing topic list whenever one fits so reporting stays consistent; only invent a new key for a genuinely new subject.
- relevant: false only if the post is clearly unrelated to the monitored subject (e.g. a different company with the same name, spam, or off-topic for a topic monitor).
- is_risk: true for anything a communications or compliance team should see quickly: fraud, scams or impersonation, security incidents, regulatory or legal claims, misleading financial claims, viral complaints, threats of churn from influential users. risk_reason is one short english sentence, or null.`;

/** Enriches up to `limit` un-enriched mentions for an organization. Returns how many were processed. */
export async function enrichPending(organizationId: string, limit = 200): Promise<number> {
  const pending = await db.mention.findMany({
    where: { organizationId, enrichedAt: null },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { monitor: { select: { name: true, type: true, terms: true, description: true } } },
  });
  if (pending.length === 0) return 0;

  const ai = getAI();
  if (!ai) {
    for (const m of pending) {
      const h = heuristicSentiment(m.text);
      await db.mention.update({
        where: { id: m.id },
        data: {
          sentiment: h.sentiment,
          sentimentScore: h.score,
          isRisk: h.isRisk,
          lang: m.lang ?? guessLang(m.text),
          enrichedAt: new Date(),
        },
      });
    }
    return pending.length;
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const topics = await db.topic.findMany({ where: { organizationId }, select: { key: true, labelEn: true } });
  const system = [
    SYSTEM,
    org.brandContext ? `\nAbout the client company: ${org.brandContext}` : "",
    `\nExisting topic keys: ${topics.map((t) => `${t.key} (${t.labelEn})`).join(", ") || "none yet"}`,
  ].join("");

  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const userText = batch
      .map((m, idx) => {
        const subject =
          m.monitor.type === "TOPIC" && m.monitor.description
            ? `topic: ${m.monitor.description}`
            : `${m.monitor.type.toLowerCase()}: ${m.monitor.terms.join(", ")}`;
        return `<post n="${idx + 1}" platform="${m.platform}" monitored="${subject.replace(/"/g, "'")}">\n${m.text.slice(0, 1500)}\n</post>`;
      })
      .join("\n");

    const model = AI_ENRICH_MODEL;
    const { betas, ...fb } = fallbackParams(model);
    const res = await ai.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas,
      ...fb,
      system,
      output_config: { effort: "low", format: betaZodOutputFormat(Result) },
      messages: [{ role: "user", content: `Classify these ${batch.length} posts.\n\n${userText}` }],
    });

    if (res.stop_reason === "refusal" || !res.parsed_output) {
      // Leave the batch for heuristics so the pipeline never stalls on one bad batch.
      for (const m of batch) {
        const h = heuristicSentiment(m.text);
        await db.mention.update({
          where: { id: m.id },
          data: { sentiment: h.sentiment, sentimentScore: h.score, isRisk: h.isRisk, enrichedAt: new Date() },
        });
      }
      done += batch.length;
      continue;
    }

    for (const r of res.parsed_output.results) {
      const m = batch[r.n - 1];
      if (!m) continue;
      const cleanTopics = r.topics.slice(0, 3).map((t) => ({
        key: t.key.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48),
        en: t.en.slice(0, 60),
        ar: t.ar.slice(0, 60),
      }));
      for (const t of cleanTopics.filter((t) => t.key)) {
        await db.topic.upsert({
          where: { organizationId_key: { organizationId, key: t.key } },
          create: { organizationId, key: t.key, labelEn: t.en, labelAr: t.ar },
          update: {},
        });
      }
      await db.mention.update({
        where: { id: m.id },
        data: {
          sentiment: r.sentiment,
          sentimentScore: Math.max(-1, Math.min(1, r.score)),
          emotion: r.emotion.slice(0, 30),
          topics: cleanTopics.map((t) => t.key).filter(Boolean),
          relevant: r.relevant,
          isRisk: r.is_risk,
          riskReason: r.risk_reason?.slice(0, 300) ?? null,
          lang: m.lang ?? guessLang(m.text),
          enrichedAt: new Date(),
        },
      });
      done++;
    }
    // Anything the model skipped gets a heuristic label instead of being retried forever.
    const answered = new Set(res.parsed_output.results.map((r) => r.n));
    for (const [idx, m] of batch.entries()) {
      if (answered.has(idx + 1)) continue;
      const h = heuristicSentiment(m.text);
      await db.mention.update({
        where: { id: m.id },
        data: { sentiment: h.sentiment, sentimentScore: h.score, isRisk: h.isRisk, enrichedAt: new Date() },
      });
    }
  }
  return done;
}
