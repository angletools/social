import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CheckCircle2, ChevronLeft, Reply } from "lucide-react";
import type { Platform, Sentiment, SyncStatus } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, signed, timeAgo } from "@/lib/utils";
import { getKpis, getTopTopics } from "@/lib/analytics";
import { getMonitorEvents, getMonitorSeries } from "@/lib/monitor-analytics";
import { everyLabel, squares, topicTone } from "@/lib/monitor-stats";
import { PlatformIcon } from "@/components/platform";
import { SolidAvatar } from "@/components/avatar";
import { AutoRefresh } from "@/components/auto-refresh";
import { DotBar } from "@/components/dots";
import { IntentPill, SentimentDot, shortPlatform } from "@/components/mention-card";
import { MonitorStatus } from "@/components/monitor-ui";
import { MonitorVolumeChart } from "@/components/monitor-charts";
import { MonitorActions } from "./monitor-actions";

const RANGES = [7, 30, 90] as const;
const tint = (c: string, pct = 11) => ({ background: `color-mix(in srgb, ${c} ${pct}%, transparent)` });
const RUN_TONE: Record<SyncStatus, string> = { SUCCESS: "var(--color-pos)", FAILED: "var(--color-neg)", PARTIAL: "var(--color-warn)", RUNNING: "var(--color-info)" };
const TOPIC_COLOR = { neg: "var(--color-neg)", warn: "var(--color-warn)", pos: "var(--color-pos)", neutral: "var(--color-faint)" };
const SQUARE: Record<Sentiment, string> = {
  POSITIVE: "var(--color-pos)",
  NEUTRAL: "color-mix(in srgb, var(--color-faint) 50%, transparent)",
  NEGATIVE: "var(--color-neg)",
};

export default async function MonitorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const T = t.monitorsV2.detail;
  const { id } = await params;
  const sp = await searchParams;
  const days = (RANGES as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 7;
  const monitor = await db.monitor.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!monitor) notFound();

  const tz = user.organization.timezone;
  const scope = { orgId: user.organizationId, days, monitorId: id, tz };
  const [kpis, series, topics, mentions, runs, events] = await Promise.all([
    getKpis(scope),
    getMonitorSeries({ orgId: user.organizationId, monitorId: id, days, tz }),
    getTopTopics(scope, 5),
    db.mention.findMany({
      where: { monitorId: id, relevant: true, status: { not: "ARCHIVED" } },
      orderBy: { publishedAt: "desc" },
      take: 4,
    }),
    db.syncRun.findMany({ where: { monitorId: id }, orderBy: { startedAt: "desc" }, take: 6 }),
    getMonitorEvents({ orgId: user.organizationId, monitorId: id, since: new Date(Date.now() - days * 86400_000), tz }),
  ]);

  const active = monitor.status === "ACTIVE";
  const created = sp.created === "1";
  const waiting = created && (runs.length === 0 || runs.some((r) => r.status === "RUNNING"));
  const canAct = hasRole(user, "ANALYST");
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const prefix = monitor.type === "HASHTAG" ? "#" : monitor.type === "PROFILE" ? "@" : "";
  const maxTopic = Math.max(1, ...topics.map((x) => x.count));

  // Event marker: the latest alert for this monitor, otherwise the busiest bucket.
  const peak = series.points.reduce((a, p) => (p.total > a.total ? p : a), series.points[0] ?? { t: "", total: 0, negative: 0 });
  const event = events[0] ? { t: events[0].t, label: events[0].name } : peak && peak.total > 0 ? { t: peak.t, label: `${T.peak} · ${nf.format(peak.total)}` } : null;

  const sentCounts = { POSITIVE: kpis.positive, NEUTRAL: kpis.neutral, NEGATIVE: kpis.negative };
  const analysed = kpis.positive + kpis.neutral + kpis.negative;
  const sq = squares(sentCounts, 60);
  const cells = (["POSITIVE", "NEUTRAL", "NEGATIVE"] as Sentiment[]).flatMap((s) => Array<Sentiment>(sq[s]).fill(s));
  const pct = (n: number) => (analysed ? Math.round((n / analysed) * 100) : 0);

  // Local day for "Today 10:42" in the organization's timezone.
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400_000));
  const hhmm = (d: Date) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const runWhen = (d: Date) => {
    const k = dayKey(d);
    if (k === today) return fmt(T.today, { time: hhmm(d) });
    if (k === yesterday) return fmt(T.yesterday, { time: hhmm(d) });
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  };

  const kpiCards = [
    { label: t.overview.mentions, value: nf.format(kpis.mentions), delta: `${signed(kpis.deltas.mentions)}%`, bad: false },
    { label: t.sentiment.net, value: signed(kpis.netSentiment), delta: signed(kpis.deltas.netSentiment), bad: kpis.deltas.netSentiment < 0, good: kpis.deltas.netSentiment > 0 },
    { label: t.overview.reach, value: formatNumber(kpis.reach, locale), delta: `${signed(kpis.deltas.reach)}%`, bad: false },
    { label: t.overview.risks, value: nf.format(kpis.risks), delta: signed(kpis.risks - kpis.previousRisks), bad: kpis.risks > kpis.previousRisks, good: kpis.risks < kpis.previousRisks },
  ];

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-7">
      <AutoRefresh active={waiting || runs.some((r) => r.status === "RUNNING")} />
      <header className="flex flex-col gap-3.5">
        <Link href="/monitors" className="-ms-1 inline-flex items-center gap-1 self-start text-[14px] text-faint transition-colors hover:text-ink">
          <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" strokeWidth={1.8} /> {T.back}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-4">
          <h1 dir="auto" className="min-w-0 text-[24px] font-semibold leading-tight [overflow-wrap:anywhere] md:text-[28px]">{monitor.name}</h1>
          <MonitorStatus active={active} label={active ? t.common.active : t.common.paused} />
          <div className="flex flex-wrap items-center gap-2 lg:ms-auto">
            <nav aria-label={T.range} className="flex gap-0.5 rounded-xl bg-sunken p-[3px]">
              {RANGES.map((d) => (
                <Link
                  key={d}
                  href={d === 7 ? `/monitors/${id}` : `/monitors/${id}?days=${d}`}
                  prefetch={false}
                  scroll={false}
                  aria-current={d === days ? "page" : undefined}
                  className={cn("inline-flex h-[30px] items-center rounded-[9px] px-[13px] text-[13.5px] transition-colors", d === days ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink")}
                >
                  {t.common.range[String(d) as "7"]}
                </Link>
              ))}
            </nav>
            <span aria-hidden className="mx-1.5 h-5 w-px bg-line max-sm:hidden" />
            <MonitorActions
              id={id}
              active={active}
              canRefresh={canAct}
              canAdmin={hasRole(user, "ADMIN")}
              labels={{ pause: t.common.pause, resume: t.common.resume, refresh: t.common.refreshNow, edit: T.edit, delete: t.monitors.detail.deleteMonitor, confirm: t.common.confirmDelete }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-1.5 text-[14px] text-muted">
            {t.monitors.types[monitor.type]}
            {monitor.isCompetitor && <> · {t.monitors.competitor}</>}
            <span className="text-faint">
              {" · "}
              {active
                ? fmt(T.lastUpdated, { ago: monitor.lastSyncAt ? timeAgo(monitor.lastSyncAt, locale) : t.common.never })
                : fmt(t.monitorsV2.pausedAgo, { ago: timeAgo(monitor.pausedAt ?? monitor.updatedAt, locale) })}
            </span>
          </span>
          {monitor.platforms.map((p) => (
            <span key={p} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-surface px-2.5 text-[13px]">
              <PlatformIcon platform={p as Platform} size="xs" className="[&_svg]:fill-ink" />
              {shortPlatform(t.platforms[p])}
            </span>
          ))}
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          {monitor.terms.slice(0, 3).map((term) => (
            <span key={term} dir="auto" className="inline-flex h-7 max-w-60 items-center truncate rounded-lg bg-sunken px-2.5 text-[13px]">
              {prefix}
              {term}
            </span>
          ))}
          {monitor.terms.length > 3 && (
            <span dir="ltr" className="px-1 text-[13px] text-faint" title={monitor.terms.slice(3).map((x) => prefix + x).join(", ")}>
              +{monitor.terms.length - 3}
            </span>
          )}
        </div>
        {monitor.description && (
          <p dir="auto" className="max-w-3xl text-[14px] leading-relaxed text-muted">
            {monitor.description}
          </p>
        )}
      </header>

      {created && (
        <div role="status" className="-mt-2 flex items-center gap-3 rounded-[14px] px-[18px] py-3.5 text-[14.5px] text-pos" style={tint("var(--color-pos)", 9)}>
          <CheckCircle2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
          <span className="flex-1">{t.monitors.wizard.created}</span>
        </div>
      )}

      <section aria-label={t.overview.title} className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="flex flex-col gap-1.5 rounded-[20px] bg-surface px-5 py-[22px] sm:px-6">
            <span className="text-[13.5px] text-muted sm:text-[14.5px]">{k.label}</span>
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[26px] font-semibold tracking-[-0.02em] sm:text-[32px]">
                <span className="ltr-nums">{k.value}</span>
              </span>
              <span className={cn("text-[13.5px] font-semibold", k.bad ? "text-neg" : k.good ? "text-pos" : "text-muted")} title={t.monitorsV2.vsPrev}>
                <span className="ltr-nums">{k.delta}</span>
              </span>
            </span>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="rounded-[20px] bg-surface px-5 pb-4 pt-6 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-semibold">{T.volume}</h2>
            <span className="flex items-center gap-4 text-[13px] text-muted">
              <span className="inline-flex items-center gap-[7px]">
                <span className="h-2 w-2 rounded-full bg-chart" aria-hidden />
                {T.all}
              </span>
              <span className="inline-flex items-center gap-[7px]">
                <span className="w-3 border-t-[1.6px] border-muted" aria-hidden />
                {T.negative}
              </span>
            </span>
          </div>
          <div className="mt-4" role="img" aria-label={fmt(T.chartLabel, { days })}>
            <MonitorVolumeChart points={series.points} hours={series.hours} locale={locale} labels={{ all: T.all, negative: T.negative }} event={event} />
          </div>
        </div>

        <div className="flex flex-col rounded-[20px] bg-surface p-6">
          <h2 className="mb-[18px] text-[16px] font-semibold">{T.topics}</h2>
          {topics.length ? (
            <ul className="flex flex-1 flex-col justify-between gap-4">
              {topics.map((tp) => (
                <li key={tp.key}>
                  <Link prefetch={false} href={`/mentions?monitor=${id}&topic=${encodeURIComponent(tp.key)}&days=${days}`} className="group flex flex-col gap-2">
                    <span className="flex justify-between gap-3 text-[14.5px]">
                      <span className="truncate group-hover:underline group-hover:underline-offset-4">{locale === "ar" ? tp.labelAr : tp.labelEn}</span>
                      <span className="text-muted tnum">
                        <span className="ltr-nums">{nf.format(tp.count)}</span>
                      </span>
                    </span>
                    <DotBar max={maxTopic} segments={[{ value: tp.count, color: TOPIC_COLOR[topicTone(tp.count, tp.positive, tp.negative)] }]} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">{T.noTopics}</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="rounded-[20px] bg-surface px-5 pb-2 pt-6 sm:px-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-semibold">{T.latest}</h2>
            <Link prefetch={false} href={`/mentions?monitor=${id}`} className="text-[13.5px] text-muted hover:text-ink">
              {T.viewAll}
            </Link>
          </div>
          {mentions.length ? (
            <ul className="mt-2 flex flex-col">
              {mentions.map((m, i) => {
                const name = m.authorName ?? m.authorHandle ?? "?";
                return (
                  <li key={m.id} className={cn("grid grid-cols-[36px_minmax(0,1fr)] gap-x-3.5 py-4", i > 0 && "border-t border-line")}>
                    <SolidAvatar name={name} seed={m.authorHandle ?? name} size={36} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-[14.5px] leading-5">
                        <span dir="auto" className="min-w-0 truncate font-semibold">{name}</span>
                        {m.authorFollowers ? (
                          <span className="shrink-0 text-[13px] text-faint max-sm:hidden">{fmt(T.followers, { n: formatNumber(m.authorFollowers, locale) })}</span>
                        ) : null}
                        <span className="ms-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-faint">
                          <PlatformIcon platform={m.platform} size="xs" title={t.platforms[m.platform]} className="[&_svg]:fill-muted" />
                          {timeAgo(m.publishedAt, locale)}
                        </span>
                      </div>
                      <p dir="auto" className="mt-1.5 line-clamp-3 text-[15px] leading-[1.8] [overflow-wrap:anywhere]">{m.text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                        {m.sentiment && <SentimentDot sentiment={m.sentiment} label={t.sentiment[m.sentiment]} />}
                        {m.intent && m.intent !== "OTHER" && <IntentPill intent={m.intent} label={t.intents[m.intent]} />}
                        {m.dialect && m.dialect !== "OTHER" && <span className="text-faint">{t.dialects[m.dialect]}</span>}
                        {m.repliedAt ? (
                          <span className="ms-auto inline-flex h-7 items-center gap-1.5 px-2 text-[13.5px] text-faint">
                            <Check className="h-[15px] w-[15px]" strokeWidth={1.8} /> {t.mentionsV2.replied}
                          </span>
                        ) : canAct ? (
                          <Link prefetch={false} href={`/inbox?m=${m.id}`} className="-me-2 ms-auto inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-medium text-ink transition-colors hover:bg-sunken max-md:h-10">
                            <Reply className="h-[15px] w-[15px] rtl:-scale-x-100" strokeWidth={1.7} /> {t.engage.reply}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-10 text-center text-[14px] text-muted">{waiting ? T.waiting : T.noMentions}</p>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-[20px] bg-surface p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[16px] font-semibold">{T.sentiment}</h2>
              <span className="text-[13px] text-faint">
                <bdi>{fmt(T.mentionsN, { n: nf.format(kpis.mentions) })}</bdi>
              </span>
            </div>
            <div
              role="img"
              aria-label={fmt(T.sentimentLabel, { pos: `${pct(kpis.positive)}%`, neu: `${pct(kpis.neutral)}%`, neg: `${pct(kpis.negative)}%` })}
              className="mt-[18px] grid grid-flow-col grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-3 gap-[3px]"
            >
              {Array.from({ length: 60 }, (_, i) => (
                <span key={i} className="aspect-square rounded-[4px]" style={{ background: cells[i] ? SQUARE[cells[i]] : "var(--color-dot-track)" }} />
              ))}
            </div>
            <ul className="mt-[18px] grid grid-cols-3 gap-3">
              {(["POSITIVE", "NEUTRAL", "NEGATIVE"] as Sentiment[]).map((s) => (
                <li key={s} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-[13.5px] text-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SQUARE[s] }} aria-hidden />
                    {t.sentiment[s]}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[20px] font-semibold tnum">
                      <span className="ltr-nums">{pct(sentCounts[s])}%</span>
                    </span>
                    <span className="text-[12.5px] text-faint">
                      <span className="ltr-nums">{nf.format(sentCounts[s])}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 rounded-[20px] bg-surface px-6 pb-3 pt-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-semibold">{T.history}</h2>
              <span className="text-[13px] text-faint">{everyLabel(monitor.refreshMinutes, T.every)}</span>
            </div>
            {runs.length ? (
              <ul className="mt-2 flex flex-col">
                {runs.map((r, i) => (
                  <li key={r.id} className={cn("flex items-center gap-3 py-3", i > 0 && "border-t border-line")}>
                    <PlatformIcon platform={r.platform} size="sm" title={t.platforms[r.platform]} className="[&_svg]:fill-muted" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px]">
                        <bdi>{fmt(T.fetchedNew, { fetched: nf.format(r.itemsFetched), new: nf.format(r.itemsNew) })}</bdi>
                      </span>
                      <span className="text-[12.5px] text-faint">
                        {runWhen(r.startedAt)}
                        {r.source === "demo" && <span className="text-sand-700"> · {t.common.demoMode}</span>}
                      </span>
                      {r.error && (
                        <span className="break-words text-[12.5px] text-neg" dir="ltr">
                          {r.error}
                        </span>
                      )}
                    </span>
                    <span className="inline-flex h-6 shrink-0 items-center rounded-[7px] px-[9px] text-[12.5px] font-semibold" style={{ color: RUN_TONE[r.status], ...tint(RUN_TONE[r.status]) }}>
                      {t.monitors.detail.runStatus[r.status] ?? r.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[14px] text-muted">{t.monitors.detail.noRuns}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
