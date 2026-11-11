import { db } from "./db";
import { sendEmail } from "./email";
import { generateReport, type ReportContent } from "./ai/report";

/** Emails a finished report's headline, summary and recommendations with a link to the full report. */
export async function sendWeeklyEmail(reportId: string) {
  const r = await db.report.findUniqueOrThrow({ where: { id: reportId }, include: { organization: true } });
  const to = r.organization.weeklyReportRecipients;
  if (to.length === 0) return false;
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
  return sendEmail(to, ar ? `التقرير الأسبوعي — ${r.organization.name}` : `Weekly report — ${r.organization.name}`, lines.filter((l) => l !== undefined).join("\n"));
}

/** Local weekday (0 = Sunday) and hour in a timezone. */
export function localDayHour(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0) };
}

/** Generates and emails weekly reports that are due (08:00 or later, local time, on the chosen day). */
export async function runDueWeeklyReports(now = new Date()) {
  const orgs = await db.organization.findMany({ where: { weeklyReportEnabled: true } });
  const sent: string[] = [];
  for (const org of orgs) {
    const { day, hour } = localDayHour(org.timezone, now);
    const due =
      day === org.weeklyReportDay &&
      hour >= 8 &&
      org.weeklyReportRecipients.length > 0 &&
      (!org.weeklyReportLastSentAt || now.getTime() - org.weeklyReportLastSentAt.getTime() > 5 * 86400_000);
    if (!due) continue;
    // Claim first so a second worker doesn't send a duplicate.
    const claimed = await db.organization.updateMany({
      where: { id: org.id, weeklyReportLastSentAt: org.weeklyReportLastSentAt },
      data: { weeklyReportLastSentAt: now },
    });
    if (claimed.count === 0) continue;
    const start = new Date(now.getTime() - 7 * 86400_000);
    const report = await db.report.create({
      data: {
        organizationId: org.id,
        weekly: true,
        title: `${org.weeklyReportLocale === "ar" ? "التقرير الأسبوعي" : "Weekly report"} · ${start.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`,
        locale: org.weeklyReportLocale,
        periodStart: start,
        periodEnd: now,
      },
    });
    try {
      await generateReport(report.id);
      await sendWeeklyEmail(report.id);
      sent.push(org.slug);
    } catch (e) {
      console.error(`weekly report failed for ${org.slug}`, e);
    }
  }
  return sent;
}
