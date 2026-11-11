import Link from "next/link";
import { MessagesSquare, Radar, ShieldAlert, Smile, Zap } from "lucide-react";
import type { Platform } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import { getKpis, getPlatformBreakdown, getShareOfVoice, getTimeseries, getTopAuthors, getTopTopics, parseDays } from "@/lib/analytics";
import { Card, EmptyState, KpiCard, PageHeader } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { DonutChart, ShareOfVoiceChart, VolumeChart } from "@/components/charts";
import { PLATFORM_COLORS, PlatformIcon } from "@/components/platform";
import { SentimentBar } from "@/components/sentiment";
import { MentionCard } from "@/components/mention-card";
import { BriefCard } from "./brief-card";
import type { ReportContent } from "@/lib/ai/report";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const orgId = user.organizationId;

  const monitorCount = await db.monitor.count({ where: { organizationId: orgId } });
  if (monitorCount === 0) {
    return (
      <>
        <PageHeader title={t.overview.title} />
        <EmptyState icon={<Radar className="h-7 w-7" />} title={t.overview.emptyTitle} body={t.overview.emptyBody} cta={{ href: "/monitors/new", label: t.overview.emptyCta }} />
      </>
    );
  }

  const scope = { orgId, days };
  const [kpis, series, platforms, topics, sov, authors, latest, topicRows, brief] = await Promise.all([
    getKpis(scope),
    getTimeseries(scope),
    getPlatformBreakdown(scope),
    getTopTopics(scope, 8),
    getShareOfVoice(scope),
    getTopAuthors(scope, 6),
    db.mention.findMany({
      where: { organizationId: orgId, relevant: true, status: { not: "ARCHIVED" } },
      orderBy: { publishedAt: "desc" },
      take: 4,
      include: { monitor: { select: { name: true } } },
    }),
    db.topic.findMany({ where: { organizationId: orgId } }),
    db.report.findFirst({ where: { organizationId: orgId, kind: "brief" }, orderBy: { createdAt: "desc" } }),
  ]);
  const topicLabels = new Map(topicRows.map((r) => [r.key, { en: r.labelEn, ar: r.labelAr }]));
  const briefContent = brief?.content as ReportContent | null;
  const maxTopic = Math.max(1, ...topics.map((x) => x.count));
  const sentTotal = kpis.positive + kpis.neutral + kpis.negative;
  const pct = (n: number) => (sentTotal ? Math.round((n / sentTotal) * 100) : 0);

  return (
    <>
      <PageHeader
        title={t.overview.title}
        subtitle={t.overview.subtitle}
        actions={<RangeTabs days={days} labels={t.common.range} basePath="/" />}
      />

      <div className="space-y-6">
        <BriefCard
          aiOn={aiEnabled()}
          brief={
            brief
              ? { status: brief.status, headline: briefContent?.headline, summary: briefContent?.summary, when: timeAgo(brief.createdAt, locale) }
              : null
          }
          labels={{
            title: t.overview.aiBrief,
            empty: t.overview.aiBriefEmpty,
            generate: t.overview.generateBrief,
            generating: t.reports.generating,
            disabled: t.assistant.disabled,
            failed: t.reports.failed,
          }}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label={t.overview.mentions} value={formatNumber(kpis.mentions, locale)} delta={kpis.deltas.mentions} vsLabel={t.overview.vsPrev} icon={<MessagesSquare className="h-4 w-4" />} />
          <KpiCard
            label={t.sentiment.net}
            value={`${kpis.netSentiment > 0 ? "+" : ""}${kpis.netSentiment}`}
            delta={kpis.deltas.netSentiment}
            deltaSuffix=""
            help={t.sentiment.help}
            vsLabel={t.overview.vsPrev}
            icon={<Smile className="h-4 w-4" />}
          />
          <KpiCard label={t.overview.engagement} value={formatNumber(kpis.engagement, locale)} delta={kpis.deltas.engagement} vsLabel={t.overview.vsPrev} icon={<Zap className="h-4 w-4" />} />
          <KpiCard label={t.overview.risks} value={formatNumber(kpis.risks, locale)} delta={kpis.deltas.risks} invert vsLabel={t.overview.vsPrev} icon={<ShieldAlert className="h-4 w-4" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={t.overview.volume} className="lg:col-span-2">
            <VolumeChart points={series.points} unit={series.unit} locale={locale} labels={{ positive: t.sentiment.POSITIVE, neutral: t.sentiment.NEUTRAL, negative: t.sentiment.NEGATIVE }} />
          </Card>
          <Card title={t.sentiment.label} help={t.sentiment.help}>
            <DonutChart
              centerValue={`${kpis.netSentiment > 0 ? "+" : ""}${kpis.netSentiment}`}
              centerLabel={t.sentiment.net}
              data={[
                { name: t.sentiment.POSITIVE, value: kpis.positive, color: "#16a34a" },
                { name: t.sentiment.NEUTRAL, value: kpis.neutral, color: "#94a3b8" },
                { name: t.sentiment.NEGATIVE, value: kpis.negative, color: "#dc2626" },
              ]}
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {(["POSITIVE", "NEUTRAL", "NEGATIVE"] as const).map((s) => (
                <Link key={s} href={`/mentions?sentiment=${s}&days=${days}`} className="rounded-xl p-2 hover:bg-canvas">
                  <div className="text-lg font-semibold ltr-nums">{pct(s === "POSITIVE" ? kpis.positive : s === "NEUTRAL" ? kpis.neutral : kpis.negative)}%</div>
                  <div className="text-xs text-muted">{t.sentiment[s]}</div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t.overview.topTopics} actions={<Link href="/mentions" className="text-xs text-brand-700 hover:underline">{t.common.viewAll}</Link>}>
            {topics.length === 0 ? (
              <p className="text-sm text-muted">{t.common.noData}</p>
            ) : (
              <ul className="space-y-3.5">
                {topics.map((tp) => (
                  <li key={tp.key}>
                    <Link href={`/mentions?topic=${tp.key}&days=${days}`} className="group block">
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium group-hover:text-brand-700">{locale === "ar" ? tp.labelAr : tp.labelEn}</span>
                        <span className="text-muted ltr-nums">{formatNumber(tp.count, locale)}</span>
                      </div>
                      <div style={{ width: `${Math.max(8, (tp.count / maxTopic) * 100)}%` }}>
                        <SentimentBar pos={tp.positive} neg={tp.negative} neu={tp.count - tp.positive - tp.negative} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t.overview.shareOfVoice} help={t.overview.shareOfVoiceHelp}>
            {sov.length === 0 ? (
              <p className="text-sm text-muted">{t.common.noData}</p>
            ) : (
              <>
                <ShareOfVoiceChart data={sov.map((s) => ({ name: s.name, share: s.share, isCompetitor: s.isCompetitor }))} />
                <div className="mt-4 divide-y divide-line text-sm">
                  {sov.map((s) => (
                    <div key={s.monitorId} className="flex items-center justify-between py-2">
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${s.isCompetitor ? "bg-slate-300" : "bg-brand-600"}`} />
                        {s.name}
                        {s.isCompetitor && <span className="text-xs text-muted">({t.monitors.competitor})</span>}
                      </span>
                      <span className="text-muted">
                        {t.sentiment.net}: <b className={`ltr-nums ${s.netSentiment >= 0 ? "text-green-700" : "text-red-700"}`}>{s.netSentiment > 0 ? "+" : ""}{s.netSentiment}</b>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={t.overview.byPlatform}>
            <DonutChart
              centerValue={formatNumber(kpis.mentions, locale)}
              centerLabel={t.overview.mentions}
              data={platforms.map((p) => ({ name: t.platforms[p.platform], value: p.count, color: PLATFORM_COLORS[p.platform as Platform] }))}
            />
            <ul className="mt-4 space-y-2 text-sm">
              {platforms.map((p) => (
                <li key={p.platform} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><PlatformIcon platform={p.platform} size="sm" />{t.platforms[p.platform]}</span>
                  <span className="text-muted ltr-nums">{formatNumber(p.count, locale)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t.overview.topAuthors} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {authors.map((a) => (
                <li key={a.handle}>
                  <Link href={`/mentions?q=${encodeURIComponent(a.handle)}&days=${days}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                    <PlatformIcon platform={a.platform} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.name ?? a.handle}</div>
                      <div className="text-xs text-muted">
                        <span className="ltr-nums">{formatNumber(a.followers, locale)}</span> {t.overview.followers} · <span className="ltr-nums">{a.mentions}</span> {t.overview.mentions}
                      </div>
                    </div>
                    {a.avgSentiment !== null && (
                      <span className={`h-2.5 w-2.5 rounded-full ${a.avgSentiment > 0.15 ? "bg-pos" : a.avgSentiment < -0.15 ? "bg-neg" : "bg-neu"}`} />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t.overview.latest} actions={<Link href="/mentions" className="text-xs text-brand-700 hover:underline">{t.common.viewAll}</Link>} bodyClassName="space-y-3 p-3">
            {latest.map((m) => (
              <MentionCard key={m.id} m={m} t={t} locale={locale} topicLabels={topicLabels} />
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
