import { parseWithBudget } from "./budget";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { reflowBeats } from "../trends/score";
import { writeDraftContent } from "../drafts";
import { AI_MODEL, fallbackParams, getAI } from "./client";
import { WRITING_GUIDE, lexiconPrompt } from "./dialect";

export const SHOT_TYPES = ["CLOSE_UP", "MEDIUM", "WIDE", "POV", "OVERHEAD", "SCREEN_RECORDING", "B_ROLL", "TEXT_CARD", "GREEN_SCREEN"] as const;

export const DraftSchema = z.object({
  title: z.string(),
  concept: z.string().describe("1-2 sentences: the idea and why it fits the format and the brand"),
  hooks: z
    .array(z.object({ text: z.string().describe("Spoken first line, in the target dialect"), on_screen: z.string(), why: z.string().describe("English, one line") }))
    .describe("3 alternative hooks; the first one is used in the script"),
  beats: z
    .array(
      z.object({
        duration: z.number().describe("seconds"),
        vo: z.string().describe("Exact spoken line in the target dialect, or empty"),
        on_screen: z.string().describe("Text overlay, max 6 words, or empty"),
        visual: z.string().describe("What we see, in English for the crew"),
        shot: z.number().describe("Shot number from the shot list"),
      }),
    )
    .describe("Beat-by-beat script whose durations add up to the requested length"),
  shots: z.array(
    z.object({
      n: z.number(),
      type: z.enum(SHOT_TYPES),
      description: z.string(),
      location: z.string(),
      props: z.string(),
      talent: z.string(),
      duration: z.number().describe("seconds of usable footage needed"),
      notes: z.string(),
    }),
  ),
  edit: z.object({
    music: z.string().describe("Mood, tempo and a royalty-free style suggestion"),
    pacing: z.string(),
    transitions: z.array(z.string()),
    captions_style: z.string(),
    sfx: z.array(z.string()),
  }),
  caption: z.string().describe("Post caption in the target language/dialect"),
  hashtags: z.array(z.string()),
  cta: z.string(),
  compliance: z.object({ status: z.enum(["PASS", "REVIEW", "FAIL"]), notes: z.array(z.string()) }),
  voice_match: z.object({ score: z.number().describe("0-100"), notes: z.string() }),
});

export type DraftContent = Omit<z.infer<typeof DraftSchema>, "beats"> & {
  beats: { start: number; duration: number; vo: string; onScreen: string; visual: string; shot: number }[];
};

const DIALECT_NAMES: Record<string, string> = {
  SAUDI: "Saudi white dialect (اللهجة البيضاء)",
  KHALEEJI: "Gulf (Khaleeji) dialect",
  EGYPTIAN: "Egyptian Arabic",
  LEVANTINE: "Levantine Arabic",
  MSA: "Modern Standard Arabic",
  ENGLISH: "English",
  ARABIZI: "Saudi white dialect (the audience writes Arabizi, but scripts are in Arabic script)",
  IRAQI: "Iraqi Arabic",
  MAGHREBI: "Maghrebi Arabic",
  OTHER: "the brand's usual language",
};

const SYSTEM = `You are the creative director and head copywriter of a short-form video studio in Riyadh. You adapt proven viral formats into original, on-brand posts for regional brands: you keep the format's mechanics (hook pattern, structure, pacing) but write completely new content for the brand. Never copy creators' captions or jokes.

Deliver production-ready material: a script the talent can read as-is, a shot list a crew can shoot from, and an edit plan an editor can cut from. Spoken lines and on-screen text are in the target dialect; visual descriptions, shot list and edit notes are in English for the crew.

Check your own work: run the compliance check against the regional guide and the organization's rules (PASS only if nothing needs a human look), and score how well the script matches the brand voice.

${WRITING_GUIDE}`;

function toContent(out: z.infer<typeof DraftSchema>): DraftContent {
  return {
    ...out,
    beats: reflowBeats(out.beats.map((b) => ({ start: 0, duration: b.duration, vo: b.vo, onScreen: b.on_screen, visual: b.visual, shot: b.shot }))),
    voice_match: { ...out.voice_match, score: Math.max(0, Math.min(100, Math.round(out.voice_match.score))) },
  };
}

/** Writes (or rewrites, with an instruction) a content draft. */
export async function generateDraft(draftId: string, instruction?: string, revision?: number) {
  const ai = getAI();
  if (!ai) throw new Error("AI_DISABLED");
  const d = await db.contentDraft.findUniqueOrThrow({
    where: { id: draftId },
    include: { format: { include: { posts: { orderBy: { viralityScore: "desc" }, take: 5 } } }, voice: true, organization: true },
  });
  if (d.status !== "GENERATING" || (revision !== undefined && revision !== d.revision)) return;
  const voice = d.voice ?? (await db.brandVoice.findFirst({ where: { organizationId: d.organizationId, isDefault: true } }));

  const context = [
    d.organization.brandContext && `<brand>\n${d.organization.brandContext}\n</brand>`,
    d.organization.complianceRules && `<compliance_rules>\n${d.organization.complianceRules}\n</compliance_rules>`,
    voice &&
      `<brand_voice name="${voice.name}">\n${voice.summary}\nTraits: ${voice.traits.join(", ")}\nAlways: ${voice.dos.join("; ")}\nNever: ${voice.donts.join("; ")}\nBanned words: ${voice.bannedWords.join(", ") || "-"}\nAudience: ${voice.audience ?? "-"}\nCTA style: ${voice.ctaStyle ?? "-"}\nEmoji: ${voice.emojiPolicy ?? "-"}\nExamples:\n${voice.examples.slice(0, 6).map((e) => `- ${e}`).join("\n")}\n</brand_voice>`,
    await lexiconPrompt(d.organizationId),
  ]
    .filter(Boolean)
    .join("\n\n");

  const format = d.format
    ? `<format name="${d.format.nameEn}">
Summary: ${d.format.summaryEn}
Hook pattern: ${d.format.hookPattern}
Why it works: ${d.format.whyItWorks}
Structure: ${(d.format.structure as { label: string; description: string }[]).map((s) => `${s.label}: ${s.description}`).join(" → ")}
Example captions (for reference only, don't copy): ${d.format.posts.map((p) => `“${p.text.slice(0, 160)}”`).join(" | ")}
</format>`
    : "No specific format: pick the short-form structure that best fits the goal.";

  const brief = `Platform: ${d.platform}. Length: ${d.durationSec} seconds. Goal: ${d.goal}. Dialect for spoken lines and on-screen text: ${DIALECT_NAMES[d.dialect]}.
Post topic / brief: ${d.brief}`;

  const previous = d.content && instruction ? `<current_draft>\n${JSON.stringify(d.content)}\n</current_draft>\n\nRevise the current draft. Change request from the team: ${instruction}\nKeep everything that the request doesn't touch.` : "Write the post.";

  const { betas, ...fb } = fallbackParams(AI_MODEL);
  const res = await parseWithBudget(d.organizationId, "studio", {
    model: AI_MODEL,
    max_tokens: 16000,
    betas,
    ...fb,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: context || "No brand context provided." },
    ],
    output_config: { effort: "high", format: betaZodOutputFormat(DraftSchema) },
    messages: [{ role: "user", content: `${format}\n\n${brief}\n\n${previous}` }],
  });
  if (!res.parsed_output) throw new Error(`draft stopped: ${res.stop_reason}`);

  const content = toContent(res.parsed_output);
  await writeDraftContent({ id: d.id, orgId: d.organizationId, revision: d.revision, content, kind: d.content ? "REWRITE" : "GENERATED", instruction, generating: true, title: content.title.slice(0, 140) });
}
