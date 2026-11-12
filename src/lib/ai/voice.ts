import { parseWithBudget } from "./budget";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AI_MODEL, fallbackParams, getAI } from "./client";
import { DIALECT_GUIDE } from "./dialect";

const DIALECTS = ["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"] as const;

const VoiceSchema = z.object({
  name: z.string(),
  summary: z.string().describe("One paragraph a new copywriter could follow"),
  dialect: z.enum(DIALECTS),
  traits: z.array(z.string()).describe("3-6 personality adjectives"),
  dos: z.array(z.string()).describe("4-8 concrete writing rules observed in the samples"),
  donts: z.array(z.string()).describe("3-6 things this voice never does"),
  banned_words: z.array(z.string()),
  audience: z.string(),
  cta_style: z.string(),
  emoji_policy: z.string(),
  examples: z.array(z.string()).describe("The 3-5 most representative samples, verbatim"),
});

export type LearnedVoice = z.infer<typeof VoiceSchema>;

/** Derives a brand-voice profile from sample posts. */
export async function learnVoice(organizationId: string, samples: string[], brandContext?: string | null): Promise<LearnedVoice> {
  const ai = getAI();
  if (!ai) throw new Error("AI_DISABLED");
  const { betas, ...fb } = fallbackParams(AI_MODEL);
  const res = await parseWithBudget(organizationId, "voice", {
    model: AI_MODEL,
    max_tokens: 8000,
    betas,
    ...fb,
    system: `You are a brand strategist in Riyadh. You analyse a brand's social posts and write a precise, practical voice guide: how it sounds, which dialect it writes in, sentence length, humour, formality, emoji and CTA habits. Base every rule on evidence in the samples; don't invent a personality the samples don't show.\n\n${DIALECT_GUIDE}`,
    output_config: { effort: "medium", format: betaZodOutputFormat(VoiceSchema) },
    messages: [
      {
        role: "user",
        content: `${brandContext ? `About the brand: ${brandContext}\n\n` : ""}<samples>\n${samples.map((s, i) => `<post n="${i + 1}">${s.slice(0, 1200)}</post>`).join("\n")}\n</samples>`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error(`voice learning stopped: ${res.stop_reason}`);
  return res.parsed_output;
}
