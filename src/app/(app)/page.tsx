import Link from "next/link";
import { ArrowLeft, ArrowRight, Radar, ShieldAlert } from "lucide-react";
import type { Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatDate, formatNumber, hourIn, timeAgo } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import {
  INBOX_INTENTS,
  getKpis,
  getPlatformBreakdown,
  getShareOfVoice,
  getTimeseries,
  getTopAuthors,
  getTopTopics,
  inboxPriority,
  parseDays,
} from "@/lib/analytics";
import { Card, EmptyState, KpiCard, Meter, PageHeader } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { ShareOfVoiceChart, VolumeChart } from "@/components/charts";
import { Donut } from "@/components/donut";
import { PLATFORM_COLORS, PlatformIcon } from "@/components/platform";
import { SentimentBar } from "@/components/sentiment";
import { Avatar } from "@/components/avatar";
import { IntentBadge } from "@/components/dialect-badges";
import { Onboarding } from "@/components/overview/onboarding";
import { BriefCard } from "./brief-card";
import type { ReportContent } from "@/lib/ai/report";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const orgId = user.organizationId;
  const org = user.organization;
  const tz = org.timezone;
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  const hour = hourIn(tz);
  const greeting = hour < 12 ? t.nav.greeting.morning : hour < 17 ? t.nav.greeting.afternoon : t.nav.greeting.evening;
  const firstName = user.name.split(/\s+/)[0];

  const [monitorCount, alertCount, memberCount, voiceCount] = await Promise.all([
    db.monitor.count({ where: { organizationId: orgId } }),
    db.alertRule.count({ where: { organizationId: orgId, enabled: true } }),
    db.user.count({ where: { organizationId: orgId, active: true } }),
    db.brandVoice.count({ where: { organizationId: orgId } }),
  ]);
  const steps = [
    { key: "context", done: Boolean(org.brandContext), ...t.onboarding.steps.context },
    { key: "monitor", done: monitorCount > 0, ...t.onboarding.steps.monitor },
    { key: "alert", done: alertCount > 0, ...t.onboarding.steps.alert },
    { key: "team", done: memberCount > 1, ...t.onboarding.steps.team },
    { key: "voice", done: voiceCount > 0, ...t.onboarding.steps.voice },
  ];
  const showOnboarding = !org.onboardingDoneAt && steps.some((s) => !s.done) && hasRole(user, "ADMIN");

  const header = (
    <PageHeader
      eyebrow={`${greeting}، ${firstName}`.replace("، ", locale === "ar" ? "، " : ", ")}
      title={t.overview.title}
      subtitle={formatDate(new Date(), locale, { dateStyle: "full" }, tz)}
      actions={monitorCount > 0 ? <RangeTabs days={days} labels={t.common.range} basePath="/" /> : undefined}
    />
  );

  if (monitorCount === 0) {
    return (
      <>
        {header}
        <div className="space-y-6">
          {showOnboarding && <Onboarding steps={steps} labels={t.onboarding} />}
          <EmptyState icon={<Radar className="h-5 w-5" />} title={t.overview.emptyTitle} body={t.overview.emptyBody} cta={{ href: "/monitors/new", label: t.overview.emptyCta }} />
        </div>
      </>
    );
  }

  const scope = { orgId, days, tz };
  const [kpis, series, platforms, topics, sov, authors, attentionPool, brief] = await Promise.all([
    getKpis(scope),
    getTimeseries(scope),
    getPlatformBreakdown(scope),
    getTopTopics(scope, 7),
    getShareOfVoice(scope),
    getTopAuthors(scope, 6),
    db.mention.findMany({
      where: {
        organizationId: orgId,
        relevant: true,
        repliedAt: null,
        status: { notIn: ["ARCHIVED", "REVIEWED"] },
        publishedAt: { gte: new Date(Date.now() - 3 * 86400_000) },
        OR: [{ intent: { in: INBOX_INTENTS } }, { isRisk: true }],
      },
      orderBy: { publishedAt: "desc" },
      take: 150,
    }),
    db.report.findFirst({ where: { organizationId: orgId, kind: "brief" }, orderBy: { createdAt: "desc" } }),
  ]);
  const attention = attentionPool
    .map((m) => ({ m, p: inboxPriority(m) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 4)
    .map((x) => x.m);
  const briefContent = brief?.content as ReportContent | null;
  const maxTopic = Math.max(1, ...topics.map((x) => x.count));
  const sentTotal = kpis.positive + kpis.neutral + kpis.negative;
  const pct = (n: number) => (sentTotal ? Math.round((n / sentTotal) * 100) : 0);
  const pts = series.points;

  return (
    <>
      {header}
      <div className="space-y-6">
        {showOnboarding && <Onboarding steps={steps} labels={t.onboarding} />}

        <BriefCard
          aiOn={aiEnabled()}
          brief={brief ? { status: brief.status, headline: briefContent?.headline, summary: briefContent?.summary, when: timeAgo(brief.createdAt, locale) } : null}
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
          <KpiCard
            label={t.overview.mentions}
            value={formatNumber(kpis.mentions, locale)}
            delta={kpis.deltas.mentions}
            vsLabel={t.overview.vsPrev}
            trend={pts.map((p) => p.total)}
            href={`/mentions?days=${days}`}
          />
          <KpiCard
            label={t.sentiment.net}
            value={`${kpis.netSentiment > 0 ? "+" : ""}${kpis.netSentiment}`}
            delta={kpis.deltas.netSentiment}
            deltaSuffix=""
            help={t.sentiment.help}
            vsLabel={t.overview.vsPrev}
            trend={pts.map((p) => p.net)}
            trendColor={kpis.netSentiment >= 0 ? "var(--color-pos)" : "var(--color-neg)"}
          />
          <KpiCard
            label={t.overview.engagement}
            value={formatNumber(kpis.engagement, locale)}
            delta={kpis.deltas.engagement}
            vsLabel={t.overview.vsPrev}
            trend={pts.map((p) => p.engagement)}
            trendColor="var(--color-sand-500)"
          />
          <KpiCard
            label={t.overview.risks}
            value={formatNumber(kpis.risks, locale)}
            delta={kpis.deltas.risks}
            invert
            vsLabel={t.overview.vsPrev}
            trend={pts.map((p) => p.risks)}
            trendColor="var(--color-neg)"
            href={`/mentions?risk=1&days=${days}`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={t.overview.volume} className="lg:col-span-2">
            <VolumeChart height={392} points={pts} unit={series.unit} locale={locale} labels={{ positive: t.sentiment.POSITIVE, neutral: t.sentiment.NEUTRAL, negative: t.sentiment.NEGATIVE }} />
          </Card>
          <Card
            title={t.inbox.title}
            description={t.inbox.subtitle}
            bodyClassName="p-0 pt-2"
            actions={
              <Link href="/inbox" className="btn-ghost btn-sm">
                {t.common.viewAll} <Arrow className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {attention.length === 0 ? (
              <p className="px-5 pb-6 pt-4 text-[13px] text-muted">{t.inbox.empty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {attention.map((m) => (
                  <li key={m.id}>
                    <Link prefetch={false} href={`/inbox?m=${m.id}`} className="flex gap-3 px-5 py-3 transition-colors hover:bg-canvas">
                      <Avatar name={m.authorName ?? m.authorHandle ?? "?"} seed={m.authorHandle ?? undefined} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="truncate font-medium">{m.authorName ?? m.authorHandle}</span>
                          <PlatformIcon platform={m.platform} size="xs" />
                          <span className="ms-auto shrink-0 text-faint">{timeAgo(m.publishedAt, locale)}</span>
                        </div>
                        <p dir="auto" className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink/85">
                          {m.text}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {m.isRisk && <ShieldAlert className="h-3.5 w-3.5 text-neg" />}
                          {m.intent && <IntentBadge intent={m.intent} label={t.intents[m.intent]} />}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Card
            title={t.overview.topTopics}
            actions={
              <Link href="/mentions" className="btn-ghost btn-sm">
                {t.common.viewAll} <Arrow className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {topics.length === 0 ? (
              <p className="text-[13px] text-muted">{t.common.noData}</p>
            ) : (
              <ul className="space-y-4">
                {topics.map((tp) => (
                  <li key={tp.key}>
                    <Link prefetch={false} href={`/mentions?topic=${tp.key}&days=${days}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5">
                      <span className="truncate text-[13.5px] font-medium group-hover:text-brand-700">{locale === "ar" ? tp.labelAr : tp.labelEn}</span>
                      <span className="text-xs text-muted ltr-nums">
                        {formatNumber(tp.count, locale)}
                        {tp.negative > 0 && <span className="ms-2 text-neg">{Math.round((tp.negative / tp.count) * 100)}% −</span>}
                      </span>
                      <div className="col-span-2" style={{ width: `${Math.max(10, (tp.count / maxTopic) * 100)}%` }}>
                        <SentimentBar pos={tp.positive} neg={tp.negative} neu={tp.count - tp.positive - tp.negative} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t.sentiment.label} help={t.sentiment.help}>
            <div className="grid items-center gap-6 sm:grid-cols-[180px_1fr]">
              <Donut
                center={`${kpis.netSentiment > 0 ? "+" : ""}${kpis.netSentiment}`}
                caption={t.sentiment.net}
                data={[
                  { name: t.sentiment.POSITIVE, value: kpis.positive, color: "#2e8b57" },
                  { name: t.sentiment.NEUTRAL, value: kpis.neutral, color: "#c9ccd1" },
                  { name: t.sentiment.NEGATIVE, value: kpis.negative, color: "#c8452f" },
                ]}
              />
              <ul className="space-y-3">
                {(["POSITIVE", "NEUTRAL", "NEGATIVE"] as const).map((s) => {
                  const v = s === "POSITIVE" ? kpis.positive : s === "NEUTRAL" ? kpis.neutral : kpis.negative;
                  return (
                    <li key={s}>
                      <Link prefetch={false} href={`/mentions?sentiment=${s}&days=${days}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-canvas">
                        <span className="flex items-center gap-2 text-[13px]">
                          <span className={`h-2 w-2 rounded-full ${s === "POSITIVE" ? "bg-pos" : s === "NEUTRAL" ? "bg-neu" : "bg-neg"}`} />
                          {t.sentiment[s]}
                        </span>
                        <span className="text-[13px] ltr-nums">
                          <b className="font-semibold">{pct(v)}%</b> <span className="text-faint">· {formatNumber(v, locale)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={t.overview.shareOfVoice} help={t.overview.shareOfVoiceHelp} className="lg:col-span-1">
            {sov.length === 0 ? (
              <p className="text-[13px] text-muted">{t.common.noData}</p>
            ) : (
              <>
                <ShareOfVoiceChart data={sov.map((s) => ({ name: s.name, share: s.share, isCompetitor: s.isCompetitor }))} />
                <ul className="mt-3 space-y-1.5 text-xs">
                  {sov.map((s) => (
                    <li key={s.monitorId} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted">
                        <span className={`h-2 w-2 rounded-full ${s.isCompetitor ? "bg-line-strong" : "bg-brand-600"}`} />
                        {s.name}
                      </span>
                      <span className={`font-medium ltr-nums ${s.netSentiment >= 0 ? "text-pos" : "text-neg"}`}>
                        {s.netSentiment > 0 ? "+" : ""}
                        {s.netSentiment}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <Card title={t.overview.byPlatform}>
            <ul className="space-y-3.5">
              {platforms.map((p) => (
                <li key={p.platform} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5">
                  <PlatformIcon platform={p.platform as Platform} size="sm" />
                  <span className="text-[13px]">{t.platforms[p.platform]}</span>
                  <span className="text-xs text-muted ltr-nums">{formatNumber(p.count, locale)}</span>
                  <div className="col-span-3">
                    <Meter value={p.count} max={platforms[0]?.count ?? 1} color={PLATFORM_COLORS[p.platform as Platform]} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t.overview.topAuthors} bodyClassName="p-0 pt-1">
            <ul>
              {authors.map((a) => (
                <li key={a.handle}>
                  <Link prefetch={false} href={`/mentions?q=${encodeURIComponent(a.handle)}&days=${days}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-canvas">
                    <Avatar name={a.name ?? a.handle} seed={a.handle} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                        {a.name ?? a.handle} <PlatformIcon platform={a.platform} size="xs" />
                      </div>
                      <div className="text-xs text-faint">
                        <span className="ltr-nums">{formatNumber(a.followers, locale)}</span> {t.overview.followers} · <span className="ltr-nums">{a.mentions}</span>
                      </div>
                    </div>
                    {a.avgSentiment !== null && (
                      <span className={`h-2 w-2 rounded-full ${a.avgSentiment > 0.15 ? "bg-pos" : a.avgSentiment < -0.15 ? "bg-neg" : "bg-neu"}`} />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
