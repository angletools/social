import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatDate, formatNumber, timeAgo } from "@/lib/utils";
import { getKpis, getTimeseries, getTopTopics, parseDays } from "@/lib/analytics";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { VolumeChart } from "@/components/charts";
import { PlatformIcon } from "@/components/platform";
import { SentimentBar } from "@/components/sentiment";
import { MentionCard } from "@/components/mention-card";
import { AutoRefresh } from "@/components/auto-refresh";
import { MonitorActions } from "./monitor-actions";

export default async function MonitorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { id } = await params;
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const monitor = await db.monitor.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!monitor) notFound();

  const scope = { orgId: user.organizationId, days, monitorId: id };
  const [kpis, series, topics, mentions, runs, topicRows] = await Promise.all([
    getKpis(scope),
    getTimeseries(scope),
    getTopTopics(scope, 6),
    db.mention.findMany({
      where: { monitorId: id, relevant: true, status: { not: "ARCHIVED" } },
      orderBy: { publishedAt: "desc" },
      take: 8,
    }),
    db.syncRun.findMany({ where: { monitorId: id }, orderBy: { startedAt: "desc" }, take: 8 }),
    db.topic.findMany({ where: { organizationId: user.organizationId } }),
  ]);
  const topicLabels = new Map(topicRows.map((r) => [r.key, { en: r.labelEn, ar: r.labelAr }]));
  const waiting = sp.created === "1" && (runs.length === 0 || runs.some((r) => r.status === "RUNNING"));
  const maxTopic = Math.max(1, ...topics.map((x) => x.count));

  return (
    <>
      <AutoRefresh active={waiting || runs.some((r) => r.status === "RUNNING")} />
      <PageHeader
        title={monitor.name}
        subtitle={`${t.monitors.types[monitor.type]}${monitor.isCompetitor ? ` · ${t.monitors.competitor}` : ""} · ${t.common.lastUpdated}: ${monitor.lastSyncAt ? timeAgo(monitor.lastSyncAt, locale) : t.common.never}`}
        actions={
          <>
            <MonitorActions
              id={id}
              active={monitor.status === "ACTIVE"}
              canAdmin={hasRole(user, "ADMIN")}
              labels={{ pause: t.common.pause, resume: t.common.resume, refresh: t.common.refreshNow, delete: t.monitors.detail.deleteMonitor, confirm: t.common.confirmDelete }}
            />
            <RangeTabs days={days} labels={t.common.range} basePath={`/monitors/${id}`} />
          </>
        }
      />
      {sp.created === "1" && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5" /> {t.monitors.wizard.created}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {monitor.platforms.map((p) => (
          <span key={p} className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-xs ring-1 ring-line">
            <PlatformIcon platform={p} size="sm" /> {t.platforms[p]}
          </span>
        ))}
        {monitor.terms.map((term) => (
          <span key={term} dir="auto" className="rounded-xl bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">
            {monitor.type === "HASHTAG" ? "#" : monitor.type === "PROFILE" ? "@" : ""}
            {term}
          </span>
        ))}
      </div>
      {monitor.description && <p className="mb-6 max-w-3xl text-sm text-muted" dir="auto">{monitor.description}</p>}

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label={t.overview.mentions} value={formatNumber(kpis.mentions, locale)} delta={kpis.deltas.mentions} vsLabel={t.overview.vsPrev} />
          <KpiCard label={t.sentiment.net} value={`${kpis.netSentiment > 0 ? "+" : ""}${kpis.netSentiment}`} delta={kpis.deltas.netSentiment} deltaSuffix="" help={t.sentiment.help} vsLabel={t.overview.vsPrev} />
          <KpiCard label={t.overview.reach} value={formatNumber(kpis.reach, locale)} delta={kpis.deltas.reach} vsLabel={t.overview.vsPrev} />
          <KpiCard label={t.overview.risks} value={formatNumber(kpis.risks, locale)} delta={kpis.deltas.risks} invert vsLabel={t.overview.vsPrev} icon={<ShieldAlert className="h-4 w-4" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={t.overview.volume} className="lg:col-span-2">
            <VolumeChart points={series.points} unit={series.unit} locale={locale} labels={{ positive: t.sentiment.POSITIVE, neutral: t.sentiment.NEUTRAL, negative: t.sentiment.NEGATIVE }} />
          </Card>
          <Card title={t.overview.topTopics}>
            <ul className="space-y-3.5">
              {topics.map((tp) => (
                <li key={tp.key}>
                  <Link href={`/mentions?monitor=${id}&topic=${tp.key}&days=${days}`} className="group block">
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="group-hover:text-brand-700">{locale === "ar" ? tp.labelAr : tp.labelEn}</span>
                      <span className="text-muted ltr-nums">{tp.count}</span>
                    </div>
                    <div style={{ width: `${Math.max(8, (tp.count / maxTopic) * 100)}%` }}>
                      <SentimentBar pos={tp.positive} neg={tp.negative} neu={tp.count - tp.positive - tp.negative} />
                    </div>
                  </Link>
                </li>
              ))}
              {topics.length === 0 && <p className="text-sm text-muted">{t.common.noData}</p>}
            </ul>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t.overview.latest}</h2>
              <Link href={`/mentions?monitor=${id}`} className="text-sm text-brand-700 hover:underline">{t.common.viewAll}</Link>
            </div>
            {mentions.map((m) => (
              <MentionCard key={m.id} m={m} t={t} locale={locale} topicLabels={topicLabels} canAct={hasRole(user, "ANALYST")} />
            ))}
            {mentions.length === 0 && <div className="card p-8 text-center text-sm text-muted">{waiting ? t.common.loading : t.common.noData}</div>}
          </div>
          <Card title={t.monitors.detail.syncHistory} bodyClassName="p-0">
            <ul className="divide-y divide-line text-sm">
              {runs.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                  <PlatformIcon platform={r.platform} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted">{formatDate(r.startedAt, locale, { dateStyle: "short", timeStyle: "short" })}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          r.status === "SUCCESS" ? "bg-green-50 text-green-700" : r.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs">
                      <span className="ltr-nums">{r.itemsFetched}</span> {t.monitors.detail.fetched} · <span className="ltr-nums">{r.itemsNew}</span> {t.monitors.detail.new}
                      {r.source === "demo" && <span className="text-amber-700"> · {t.common.demoMode}</span>}
                    </div>
                    {r.error && <p className="mt-1 break-words text-xs text-red-600" dir="ltr">{r.error}</p>}
                  </div>
                </li>
              ))}
              {runs.length === 0 && <li className="px-5 py-6 text-center text-muted">{t.monitors.detail.noRuns}</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
