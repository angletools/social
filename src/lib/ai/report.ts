import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db } from "../db";
import { getDialectBreakdown, getIntentBreakdown, getKpis, getPlatformBreakdown, getShareOfVoice, getTopAuthors, getTopSlang, getTopTopics } from "../analytics";
import { getReportSeries } from "../report-series";
import { AI_MODEL, fallbackParams, getAI } from "./client";

const ReportSchema = z.object({
  headline: z.string().describe("One sentence: the single most important takeaway"),
  summary: z.string().describe("Executive summary, 3-5 sentences"),
  sections: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .describe("3-6 sections, e.g. Sentiment, Key themes, Voice of the customer (dialects, intents, sarcasm), Risks, Competitors, Influencers"),
  recommendations: z
    .array(z.string())
    .describe("3-5 concrete, actionable recommendations. Each starts with a short imperative title sentence, then one or two sentences of detail, e.g. 'Own the crash in public. Pin one post on X with the cause and the fix date.'"),
  notable: z.array(z.number()).describe("Item numbers of up to 5 posts worth showing management"),
});

export type ReportContent = z.infer<typeof ReportSchema> & { notablePosts?: NotablePost[] };
export type NotablePost = {
  platform: string;
  author: string | null;
  text: string;
  url: string | null;
  sentiment: string | null;
  // Added with the v2 report layout; older reports don't have these.
  id?: string;
  name?: string | null;
  followers?: number | null;
  likes?: number;
  comments?: number;
  views?: number;
  publishedAt?: string;
};

const SYSTEM = `You write social-listening reports for the management of a Saudi company. Readers are executives who want clear conclusions, not data dumps.
If kpis.comparable is false, the previous period has too little data: do not quote percentage changes or "up/down vs before" for it; describe the current period on its own.
Write with confidence and precision, grounded only in the statistics and posts provided. Quote numbers with comparisons. Call out risks plainly. No filler, no hedging, no markdown headings inside fields (plain sentences; bullet-like lines are fine in section bodies).`;

/** The statistics and the post sample a report is written from. */
export async function collectReportData(reportId: string) {
  const report = await db.report.findUniqueOrThrow({ where: { id: reportId }, include: { organization: true, monitor: true } });
  const days = Math.max(1, Math.round((report.periodEnd.getTime() - report.periodStart.getTime()) / 86400_000));
  const scope = { orgId: report.organizationId, days, monitorId: report.monitorId ?? undefined };

  const [kpis, topics, authors, platforms, sov, dialects, intents, slang, series] = await Promise.all([
    getKpis(scope),
    getTopTopics(scope, 12),
    getTopAuthors(scope, 8),
    getPlatformBreakdown(scope),
    report.monitorId ? Promise.resolve([]) : getShareOfVoice(scope),
    getDialectBreakdown(scope),
    getIntentBreakdown(scope),
    getTopSlang(scope, 10),
    getReportSeries({ orgId: report.organizationId, monitorId: report.monitorId, start: report.periodStart, end: report.periodEnd, tz: report.organization.timezone }),
  ]);
  const stats = { days, kpis, topics, authors, platforms, shareOfVoice: sov, dialects, intents, slang, series };

  const baseWhere = {
    organizationId: report.organizationId,
    relevant: true,
    publishedAt: { gte: report.periodStart, lte: report.periodEnd },
    ...(report.monitorId && { monitorId: report.monitorId }),
  };
  const select = {
    id: true, platform: true, text: true, url: true, authorHandle: true, authorName: true, authorFollowers: true, likes: true,
    comments: true, shares: true, views: true, publishedAt: true, sentiment: true, isRisk: true, riskReason: true, monitor: { select: { name: true } },
  } as const;
  const [engaged, negative, risks] = await Promise.all([
    db.mention.findMany({ where: baseWhere, orderBy: { likes: "desc" }, take: 40, select }),
    db.mention.findMany({ where: { ...baseWhere, sentiment: "NEGATIVE" }, orderBy: { authorFollowers: { sort: "desc", nulls: "last" } }, take: 30, select }),
    db.mention.findMany({ where: { ...baseWhere, isRisk: true }, orderBy: { publishedAt: "desc" }, take: 20, select }),
  ]);
  const seen = new Set<string>();
  const sample = [...risks, ...negative, ...engaged].filter((p) => {
    const k = p.text.slice(0, 80);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { report, stats, sample };
}

type SamplePost = Awaited<ReturnType<typeof collectReportData>>["sample"][number];

export const toNotablePost = (p: SamplePost): NotablePost => ({
  id: p.id,
  platform: p.platform,
  author: p.authorHandle,
  name: p.authorName,
  followers: p.authorFollowers,
  likes: p.likes,
  comments: p.comments,
  views: p.views,
  publishedAt: p.publishedAt.toISOString(),
  text: p.text.slice(0, 400),
  url: p.url,
  sentiment: p.sentiment,
});

/** Builds the stats + post sample for a period, then has the model write the report. */
export async function generateReport(reportId: string) {
  const { report, stats, sample } = await collectReportData(reportId);

  const ai = getAI();
  if (!ai) {
    await db.report.update({
      where: { id: reportId },
      data: { status: "FAILED", stats: stats as object, error: "AI is not configured (ANTHROPIC_API_KEY)." },
    });
    return;
  }

  const lang = report.locale === "ar" ? "Arabic (Modern Standard Arabic)" : "English";
  const posts = sample
    .map(
      (p, i) =>
        `<post n="${i + 1}" platform="${p.platform}" monitor="${p.monitor.name}" author="@${p.authorHandle ?? "?"}" followers="${p.authorFollowers ?? 0}" likes="${p.likes}" sentiment="${p.sentiment}"${p.isRisk ? ` risk="${(p.riskReason ?? "yes").replace(/"/g, "'")}"` : ""}>${p.text.slice(0, 500)}</post>`,
    )
    .join("\n");

  const model = AI_MODEL;
  const { betas, ...fb } = fallbackParams(model);
  const res = await ai.beta.messages.parse({
    model,
    max_tokens: 16000,
    betas,
    ...fb,
    system: `${SYSTEM}${report.organization.brandContext ? `\n\nAbout the company: ${report.organization.brandContext}` : ""}`,
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
    messages: [
      {
        role: "user",
        content: `Write the report in ${lang}.
Scope: ${report.monitor ? `monitor "${report.monitor.name}"` : "all monitors"}, ${report.periodStart.toISOString().slice(0, 10)} to ${report.periodEnd.toISOString().slice(0, 10)}.

<statistics>
${JSON.stringify(stats)}
</statistics>

<posts>
${posts}
</posts>`,
      },
    ],
  });

  if (!res.parsed_output) {
    await db.report.update({
      where: { id: reportId },
      data: { status: "FAILED", stats: stats as object, error: `Model stopped: ${res.stop_reason}` },
    });
    return;
  }

  const content: ReportContent = {
    ...res.parsed_output,
    notablePosts: res.parsed_output.notable
      .map((n) => sample[n - 1])
      .filter(Boolean)
      .slice(0, 5)
      .map(toNotablePost),
  };
  await db.report.update({
    where: { id: reportId },
    data: { status: "READY", stats: stats as object, content: content as object },
  });
}
