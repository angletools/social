import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import type { Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, signed, timeAgo } from "@/lib/utils";
import { getMonitorsWeek } from "@/lib/monitor-analytics";
import { pauseIndex } from "@/lib/monitor-stats";
import { PlatformIcon } from "@/components/platform";
import { shortPlatform } from "@/components/mention-card";
import { MonitorStatus, MonitorTile, PlanMeter, SparkDefs, WeekSpark } from "@/components/monitor-ui";

const FILTERS = ["all", "active", "paused"] as const;
type Filter = (typeof FILTERS)[number];

/** Columns shared by the header row and each monitor row (desktop). */
const COLS = "lg:grid-cols-[44px_minmax(0,1fr)_112px_150px_96px_96px_92px_16px]";

export default async function MonitorsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const T = t.monitorsV2;
  const sp = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.status) ? (sp.status as Filter) : "all";
  const tz = user.organization.timezone;
  const [monitors, week] = await Promise.all([
    db.monitor.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ isCompetitor: "asc" }, { createdAt: "asc" }] }),
    getMonitorsWeek(user.organizationId, tz),
  ]);
  const counts = {
    all: monitors.length,
    active: monitors.filter((m) => m.status === "ACTIVE").length,
    paused: monitors.filter((m) => m.status === "PAUSED").length,
  };
  const list = monitors.filter((m) => filter === "all" || (filter === "active" ? m.status === "ACTIVE" : m.status === "PAUSED"));
  const canEdit = hasRole(user, "ADMIN");
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const limit = user.organization.monitorLimit;

  return (
    <div className="mx-auto max-w-[1180px]">
      <SparkDefs />
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-[24px] font-semibold leading-tight md:text-[28px]">{t.monitors.title}</h1>
        <div className="ms-auto flex items-center gap-4 max-sm:order-last max-sm:ms-0 max-sm:w-full">
          {monitors.length > 0 && (
            <nav aria-label={T.filterLabel} className="flex gap-0.5 rounded-xl bg-sunken p-[3px] max-sm:w-full">
              {FILTERS.map((f) => (
                <Link
                  key={f}
                  href={f === "all" ? "/monitors" : `/monitors?status=${f}`}
                  prefetch={false}
                  aria-current={filter === f ? "page" : undefined}
                  className={cn(
                    "inline-flex h-[34px] items-center justify-center gap-[7px] rounded-[9px] px-3.5 text-[13.5px] transition-colors max-sm:flex-1",
                    filter === f ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {T.filters[f]}
                  <span className="text-[12.5px] font-medium text-faint tnum">{nf.format(counts[f])}</span>
                </Link>
              ))}
            </nav>
          )}
        </div>
        {canEdit && (
          <Link href="/monitors/new" className="btn-primary h-10 ps-[18px] pe-4 text-[14px] font-semibold max-sm:ms-auto">
            <Plus className="h-4 w-4" strokeWidth={2} /> {t.monitors.new}
          </Link>
        )}
      </header>

      {list.length > 0 ? (
        <>
          <div aria-hidden className={cn("mt-8 hidden items-center gap-5 px-6 text-[13px] text-faint lg:grid", COLS)}>
            <span />
            <span>{T.cols.monitor}</span>
            <span>{T.cols.platforms}</span>
            <span>{T.cols.week}</span>
            <span>{T.cols.mentions}</span>
            <span>{T.cols.net}</span>
            <span>{T.cols.status}</span>
            <span />
          </div>
          <ul className="mt-6 flex flex-col gap-2 lg:mt-2.5">
            {list.map((m) => {
              const w = week.byMonitor.get(m.id);
              const values = w?.days.map((d) => d.n) ?? Array<number>(7).fill(0);
              const active = m.status === "ACTIVE";
              const stop = active ? null : (pauseIndex(week.days, m.pausedAt ?? m.updatedAt, tz) ?? 6);
              const total = w?.total ?? 0;
              const net = w?.net ?? 0;
              const prefix = m.type === "HASHTAG" ? "#" : m.type === "PROFILE" ? "@" : "";
              const delta = !active
                ? fmt(T.pausedAgo, { ago: timeAgo(m.pausedAt ?? m.updatedAt, locale) })
                : w?.change === null
                  ? T.isNew
                  : `${signed(w?.change ?? 0)}%`;
              return (
                <li key={m.id}>
                  <Link
                    href={`/monitors/${m.id}`}
                    aria-label={fmt(T.open, { name: m.name })}
                    className={cn(
                      "grid grid-cols-[44px_minmax(0,1fr)_16px] items-center gap-x-4 gap-y-4 rounded-[18px] bg-surface px-4 py-4 transition-colors hover:bg-panel sm:px-6 lg:gap-5 lg:py-[18px]",
                      COLS,
                    )}
                  >
                    <MonitorTile type={m.type} competitor={m.isCompetitor} />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span dir="auto" className="truncate text-[16px] font-semibold leading-[1.4]">{m.name}</span>
                      <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] leading-normal text-muted">
                        <span>{t.monitors.types[m.type]}</span>
                        {m.isCompetitor && (
                          <>
                            <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-faint" />
                            <span>{t.monitors.competitor}</span>
                          </>
                        )}
                        <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-faint" />
                        <span className="truncate text-faint">{m.lastSyncAt ? timeAgo(m.lastSyncAt, locale) : T.notYet}</span>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5 max-sm:hidden">
                        {m.terms.slice(0, 3).map((term) => (
                          <span key={term} dir="auto" className="inline-flex h-[26px] max-w-56 items-center truncate rounded-lg bg-canvas px-[9px] text-[13px]">
                            {prefix}
                            {term}
                          </span>
                        ))}
                        {m.terms.length > 3 && (
                          <span dir="ltr" className="inline-flex h-[26px] items-center px-1 text-[13px] text-faint">
                            +{m.terms.length - 3}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 text-faint rtl:-scale-x-100 max-lg:col-start-3 max-lg:row-start-1 lg:order-last" strokeWidth={1.8} />

                    <span className="col-span-3 flex items-center gap-x-4 sm:gap-x-5 lg:contents">
                      <span className="flex items-center gap-2.5 max-lg:hidden">
                        {m.platforms.map((p) => (
                          <PlatformIcon key={p} platform={p as Platform} size="sm" title={shortPlatform(t.platforms[p])} className="[&_svg]:fill-muted" />
                        ))}
                      </span>
                      <WeekSpark values={values} pausedAt={stop} label={fmt(T.sparkLabel, { n: nf.format(total) })} className="max-lg:w-[104px] sm:max-lg:w-[150px]" />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[17px] font-semibold leading-tight tnum">
                          <span className="ltr-nums">{nf.format(total)}</span>
                        </span>
                        <span className="whitespace-nowrap text-[12.5px] font-medium text-faint" title={active ? T.vsPrev : undefined}>
                          <bdi>{delta}</bdi>
                        </span>
                      </span>
                      <span
                        title={t.sentiment.net}
                        className={cn("text-[17px] font-semibold tnum", w?.analysed ? (net <= -5 ? "text-neg" : net >= 5 ? "text-pos" : "text-ink") : "text-faint")}
                      >
                        <span className="ltr-nums">{w?.analysed ? signed(net) : "0"}</span>
                      </span>
                      <span className="max-lg:ms-auto">
                        <MonitorStatus active={active} label={active ? t.common.active : t.common.paused} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex items-center gap-3.5 px-6 text-[13.5px] text-faint max-sm:px-1">
            <PlanMeter used={counts.all} limit={limit} />
            <span>
              {fmt(T.plan, { used: nf.format(counts.all), limit: nf.format(limit) })}
              {counts.all >= limit && <> · {T.planFull}</>}
            </span>
          </div>
        </>
      ) : (
        <div className="mt-8 flex flex-col items-center rounded-[20px] bg-surface px-6 py-20 text-center">
          <MonitorTile type="KEYWORD" size={48} />
          <h2 className="mt-5 text-[18px] font-semibold">
            {monitors.length === 0 ? t.overview.emptyTitle : filter === "paused" ? T.emptyPaused.title : T.emptyActive.title}
          </h2>
          <p className="mt-2 max-w-[460px] text-[15px] leading-relaxed text-muted">
            {monitors.length === 0 ? t.overview.emptyBody : filter === "paused" ? T.emptyPaused.body : T.emptyActive.body}
          </p>
          {monitors.length === 0 && canEdit && (
            <Link href="/monitors/new" className="btn-primary mt-[22px] h-10 px-[18px] text-[14px] font-semibold">
              {t.overview.emptyCta}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
