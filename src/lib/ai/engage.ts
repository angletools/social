import { parseWithBudget } from "./budget";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { AI_MODEL, fallbackParams, getAI } from "./client";
import { DIALECT_GUIDE, REPLY_GUIDE, lexiconPrompt } from "./dialect";

const DIALECTS = ["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"] as const;

export type Translation = { text: string; notes: { term: string; explanation: string }[]; dialect: string; tone: string };

const TranslationSchema = z.object({
  translation: z.string().describe("Natural English translation that keeps tone, sarcasm and intensity"),
  dialect: z.enum(DIALECTS),
  tone: z.string().describe("Short English description of tone, e.g. 'sarcastic, frustrated'"),
  notes: z.array(z.object({ term: z.string(), explanation: z.string() })).describe("Slang, idioms or cultural references explained for a non-native reader"),
});

/** Translates a mention into English with slang/cultural notes; cached on the mention. */
export async function translateMention(mentionId: string, organizationId: string): Promise<Translation> {
  const m = await db.mention.findFirstOrThrow({ where: { id: mentionId, organizationId } });
  if (m.translation) return JSON.parse(m.translation) as Translation;
  const ai = getAI();
  if (!ai) throw new Error("AI_DISABLED");

  const { betas, ...fb } = fallbackParams(AI_MODEL);
  const res = await parseWithBudget(organizationId, "engage", {
    model: AI_MODEL,
    max_tokens: 4000,
    betas,
    ...fb,
    system: [
      {
        type: "text",
        text: `You translate Gulf, Saudi, Egyptian and other Arabic social media posts for colleagues who don't read Arabic, and explain what a native reader would pick up: dialect, slang, sarcasm, religious or cultural expressions.\n\n${DIALECT_GUIDE}`,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: await lexiconPrompt(organizationId) || "No organization glossary." },
    ],
    output_config: { effort: "low", format: betaZodOutputFormat(TranslationSchema) },
    messages: [{ role: "user", content: `<post platform="${m.platform}">\n${m.text}\n</post>` }],
  });
  if (!res.parsed_output) throw new Error(`translation failed: ${res.stop_reason}`);
  const out: Translation = {
    text: res.parsed_output.translation,
    notes: res.parsed_output.notes.slice(0, 6),
    dialect: res.parsed_output.dialect,
    tone: res.parsed_output.tone,
  };
  await db.mention.update({ where: { id: m.id }, data: { translation: JSON.stringify(out) } });
  return out;
}

const ReplySchema = z.object({
  options: z
    .array(
      z.object({
        approach: z.string().describe("3-6 word English label, e.g. 'Apologize and move to DM'"),
        text: z.string(),
        dialect: z.enum(DIALECTS),
      }),
    )
    .describe("Exactly 3 distinct reply options"),
  escalate: z.boolean().describe("True if a human specialist (support, compliance, security, legal) must handle this"),
  escalation_reason: z.string().nullable(),
});

export type ReplyOptions = z.infer<typeof ReplySchema>;

/** Drafts 3 reply options in the commenter's dialect and the brand voice. Saves them as DRAFT replies. */
export async function draftReplies(mentionId: string, organizationId: string, userId: string, instruction?: string) {
  const ai = getAI();
  if (!ai) throw new Error("AI_DISABLED");
  const m = await db.mention.findFirstOrThrow({ where: { id: mentionId, organizationId }, include: { monitor: true, organization: true } });
  const voice = await db.brandVoice.findFirst({ where: { organizationId, isDefault: true } });

  const context = [
    m.organization.brandContext && `About the company: ${m.organization.brandContext}`,
    m.organization.complianceRules && `<compliance_rules>\n${m.organization.complianceRules}\n</compliance_rules>`,
    voice &&
      `<brand_voice name="${voice.name}">\n${voice.summary}\nTraits: ${voice.traits.join(", ")}\nDo: ${voice.dos.join("; ")}\nDon't: ${voice.donts.join("; ")}\nNever use: ${voice.bannedWords.join(", ") || "-"}\nEmoji: ${voice.emojiPolicy ?? "sparingly"}\nExamples:\n${voice.examples.slice(0, 5).map((e) => `- ${e}`).join("\n")}\n</brand_voice>`,
    await lexiconPrompt(organizationId),
    m.monitor.isCompetitor &&
      "Note: this post is about a COMPETITOR. Only reply if it is a natural opportunity (e.g. a question we can help with); never attack the competitor.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { betas, ...fb } = fallbackParams(AI_MODEL);
  const res = await parseWithBudget(organizationId, "engage", {
    model: AI_MODEL,
    max_tokens: 8000,
    betas,
    ...fb,
    system: [
      {
        type: "text",
        text: `You are a senior community manager for a regional brand in Saudi Arabia and the Gulf. You write public replies to social media posts that sound like a real local person on the brand's team, not a translation or a bot.\n\n${DIALECT_GUIDE}\n\n${REPLY_GUIDE}`,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: context || "No extra context." },
    ],
    output_config: { effort: "medium", format: betaZodOutputFormat(ReplySchema) },
    messages: [
      {
        role: "user",
        content: `Write 3 reply options for this post.${instruction ? `\nExtra instruction from the team: ${instruction}` : ""}

<post platform="${m.platform}" author="@${m.authorHandle ?? "unknown"}" followers="${m.authorFollowers ?? 0}" detected_dialect="${m.dialect ?? "unknown"}" intent="${m.intent ?? "unknown"}" sentiment="${m.sentiment ?? "unknown"}"${m.sarcasm ? ' sarcasm="true"' : ""}>
${m.text}
</post>`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error(`reply drafting failed: ${res.stop_reason}`);

  await db.replyDraft.deleteMany({ where: { mentionId: m.id, status: "DRAFT" } });
  await db.replyDraft.createMany({
    data: res.parsed_output.options.slice(0, 3).map((o) => ({
      organizationId,
      mentionId: m.id,
      text: o.text,
      approach: o.approach.slice(0, 80),
      dialect: o.dialect,
      createdById: userId,
    })),
  });
  if (res.parsed_output.escalate) {
    await db.mention.update({
      where: { id: m.id },
      data: { status: "FLAGGED", note: `Escalate: ${res.parsed_output.escalation_reason ?? "needs a specialist"}`.slice(0, 500) },
    });
  }
  return res.parsed_output;
}
