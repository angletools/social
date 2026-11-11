import { notFound } from "next/navigation";
import { Lightbulb } from "lucide-react";
import type { Platform, Sentiment } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dictFor, getDict } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/utils";
import type { ReportContent } from "@/lib/ai/report";
import { KpiCard } from "@/components/ui";
import { PlatformIcon } from "@/components/platform";
import { SentimentBadge } from "@/components/sentiment";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReportToolbar } from "./toolbar";

type Stats = {
  kpis: { mentions: number; netSentiment: number; engagement: number; reach: number; risks: number; deltas: Record<string, number> };
  topics: { key: string; labelEn: string; labelAr: string; count: number }[];
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t: ui } = await getDict();
  const { id } = await params;
  const report = await db.report.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!report) notFound();

  // The report renders in its own language, regardless of the UI language.
  const locale = report.locale === "en" ? "en" : "ar";
  const t = dictFor(locale);
  const content = report.content as ReportContent | null;
  const stats = report.stats as Stats | null;

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <AutoRefresh active={report.status === "GENERATING"} every={4000} maxMs={300_000} />
      <ReportToolbar id={report.id} labels={{ back: ui.common.back, print: ui.common.print, delete: ui.common.delete, confirm: ui.common.confirmDelete }} />

      <article className="card mx-auto max-w-4xl p-6 sm:p-12 print:max-w-none print:p-0">
        <header className="border-b border-line pb-6">
          <div className="flex items-center gap-2 text-sm text-brand-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-6 w-6" /> {t.app.name} · {t.reports.title}
          </div>
          <h1 className="mt-3 text-2xl font-semibold" dir="auto">{report.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {t.reports.period}: {formatDate(report.periodStart, locale)} – {formatDate(report.periodEnd, locale)} · {t.reports.generatedOn} {formatDate(report.createdAt, locale)}
          </p>
        </header>

        {report.status === "GENERATING" && <p className="animate-pulse py-16 text-center text-muted">{ui.reports.generating}</p>}
        {report.status === "FAILED" && (
          <p className="my-8 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {ui.reports.failed}
            {report.error ? ` — ${report.error}` : ""}
          </p>
        )}

        {stats && (
          <section className="mt-8">
            <h2 className="mb-4 text-lg font-semibold">{t.reports.keyNumbers}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label={t.overview.mentions} value={formatNumber(stats.kpis.mentions, locale)} delta={stats.kpis.deltas.mentions} />
              <KpiCard label={t.sentiment.net} value={`${stats.kpis.netSentiment > 0 ? "+" : ""}${stats.kpis.netSentiment}`} delta={stats.kpis.deltas.netSentiment} deltaSuffix="" />
              <KpiCard label={t.overview.reach} value={formatNumber(stats.kpis.reach, locale)} delta={stats.kpis.deltas.reach} />
              <KpiCard label={t.overview.risks} value={formatNumber(stats.kpis.risks, locale)} delta={stats.kpis.deltas.risks} invert />
            </div>
          </section>
        )}

        {content && (
          <>
            <section className="mt-10 rounded-2xl bg-brand-50 p-6">
              <p className="text-lg font-semibold leading-relaxed text-brand-900">{content.headline}</p>
              <p className="mt-3 leading-relaxed text-slate-700">{content.summary}</p>
            </section>
            {content.sections.map((s, i) => (
              <section key={i} className="mt-8 break-inside-avoid">
                <h2 className="mb-2 text-lg font-semibold">{s.title}</h2>
                <p className="whitespace-pre-line leading-relaxed text-slate-700">{s.body}</p>
              </section>
            ))}
            {stats && stats.topics.length > 0 && (
              <section className="mt-8 break-inside-avoid">
                <h2 className="mb-3 text-lg font-semibold">{t.overview.topTopics}</h2>
                <div className="flex flex-wrap gap-2">
                  {stats.topics.map((tp) => (
                    <span key={tp.key} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                      {locale === "ar" ? tp.labelAr : tp.labelEn} <span className="text-muted ltr-nums">({tp.count})</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section className="mt-8 break-inside-avoid rounded-2xl border border-line p-6">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Lightbulb className="h-5 w-5 text-amber-500" /> {t.reports.recommendations}
              </h2>
              <ol className="list-decimal space-y-2 ps-5 leading-relaxed">
                {content.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </section>
            {content.notablePosts && content.notablePosts.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-lg font-semibold">{t.reports.topPosts}</h2>
                <div className="space-y-3">
                  {content.notablePosts.map((p, i) => (
                    <div key={i} className="break-inside-avoid rounded-xl border border-line p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm">
                        <PlatformIcon platform={p.platform as Platform} size="sm" />
                        <span className="text-muted ltr-nums">@{p.author}</span>
                        <SentimentBadge sentiment={p.sentiment as Sentiment | null} label={p.sentiment ? t.sentiment[p.sentiment as Sentiment] : ""} />
                      </div>
                      <p dir="auto" className="text-sm leading-relaxed">{p.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </article>
    </div>
  );
}
