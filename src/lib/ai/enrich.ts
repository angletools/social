import { createHash, randomUUID } from "node:crypto";
import type { Mention, Prisma } from "@prisma/client";
import { parseWithBudget } from "./budget";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { guessLang } from "../utils";
import { AI_ENRICH_MODEL, fallbackParams, getAI } from "./client";
import { heuristicDialect, heuristicSentiment } from "./heuristics";
import { DIALECT_GUIDE, lexiconPrompt } from "./dialect";

const BATCH = 25;
export const CLASSIFIER_VERSION = "2026-11-12.1";

const Result = z.object({
  results: z.array(
    z.object({
      confidence: z.number().min(0).max(1).nullable().describe("Self-reported confidence in the sentiment label; null if uncertain. This is not a calibrated probability."),
      n: z.number().int().min(1).max(BATCH).describe("The item number from the input"),
      sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
      score: z.number().describe("-1 (very negative) to 1 (very positive)"),
      emotion: z.string().describe("One lowercase english word, e.g. joy, anger, frustration, curiosity, fear"),
      topics: z
        .array(z.object({ key: z.string(), en: z.string(), ar: z.string() }))
        .describe("1-3 topics. Reuse existing keys whenever they fit."),
      relevant: z.boolean(),
      is_risk: z.boolean(),
      risk_reason: z.string().nullable(),
      dialect: z.enum(["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"]),
      intent: z.enum(["COMPLAINT", "QUESTION", "PRAISE", "PURCHASE_INTENT", "CHURN_RISK", "SUGGESTION", "OTHER"]),
      sarcasm: z.boolean(),
      slang: z.array(z.object({ term: z.string(), gloss: z.string() })).describe("0-3 dialect terms with short English glosses"),
    }),
  ),
});

const SYSTEM = `You classify social media posts for a brand-monitoring product used by companies in Saudi Arabia and the Gulf. Posts are in Arabic (usually Gulf or Egyptian dialect, sometimes Arabizi), English, or a mix. You read them the way a native Saudi community manager would.

For each numbered post return:
- sentiment toward the brand or subject being monitored (not the general mood of the post). Sarcasm counts as negative. Questions with no opinion are NEUTRAL.
- score from -1 to 1.
- emotion: one english word.
- topics: 1-3 business topics the post is about. Each topic has a stable lowercase kebab-case english key (e.g. "app-performance", "fees-pricing", "customer-support"), a short English label and a short Arabic label. Reuse a key from the existing topic list whenever one fits so reporting stays consistent; only invent a new key for a genuinely new subject.
- relevant: false only if the post is clearly unrelated to the monitored subject (e.g. a different company with the same name, spam, or off-topic for a topic monitor).
- dialect, intent, sarcasm and slang: follow the dialect guide below.
- is_risk: true for anything a communications or compliance team should see quickly: fraud, scams or impersonation, security incidents, regulatory or legal claims, misleading financial claims, viral complaints, threats of churn from influential users. risk_reason is one short english sentence, or null.`;

export type ClassifyResult = z.infer<typeof Result>;
export type SystemBlocks = { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];

/** Static, cacheable classifier instructions. */
export const CLASSIFIER_SYSTEM = `${SYSTEM}\n\n${DIALECT_GUIDE}`;

/** One classification call for a batch of numbered <post> elements. Returns null on refusal. */
export async function classifyBatch(system: SystemBlocks, postsXml: string, count: number, organizationId: string): Promise<(ClassifyResult & { model: string }) | null> {
  const ai = getAI();
  if (!ai) throw new Error("AI_DISABLED");
  const model = AI_ENRICH_MODEL;
  const { betas, ...fb } = fallbackParams(model);
  const res = await parseWithBudget(organizationId, "classification", {
    model,
    max_tokens: 16000,
    betas,
    ...fb,
    system,
    output_config: { effort: "low", format: betaZodOutputFormat(Result) },
    messages: [{ role: "user", content: `Classify these ${count} posts.\n\n${postsXml}` }],
  });
  return res.stop_reason === "refusal" || !res.parsed_output ? null : { ...res.parsed_output, model: res.model };
}

/** Compare-and-set protects a correction or a new reprocessing request made during a model call. */
export async function writeClassification(m: Pick<Mention, "id" | "organizationId" | "classificationRevision">, data: Prisma.MentionUpdateManyMutationInput) {
  return db.mention.updateMany({
    where: { id: m.id, organizationId: m.organizationId, classificationRevision: m.classificationRevision, classificationSource: { not: "HUMAN" } },
    data: { ...data, classificationRevision: { increment: 1 }, enrichedAt: new Date() },
  });
}

async function heuristic(m: Mention) {
  const h = heuristicSentiment(m.text);
  return writeClassification(m, { sentiment: h.sentiment, sentimentScore: h.score, isRisk: h.isRisk, riskReason: null,
    emotion: null, topics: [], intent: "OTHER", sarcasm: false, relevant: true, slang: [],
    dialect: heuristicDialect(m.text), lang: m.lang ?? guessLang(m.text), classificationSource: "HEURISTIC",
    classificationModel: null, classificationVersion: CLASSIFIER_VERSION, classificationContextHash: null, classificationConfidence: null });
}

/** Bounded organization lease avoids paying for the same batch on concurrent workers. */
export async function enrichPending(organizationId: string, limit = 200): Promise<number> {
  const lease = randomUUID();
  const claim = await db.organization.updateMany({ where: { id: organizationId, OR: [{ enrichmentLeaseUntil: null }, { enrichmentLeaseUntil: { lte: new Date() } }] }, data: { enrichmentLeaseToken: lease, enrichmentLeaseUntil: new Date(Date.now() + 150_000) } });
  if (!claim.count) return 0;
  try {
    const pending = await db.mention.findMany({ where: { organizationId, enrichedAt: null, classificationSource: { not: "HUMAN" } }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: Math.min(200, Math.max(1, limit)), include: { monitor: { select: { name: true, type: true, terms: true, description: true } } } });
    if (!pending.length) return 0;
    if (!getAI()) { for (const m of pending) await heuristic(m); return pending.length; }
    const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const topics = await db.topic.findMany({ where: { organizationId }, select: { key: true, labelEn: true }, orderBy: { key: "asc" }, take: 500 });
    const glossary = await lexiconPrompt(organizationId);
    const context = [org.brandContext ?? "", glossary, `Existing topic keys: ${topics.map(t => `${t.key} (${t.labelEn})`).join(", ") || "none yet"}`].filter(Boolean).join("\n\n");
    const contextHash = createHash("sha256").update(`${CLASSIFIER_VERSION}\n${CLASSIFIER_SYSTEM}\n${context}`).digest("hex");
    const system: SystemBlocks = [{ type: "text", text: CLASSIFIER_SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: context }];
    if (!await db.auditLog.findFirst({ where: { organizationId, action: "classification.context", target: contextHash }, select: { id: true } })) {
      await db.auditLog.create({ data: { organizationId, action: "classification.context", target: contextHash, meta: { version: CLASSIFIER_VERSION, context, system: CLASSIFIER_SYSTEM } } });
    }
    let done = 0;
    for (let i = 0; i < pending.length; i += BATCH) {
      const renewed = await db.organization.updateMany({ where: { id: organizationId, enrichmentLeaseToken: lease }, data: { enrichmentLeaseUntil: new Date(Date.now() + 150_000) } });
      if (!renewed.count) break;
      const batch = pending.slice(i, i + BATCH);
      // JSON-encoded evidence cannot forge a new post element or close a delimiter.
      const posts = JSON.stringify(batch.map((m, n) => ({ n: n + 1, platform: m.platform, monitored: { type: m.monitor.type, terms: m.monitor.terms, description: m.monitor.description }, text: m.text.slice(0, 1500) })));
      const parsed = await classifyBatch(system, posts, batch.length, organizationId);
      const owner = await db.organization.findFirst({ where: { id: organizationId, enrichmentLeaseToken: lease, enrichmentLeaseUntil: { gt: new Date() } }, select: { id: true } });
      if (!owner) break;
      const answered = new Set<number>();
      for (const r of parsed?.results ?? []) {
        const m = batch[r.n - 1];
        if (!m || answered.has(r.n)) continue;
        answered.add(r.n);
        const cleanTopics = [...new Map(r.topics.slice(0, 3).map(t => { const key = t.key.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48); return [key, { key, en: t.en.slice(0, 60), ar: t.ar.slice(0, 60) }]; })).values()].filter(t => t.key);
        for (const t of cleanTopics) await db.topic.upsert({ where: { organizationId_key: { organizationId, key: t.key } }, create: { organizationId, key: t.key, labelEn: t.en, labelAr: t.ar }, update: {} });
        const changed = await writeClassification(m, {
          sentiment: r.sentiment, sentimentScore: Math.max(-1, Math.min(1, r.score)), emotion: r.emotion.slice(0, 30), topics: cleanTopics.map(t => t.key),
          relevant: r.relevant, isRisk: r.is_risk, riskReason: r.risk_reason?.slice(0, 300) ?? null, dialect: r.dialect, intent: r.intent, sarcasm: r.sarcasm,
          slang: r.slang.slice(0, 3).map(x => ({ term: x.term.slice(0, 40), gloss: x.gloss.slice(0, 120) })), lang: m.lang ?? guessLang(m.text),
          classificationSource: "MODEL", classificationModel: parsed!.model, classificationVersion: CLASSIFIER_VERSION, classificationContextHash: contextHash, classificationConfidence: r.confidence,
        });
        done += changed.count;
      }
      for (const [n, m] of batch.entries()) if (!answered.has(n + 1)) done += (await heuristic(m)).count;
    }
    return done;
  } finally {
    await db.organization.updateMany({ where: { id: organizationId, enrichmentLeaseToken: lease }, data: { enrichmentLeaseToken: null, enrichmentLeaseUntil: null } });
  }
}
