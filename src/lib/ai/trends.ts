import { parseWithBudget } from "./budget";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { AI_MODEL, fallbackParams, getAI } from "./client";
import { DIALECT_GUIDE } from "./dialect";

const FormatsSchema = z.object({
  formats: z.array(
    z.object({
      existing_id: z.string().nullable().describe("id of an existing format this matches, or null for a new one"),
      name_en: z.string(),
      name_ar: z.string(),
      summary_en: z.string().describe("2 sentences: what the video looks like and how it unfolds"),
      summary_ar: z.string(),
      hook_pattern: z.string().describe("The repeatable opening: on-screen text / first line / first visual (English)"),
      hook_pattern_ar: z.string(),
      why_it_works: z.string().describe("1-2 sentences on the psychology and why it travels in this region (English)"),
      why_it_works_ar: z.string(),
      structure: z
        .array(z.object({ label: z.string(), description: z.string(), label_ar: z.string(), description_ar: z.string() }))
        .describe("3-6 beats, English and Arabic"),
      post_numbers: z.array(z.number()).describe("Numbers of the posts that use this format"),
    }),
  ),
});

const SYSTEM = `You are a short-form video strategist for brands in Saudi Arabia and the Gulf. You study viral posts in a niche and identify repeatable FORMATS: the reusable creative template behind a post (structure, hook mechanic, editing pattern), not its topic. "POV skit with two characters", "3-mistakes countdown", "green-screen myth bust" and "street question" are formats; "saving money" is a topic.

Rules:
- Group posts that share a format. Only create a format when at least 2 posts share it, unless a single post is an extreme outlier with a clearly copyable structure.
- Reuse an existing format (set existing_id) when posts match it, and keep its names unless they are clearly wrong.
- Names are short and recognisable to a social media manager. Arabic names use natural Saudi phrasing.
- Posts are captions only (you can't watch the video): infer the format from caption, hashtags, duration and engagement, and be conservative.
- Ignore spam, giveaways and reposts.

${DIALECT_GUIDE}`;

/** Clusters recent top posts of a trend watch into formats. Returns number of formats touched. */
export async function extractFormats(watchId: string): Promise<number> {
  const ai = getAI();
  if (!ai) return 0;
  const watch = await db.trendWatch.findUniqueOrThrow({ where: { id: watchId } });
  const posts = await db.trendPost.findMany({
    where: { watchId, publishedAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
    orderBy: { viralityScore: "desc" },
    take: 80,
  });
  if (posts.length < 3) return 0;
  const existing = await db.trendFormat.findMany({
    where: { organizationId: watch.organizationId, dismissed: false, lastSeenAt: { gte: new Date(Date.now() - 45 * 86400_000) } },
    select: { id: true, nameEn: true, hookPattern: true, summaryEn: true },
  });

  const list = posts
    .map(
      (p, i) =>
        `<post n="${i + 1}" platform="${p.platform}" views="${p.views}" outlier="${p.outlierRatio.toFixed(1)}x" duration="${p.durationSec ?? "?"}s" author="@${p.authorHandle ?? "?"}">${p.text.slice(0, 500)}</post>`,
    )
    .join("\n");

  const { betas, ...fb } = fallbackParams(AI_MODEL);
  const res = await parseWithBudget(watch.organizationId, "trends", {
    model: AI_MODEL,
    max_tokens: 16000,
    betas,
    ...fb,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: betaZodOutputFormat(FormatsSchema) },
    messages: [
      {
        role: "user",
        content: `Niche: ${watch.name} (seeds: ${watch.seeds.join(", ")}).

<existing_formats>
${existing.map((f) => `<format id="${f.id}" name="${f.nameEn}">${f.hookPattern} — ${f.summaryEn}</format>`).join("\n") || "none"}
</existing_formats>

<posts>
${list}
</posts>`,
      },
    ],
  });
  if (!res.parsed_output) throw new Error(`format extraction stopped: ${res.stop_reason}`);

  const validIds = new Set(existing.map((f) => f.id));
  let touched = 0;
  for (const f of res.parsed_output.formats) {
    const members = f.post_numbers.map((n) => posts[n - 1]).filter(Boolean);
    if (members.length === 0) continue;
    const data = {
      nameEn: f.name_en.slice(0, 120),
      nameAr: f.name_ar.slice(0, 120),
      summaryEn: f.summary_en.slice(0, 600),
      summaryAr: f.summary_ar.slice(0, 600),
      hookPattern: f.hook_pattern.slice(0, 300),
      hookPatternAr: f.hook_pattern_ar.slice(0, 300),
      whyItWorks: f.why_it_works.slice(0, 500),
      whyItWorksAr: f.why_it_works_ar.slice(0, 500),
      structure: f.structure.slice(0, 8).map((b) => ({ label: b.label, description: b.description, labelAr: b.label_ar, descriptionAr: b.description_ar })),
      lastSeenAt: new Date(),
    };
    const format =
      f.existing_id && validIds.has(f.existing_id)
        ? await db.trendFormat.update({ where: { id: f.existing_id }, data })
        : await db.trendFormat.create({ data: { ...data, organizationId: watch.organizationId, watchId } });
    await db.trendPost.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { formatId: format.id, analyzedAt: new Date() } });
    touched++;
  }
  return touched;
}
