import { Prisma } from "@prisma/client";
import { deliverPending } from "./delivery";
import { toLocalNaive } from "./report-series";
import { db } from "./db";
import { sendEmail } from "./email";
import { senderFor, wallTimeToUtc } from "./workspace";
import { type ReportContent } from "./ai/report";

/** Emails a finished report's headline, summary and recommendations with a link to the full report. */
export async function sendWeeklyEmail(reportId: string) {
  const r = await db.report.findUniqueOrThrow({ where: { id: reportId }, include: { organization: true } });
  const to = r.organization.weeklyReportRecipients;
  if (to.length === 0 || r.status !== "READY") return false;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const ar = r.locale === "ar";
  const c = r.content as ReportContent | null;
  const stats = r.stats as { kpis?: { mentions: number; netSentiment: number; risks: number } } | null;
  const lines = [
    ar ? `${r.organization.name} — التقرير الأسبوعي` : `${r.organization.name} — weekly report`,
    "",
    stats?.kpis
      ? ar
        ? `الإشارات: ${stats.kpis.mentions} · صافي المشاعر: ${stats.kpis.netSentiment} · مخاطر: ${stats.kpis.risks}`
        : `Mentions: ${stats.kpis.mentions} · Net sentiment: ${stats.kpis.netSentiment} · Risks: ${stats.kpis.risks}`
      : "",
    "",
    c ? c.headline : ar ? "تعذّر إنشاء الملخص هذا الأسبوع (الذكاء الاصطناعي غير متاح)." : "The AI summary couldn't be generated this week.",
    c ? `\n${c.summary}` : "",
    c?.recommendations?.length ? `\n${ar ? "التوصيات" : "Recommendations"}:\n${c.recommendations.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "",
    "",
    `${ar ? "التقرير الكامل" : "Full report"}: ${appUrl}/reports/${r.id}`,
  ];
  return sendEmail(to, ar ? `التقرير الأسبوعي — ${r.organization.name}` : `Weekly report — ${r.organization.name}`, lines.filter((l) => l !== undefined).join("\n"), senderFor(r.organization), r.id);
}

/** Local weekday (0 = Sunday) and hour in a timezone. */
export function localDayHour(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0) };
}

/** One durable report/delivery per local scheduled day; retries keep its original period. */
export async function runDueWeeklyReports(now = new Date(), organizationId?: string) {
  const orgs = await db.organization.findMany({ where: { weeklyReportEnabled: true, ...(organizationId && { id: organizationId }) } });
  for (const org of orgs) {
    const { day, hour } = localDayHour(org.timezone, now);
    if (day !== org.weeklyReportDay || hour < 8 || org.weeklyReportRecipients.length === 0) continue;
    const local = toLocalNaive(now, org.timezone);
    const date = local.toISOString().slice(0, 10);
    const weeklyKey = `${org.id}:${date}`;
    if (await db.report.findUnique({ where: { weeklyKey }, select: { id: true } })) continue;
    // Do not automatically resend legacy reports whose delivery cannot be reconstructed.
    if (org.weeklyReportLastSentAt && now.getTime() - org.weeklyReportLastSentAt.getTime() < 5 * 86400_000) continue;
    const end = wallTimeToUtc(new Date(`${date}T08:00:00Z`), org.timezone);
    const start = new Date(end.getTime() - 7 * 86400_000);
    try {
      await db.$transaction(async (tx) => {
        const report = await tx.report.create({ data: {
          organizationId: org.id, weekly: true, weeklyKey,
          title: `${org.weeklyReportLocale === "ar" ? "التقرير الأسبوعي" : "Weekly report"} · ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
          locale: org.weeklyReportLocale, periodStart: start, periodEnd: end,
        } });
        await tx.delivery.create({ data: { organizationId: org.id, dedupeKey: `weekly:${weeklyKey}`, channel: "WEEKLY_REPORT", reportId: report.id, recipients: [], nextAttemptAt: now } });
      });
    } catch (e) { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; }
  }
  const sentIds = await deliverPending(now, organizationId, "WEEKLY_REPORT");
  const sent = await db.delivery.findMany({ where: { id: { in: sentIds } }, select: { organization: { select: { slug: true } } } });
  return sent.map((d) => d.organization.slug);
}
