import Link from "next/link";
import { Radar } from "lucide-react";
import type { Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatDate, formatNumber, hourIn, timeAgo, timeShort } from "@/lib/utils";
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
import { getChurnSignals, getTrendingFormat } from "@/lib/home";
import { arrowPct, bucketize, extremes, signedInt, slotLabel } from "@/lib/insight";
import { EmptyState } from "@/components/ui";
import { MentionsChart } from "@/components/app-charts";
import { sovColors } from "@/components/chart-colors";
import { PlatformIcon } from "@/components/platform";
import { DotBar } from "@/components/dots";
import { Avatar } from "@/components/avatar";
import { Onboarding } from "@/components/overview/onboarding";
import { DotSpark, LegendRow, LineSpark, NotchGauge, Panel, PanelHead, RangeSegmented, Rings, richFmt } from "@/components/insight-ui";
import { RangeSelect } from "@/components/range-select";
import { BriefCard } from "./brief-card";
import type { ReportContent } from "@/lib/ai/report";

const MOMENTUM_TONE: Record<string, string> = { RISING: "text-pos", NEW: "text-info", PEAKING: "text-warn", FADING: "text-faint" };
const MOMENTUM_COLOR: Record<string, string> = { RISING: "var(--color-pos)", NEW: "var(--color-info)", PEAKING: "var(--color-warn)", FADING: "var(--color-faint)" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const H = t.home2;
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const orgId = user.organizationId;
  const org = user.organization;
  const tz = org.timezone;
  const ar = locale === "ar";

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
    <header className="flex items-end justify-between gap-5">
      <div className="min-w-0">
        <div className="text-[13px] text-faint md:text-sm">{formatDate(new Date(), locale, { dateStyle: undefined, weekday: "long", day: "numeric", month: "long" }, tz)}</div>
        <h1 className="mt-0.5 text-[26px] font-semibold leading-tight md:mt-1 md:text-[30px]">{`${greeting}${ar ? "، " : ", "}${firstName}`}</h1>
      </div>
      {monitorCount > 0 && (
        <div className="hidden shrink-0 md:block">
          <RangeSegmented days={days} labels={t.common.range} basePath="/" label={H.period2} />
        </div>
      )}
    </header>
  );

  if (monitorCount === 0) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        {showOnboarding && <Onboarding steps={steps} labels={t.onboarding} />}
        <EmptyState icon={<Radar className="h-5 w-5" />} title={t.overview.emptyTitle} body={t.overview.emptyBody} cta={{ href: "/monitors/new", label: t.overview.emptyCta }} />
      </div>
    );
  }

  const scope = { orgId, days, tz };
  const unit = days <= 7 ? "hour" : "day";
  const [kpis, series, platforms, topics, sov, authors, attentionPool, brief, waiting, churn, trend] = await Promise.all([
    getKpis(scope),
    getTimeseries(scope, { unit }),
    getPlatformBreakdown(scope),
    getTopTopics(scope, 5),
    getShareOfVoice(scope),
    getTopAuthors(scope, 5),
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
    db.mention.count({
      where: {
        organizationId: orgId,
        relevant: true,
        repliedAt: null,
        status: { not: "ARCHIVED" },
        publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        OR: [{ intent: { in: INBOX_INTENTS } }, { isRisk: true }],
      },
    }),
    getChurnSignals(scope),
    getTrendingFormat(orgId),
  ]);
  const attention = attentionPool
    .map((m) => ({ m, p: inboxPriority(m) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map((x) => x.m);
  const briefContent = brief?.content as ReportContent | null;
  const pts = series.points;
  const comparable = kpis.previousMentions > 0;
  const ext = extremes(pts);
  const sovColor = sovColors(sov);
  const rangeLabel = t.common.range[String(days) as keyof typeof t.common.range];
  const label = (x: { labelAr: string; labelEn: string }) => (ar ? x.labelAr : x.labelEn);

  // The one sentence: how much conversation moved, and what it is mostly about.
  const d = kpis.deltas.mentions;
  const change = !comparable || Math.abs(d) < 3 ? t.overview.steady : fmt(d > 0 ? t.overview.up : t.overview.down, { n: formatNumber(Math.abs(d), locale) });
  const topTopic = topics[0] ? label(topics[0]) : null;
  const topicText = topTopic && !ar && /^[A-Z][a-z]/.test(topTopic) ? topTopic[0].toLowerCase() + topTopic.slice(1) : topTopic;
  const fallback = richFmt(topicText ? H.brief : H.briefNoTopic, {
    change: <span className="font-semibold text-ink">{change}</span>,
    topic: topicText,
  });
  const waitingLine =
    waiting > 0
      ? richFmt(t.overview.waitingLine, {
          n: (
            <Link href="/inbox" className="font-semibold text-ink underline decoration-1 underline-offset-[5px]">
              {fmt(t.overview.people, { n: formatNumber(waiting, locale) })}
            </Link>
          ),
        })
      : null;

  // Delta colours carry meaning: more conversation while sentiment is negative is not good news.
  const tone = (v: number, good: "up" | "down") => (v === 0 ? "text-faint" : (v > 0) === (good === "up") ? "text-pos" : "text-neg");
  const spark = (key: "total" | "engagement" | "reach" | "risks") => bucketize(pts.map((p) => p[key]), 12);
  const kpiTiles = [
    { key: "m", label: t.overview.mentions, value: kpis.mentions, delta: d, tone: d > 0 && kpis.netSentiment < 0 ? "text-neg" : d > 0 ? "text-pos" : "text-faint", spark: spark("total"), href: `/mentions?days=${days}` },
    { key: "e", label: t.overview.engagement, value: kpis.engagement, delta: kpis.deltas.engagement, tone: tone(kpis.deltas.engagement, "up"), spark: spark("engagement"), href: `/mentions?days=${days}` },
    { key: "r", label: t.overview.reach, value: kpis.reach, delta: kpis.deltas.reach, tone: tone(kpis.deltas.reach, "up"), spark: spark("reach"), href: `/mentions?days=${days}` },
    { key: "k", label: t.overview.risks, value: kpis.risks, delta: kpis.deltas.risks, tone: tone(kpis.deltas.risks, "down"), spark: spark("risks"), href: `/mentions?risk=1&days=${days}` },
  ];

  // Arabic compact numbers ("71.4 مليون") are wide: drop the sparklines for the whole row rather than squeeze one.
  const sparkFits = kpiTiles.every((k) => formatNumber(k.value, locale).length <= 6);
  const netDelta = kpis.deltas.netSentiment;
  const gaugeSub = comparable ? fmt(H.ptsPeriod, { n: signedInt(netDelta), period: H.period[String(days) as keyof typeof H.period] }) : undefined;
  const churnDelta = churn.prev > 0 ? churn.count - churn.prev : null;
  const maxTopic = Math.max(1, ...topics.map((x) => x.count));
  const maxPlatform = Math.max(1, ...platforms.map((p) => p.count));
  const surfaces = (ps: Platform[]) => ps.map((p) => t.studio2.surfaces[p]).join(ar ? "، " : ", ");

  return (
    <div className="flex flex-col gap-3.5 md:gap-8">
      {header}
      {showOnboarding && <Onboarding steps={steps} labels={t.onboarding} />}

      <BriefCard
        aiOn={aiEnabled()}
        fallback={fallback}
        after={waitingLine}
        brief={brief ? { status: brief.status, headline: briefContent?.headline, summary: briefContent?.summary, when: timeAgo(brief.createdAt, locale) } : null}
        labels={{ title: t.overview.generateBrief, generate: t.overview.refreshBrief, generating: t.reports.generating, failed: t.reports.failed }}
      />

      {/* On phones the rows dissolve (display: contents) and `order` sets the phone sequence. */}
      <div className="flex flex-wrap gap-3 md:flex-col md:flex-nowrap md:gap-8">
        <section aria-label={t.overview.mentions} className="order-5 grid w-full grid-cols-2 gap-3 md:order-none md:gap-5 lg:grid-cols-4">
          {kpiTiles.map((k) => (
            <Link
              key={k.key}
              href={k.href}
              prefetch={false}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-[20px] bg-surface px-[18px] py-4 transition-colors duration-150 hover:bg-surface/70 md:px-6 md:py-5"
            >
              <span className="col-span-2 truncate text-[13.5px] text-muted md:text-[14px]">{k.label}</span>
              <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
                <KpiValue text={formatNumber(k.value, locale)} />
                {comparable && <span className={cn("text-[12.5px] font-semibold ltr-nums md:text-[13px]", k.tone)}>{arrowPct(k.delta)}</span>}
              </span>
              {sparkFits && <LineSpark values={k.spark} className="hidden xl:block" />}
            </Link>
          ))}
        </section>

        <div className="contents md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:gap-5">
          <Panel className="order-1 flex w-full flex-col md:order-none md:w-auto">
            <div className="hidden items-baseline justify-between md:flex">
              <h2 className="text-[15px] text-muted">{t.overview.volume}</h2>
              <span className="text-[13px] text-faint">{rangeLabel}</span>
            </div>
            <div className="flex items-baseline gap-2 md:hidden">
              <span className="text-[34px] font-semibold leading-none tracking-[-0.02em] ltr-nums">{formatNumber(kpis.mentions, locale)}</span>
              {comparable && <span className={cn("text-[13px] font-semibold ltr-nums", kpiTiles[0].tone)}>{arrowPct(d)}</span>}
              <RangeSelect days={days} labels={t.common.range} basePath="/" label={H.period2} className="ms-auto" />
            </div>
            <div className="mb-4 mt-2.5 hidden md:block">
              <MentionsChart
                points={pts}
                unit={series.unit}
                locale={locale}
                height={196}
                ariaLabel={`${t.overview.volume}, ${rangeLabel}`}
                labels={{ total: t.overview.mentions, positive: t.sentiment.POSITIVE, neutral: t.sentiment.NEUTRAL, negative: t.sentiment.NEGATIVE }}
              />
            </div>
            <div className="mt-1.5 md:hidden">
              <MentionsChart
                points={pts}
                unit={series.unit}
                locale={locale}
                height={92}
                compact
                ariaLabel={`${t.overview.volume}, ${rangeLabel}`}
                labels={{ total: t.overview.mentions, positive: t.sentiment.POSITIVE, neutral: t.sentiment.NEUTRAL, negative: t.sentiment.NEGATIVE }}
              />
            </div>
            {ext && (
              <div className="mt-auto hidden flex-wrap gap-x-8 gap-y-1 border-t border-line pt-4 text-[13.5px] text-muted md:flex">
                <span>
                  {H.busiest} <span className="font-semibold text-ink">{slotLabel(ext.busiest.t, series.unit, locale)}</span> · <span className="ltr-nums">{fmt(H.mentionsN, { n: formatNumber(ext.busiest.total, locale) })}</span>
                </span>
                <span>
                  {H.quietest} <span className="font-semibold text-ink">{slotLabel(ext.quietest.t, series.unit, locale)}</span>
                </span>
              </div>
            )}
          </Panel>

          <Panel aria-label={H.needsYou} className="order-4 flex w-full flex-col py-2 md:order-none md:w-auto md:py-6">
            <PanelHead
              className="hidden md:flex"
              title={H.needsYou}
              aside={
                <Link href="/inbox" className="text-[13.5px] text-brand-600 transition-colors hover:text-ink">
                  {H.openInbox}
                </Link>
              }
            />
            {attention.length === 0 ? (
              <p className="py-3 text-[14px] text-muted md:pt-4">{H.allClear}</p>
            ) : (
              <ul className="md:mt-3">
                {attention.map((m, i) => (
                  <li key={m.id} className={cn(i > 0 && "border-t border-line")}>
                    <Link prefetch={false} href={`/inbox?m=${m.id}`} className="group flex gap-3 py-3 md:py-3.5">
                      <span className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full md:mt-2", m.isRisk || m.intent === "CHURN_RISK" ? "bg-neg" : m.intent === "COMPLAINT" ? "bg-warn" : m.intent === "QUESTION" ? "bg-info" : "bg-faint")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium md:text-[14.5px]">
                          <span dir="auto" className="truncate group-hover:underline group-hover:decoration-line group-hover:underline-offset-4">
                            {m.authorName ?? m.authorHandle}
                          </span>
                          <span className="shrink-0 text-[12px] font-normal text-faint md:text-[12.5px]">{timeShort(m.publishedAt, locale)}</span>
                        </span>
                        <span dir="auto" className="mt-0.5 block truncate text-[13px] leading-relaxed text-muted md:mt-1 md:text-[14px]">
                          {m.text}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="contents md:grid md:grid-cols-3 md:gap-5">
          <Link
            href={`/intelligence?days=${days}`}
            prefetch={false}
            className="order-2 flex w-[calc(50%-6px)] flex-col gap-2.5 rounded-[20px] bg-surface px-[18px] py-4 transition-colors duration-150 hover:bg-surface/70 md:order-none md:w-auto md:gap-3.5 md:p-6"
          >
            <span className="text-[13.5px] text-muted md:text-[15px]">
              <span className="md:hidden">{H.sentiment}</span>
              <span className="hidden md:inline">{t.sentiment.net}</span>
            </span>
            <div className="md:hidden">
              <NotchGauge net={kpis.netSentiment} compact mirror={ar} label={fmt(H.scaleLabel, { net: signedInt(kpis.netSentiment) })} />
            </div>
            <div className="hidden md:block">
              <NotchGauge
                net={kpis.netSentiment}
                mirror={ar}
                sub={gaugeSub}
                subTone={netDelta > 0 ? "pos" : netDelta < 0 ? "neg" : "faint"}
                ends={["−100", "+100"]}
                label={fmt(H.scaleLabel, { net: signedInt(kpis.netSentiment) })}
              />
            </div>
          </Link>

          <Link
            href={`/mentions?intent=CHURN_RISK&days=${days}`}
            prefetch={false}
            className="order-3 flex w-[calc(50%-6px)] flex-col gap-2.5 rounded-[20px] bg-surface px-[18px] py-4 md:hidden"
          >
            <span className="text-[13.5px] text-muted">{H.churn}</span>
            <span className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-none ltr-nums">{formatNumber(churn.count, locale)}</span>
              {churnDelta !== null && churnDelta !== 0 && <span className={cn("text-[12.5px] font-semibold ltr-nums", churnDelta > 0 ? "text-neg" : "text-pos")}>{signedInt(churnDelta)}</span>}
            </span>
            {churn.tracksCompetitors && churn.namedCompetitor > 0 && <span className="text-[12.5px] text-faint">{fmt(H.namedCompetitor, { n: formatNumber(churn.namedCompetitor, locale) })}</span>}
          </Link>

          <Panel className="order-6 flex w-full flex-col gap-3.5 md:order-none md:w-auto">
            <PanelHead title={t.overview.shareOfVoice} />
            {sov.length === 0 ? (
              <p className="text-[13px] text-muted">{t.common.noData}</p>
            ) : (
              <div className="flex flex-1 items-center gap-5 md:gap-[22px]">
                <Rings label={t.overview.shareOfVoice} items={sov.slice(0, 4).map((s, i) => ({ label: s.name, value: s.share, color: sovColor[i] }))} />
                <ul className="flex min-w-0 flex-1 flex-col gap-3 text-[14px]">
                  {sov.slice(0, 4).map((s, i) => (
                    <li key={s.monitorId}>
                      <LegendRow color={sovColor[i]} label={s.name} value={`${Math.round(s.share)}%`} strong={!s.isCompetitor} href={`/monitors/${s.monitorId}?days=${days}`} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          {trend ? (
            <Link
              href={`/studio?f=${trend.id}`}
              prefetch={false}
              className="order-7 flex w-full flex-col gap-2.5 rounded-[20px] bg-surface p-5 transition-colors duration-150 hover:bg-surface/70 md:order-none md:w-auto md:p-6"
            >
              <span className="flex items-baseline justify-between gap-3 text-[15px] text-muted">
                <span>{H.trending}</span>
                <span className={cn("text-[13.5px] font-semibold", MOMENTUM_TONE[trend.momentum])}>{t.studio.momentum[trend.momentum as keyof typeof t.studio.momentum]}</span>
              </span>
              <span dir="auto" className="text-[19px] font-semibold leading-[1.35]">
                {ar ? trend.nameAr : trend.nameEn}
              </span>
              <div className="mt-auto pt-2">
                <DotSpark id={`trend-${trend.id}`} values={trend.views} width={300} height={60} color={trend.momentum === "FADING" ? MOMENTUM_COLOR.FADING : "var(--color-chart)"} />
              </div>
              <span className="text-[13.5px] text-faint">{fmt(H.viewsOn, { views: formatNumber(trend.totalViews, locale), platforms: surfaces(trend.platforms) })}</span>
            </Link>
          ) : (
            <Panel className="order-7 flex w-full flex-col gap-2.5 md:order-none md:w-auto">
              <PanelHead title={H.trending} />
              <p className="text-[14px] leading-relaxed text-muted">{H.noTrend}</p>
              <Link href="/studio" className="mt-auto text-[13.5px] text-brand-600 hover:text-ink">
                {H.openStudio}
              </Link>
            </Panel>
          )}
        </div>

        <div className="contents md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-5">
          <Panel className="order-8 flex w-full flex-col gap-4 md:order-none md:w-auto">
            <PanelHead
              title={t.overview.topTopics}
              aside={
                <Link href={`/mentions?days=${days}`} className="text-[13.5px] text-ink transition-colors hover:text-muted">
                  {t.common.viewAll}
                </Link>
              }
            />
            {topics.length === 0 ? (
              <p className="text-[13px] text-muted">{t.common.noData}</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {topics.map((tp) => {
                  const negPct = tp.count ? Math.round((tp.negative / tp.count) * 100) : 0;
                  return (
                    <li key={tp.key}>
                      <Link prefetch={false} href={`/mentions?topic=${tp.key}&days=${days}`} className="group flex flex-col gap-[7px]">
                        <span className="flex items-baseline justify-between gap-3 text-[14px]">
                          <span className="truncate group-hover:text-muted">{label(tp)}</span>
                          <span className="shrink-0 text-muted ltr-nums">
                            {formatNumber(tp.count, locale)}
                            <span className={cn("ms-2.5", negPct > 50 ? "text-neg" : "text-faint")}>{fmt(H.neg, { n: negPct })}</span>
                          </span>
                        </span>
                        <DotBar
                          max={maxTopic}
                          segments={[
                            { value: tp.count - tp.negative, color: "var(--color-pos)" },
                            { value: tp.negative, color: "var(--color-neg)" },
                          ]}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel className="order-9 flex w-full flex-col gap-4 md:order-none md:w-auto">
            <PanelHead title={t.overview.byPlatform} />
            <ul className="flex flex-col gap-4">
              {platforms.map((p) => (
                <li key={p.platform}>
                  <Link prefetch={false} href={`/mentions?platform=${p.platform}&days=${days}`} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
                    <PlatformIcon platform={p.platform as Platform} size="md" className="justify-self-center [&_svg]:fill-ink" />
                    <span className="truncate text-[14px]">{t.platforms[p.platform as Platform]}</span>
                    <span className="text-end text-[13.5px] text-muted ltr-nums">{formatNumber(p.count, locale)}</span>
                    <div className="col-start-2 col-end-4">
                      <DotBar max={maxPlatform} segments={[{ value: p.count, color: "var(--color-chart)" }]} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="order-10 flex w-full flex-col gap-3 md:order-none md:w-auto">
            <PanelHead title={t.overview.topAuthors} />
            <ul>
              {authors.map((a, i) => (
                <li key={a.handle} className={cn(i > 0 && "border-t border-line")}>
                  <Link prefetch={false} href={`/mentions?q=${encodeURIComponent(a.handle)}&days=${days}`} className="group flex items-center gap-3 py-2.5">
                    <Avatar name={a.name ?? a.handle} seed={a.handle} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span dir="auto" className="truncate text-[14px] font-medium group-hover:underline group-hover:decoration-line group-hover:underline-offset-4">
                        {a.name ?? a.handle}
                      </span>
                      <span className="truncate text-[12.5px] text-faint ltr-nums">
                        {fmt(H.followersPosts, { followers: formatNumber(a.followers, locale), posts: formatNumber(a.mentions, locale) })}
                      </span>
                    </span>
                    {a.avgSentiment !== null && (
                      <span
                        className={cn("h-2 w-2 shrink-0 rounded-full", a.avgSentiment > 0.15 ? "bg-pos" : a.avgSentiment < -0.15 ? "bg-neg" : "bg-faint")}
                        title={a.avgSentiment > 0.15 ? t.sentiment.POSITIVE : a.avgSentiment < -0.15 ? t.sentiment.NEGATIVE : t.sentiment.NEUTRAL}
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** A KPI number; a spelled-out unit ("71.4 مليون") is set smaller so the figure leads. */
function KpiValue({ text }: { text: string }) {
  const m = /^([\d.,]+)\s+(\D+)$/.exec(text);
  return (
    <span className="text-[24px] font-semibold leading-none tracking-[-0.02em] md:text-[28px]">
      <span className="ltr-nums">{m ? m[1] : text}</span>
      {m && <span className="ms-1 text-[15px] font-medium text-muted md:text-[16px]">{m[2]}</span>}
    </span>
  );
}
