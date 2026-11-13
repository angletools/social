import { DeliveryStatus } from "@/components/delivery-status";
import Link from "next/link";
import { CalendarDays, ChevronRight, FileText } from "lucide-react";
import type { ReportStatus } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/ui";
import { ReportForm, RetryButton, WeeklyCard } from "./report-form";

const FILTERS = ["all", "weekly", "custom"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_TONE: Record<ReportStatus, string> = {
  READY: "var(--color-pos)",
  GENERATING: "var(--color-warn)",
  FAILED: "var(--color-neg)",
};

/** "12 Oct – 11 Nov", "1 – 7 Nov": a compact period in the org timezone. */
function periodLabel(start: Date, end: Date, locale: string, timeZone: string) {
  const f = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
    ...(start.getFullYear() !== end.getFullYear() && { year: "numeric" }),
  });
  return f.formatRange(start, end);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const tp = t.reportsPage;
  const tz = user.organization.timezone;
  const { show } = await searchParams;
  const filter: Filter = FILTERS.includes(show as Filter) ? (show as Filter) : "all";
  const [reports, monitors, total] = await Promise.all([
    db.report.findMany({
      where: { organizationId: user.organizationId, kind: "report", ...(filter !== "all" && { weekly: filter === "weekly" }) },
      include: { monitor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    db.monitor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: [{ isCompetitor: "asc" }, { createdAt: "asc" }] }),
    db.report.count({ where: { organizationId: user.organizationId, kind: "report" } }),
  ]);
  const org = user.organization;
  const canCreate = hasRole(user, "ANALYST");
  const isAdmin = hasRole(user, "ADMIN");
  const langName = (l: string) => (l === "ar" ? (locale === "ar" ? "العربية" : "Arabic") : locale === "ar" ? "الإنجليزية" : "English");
  const writing = reports.some((r) => r.status === "GENERATING");
  const cols = "grid-cols-[40px_minmax(0,1fr)_auto] sm:grid-cols-[40px_minmax(0,1fr)_150px_104px_16px]";

  return (
    <>
      <AutoRefresh active={writing} every={5000} maxMs={300_000} />
      <PageHeader
        title={t.reports.title}
        actions={
          <nav aria-label={tp.filterLabel} className="flex gap-0.5 rounded-[12px] bg-sunken p-[3px]">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={f === "all" ? "/reports" : `/reports?show=${f}`}
                aria-current={filter === f ? "page" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex h-8 items-center rounded-[9px] px-3.5 text-[13.5px] whitespace-nowrap transition-colors duration-150",
                  filter === f ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink",
                )}
              >
                {tp.filters[f]}
              </Link>
            ))}
          </nav>
        }
      />

      <section className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card flex flex-col p-2 sm:p-3">
          {reports.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
              <span className="text-[16px] font-semibold">{total === 0 ? tp.empty : tp.emptyFiltered}</span>
              {total === 0 && <span className="text-[14.5px] text-muted">{tp.emptyBody}</span>}
            </div>
          ) : (
            <>
              <div className={cn("hidden gap-4 px-3 pt-3 pb-2.5 text-[12.5px] text-faint sm:grid", cols)}>
                <span />
                <span>{tp.cols.report}</span>
                <span>{tp.cols.period}</span>
                <span>{tp.cols.status}</span>
                <span />
              </div>
              <ul className="flex flex-col">
                {reports.map((r, i) => {
                  const Icon = r.weekly ? CalendarDays : FileText;
                  const scope = r.monitor?.name ?? t.reports.allMonitors;
                  const meta = r.weekly ? `${scope} · ${langName(r.locale)}` : `${tp.custom} · ${scope} · ${langName(r.locale)}`;
                  const period = periodLabel(r.periodStart, r.periodEnd, locale, tz);
                  const tone = STATUS_TONE[r.status];
                  return (
                    <li key={r.id} className={cn(i > 0 && "border-t border-sunken")}>
                      <div className={cn("group relative grid min-h-[68px] items-center gap-4 rounded-[12px] px-3 py-2.5 transition-colors duration-150 hover:bg-selected", cols)}>
                        <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sunken">
                          <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-[3px]">
                          <Link
                            href={`/reports/${r.id}`}
                            prefetch={false}
                            dir="auto"
                            className="truncate text-[15px] leading-[1.45] font-semibold after:absolute after:inset-0 after:rounded-[12px] after:content-['']"
                          >
                            {r.weekly ? tp.weeklyTitle : r.title}
                          </Link>
                          <span className="truncate text-[13px] text-muted" dir="auto">{meta}</span>
                          <span className="text-[13px] text-muted tnum sm:hidden">{period}</span>
                        </span>
                        <span className="hidden text-[13.5px] whitespace-nowrap text-muted tnum sm:block">{period}</span>
                        <span className="flex flex-col items-end gap-[3px] sm:items-start">
                          <span
                            className="inline-flex h-[26px] items-center gap-[7px] rounded-[8px] px-2.5 text-[12.5px] font-semibold whitespace-nowrap"
                            style={{ color: tone, background: `color-mix(in srgb, ${tone} 11%, transparent)` }}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full bg-current", r.status === "GENERATING" && "animate-pulse")} />
                            {tp.status[r.status]}
                          </span>
                          {r.status === "GENERATING" && <span className="ps-0.5 text-[12.5px] whitespace-nowrap text-faint">{tp.aboutMinute}</span>}
                          {r.status === "FAILED" && (r.weekly ? isAdmin : canCreate) && <RetryButton id={r.id} label={tp.retry} />}
                        </span>
                        <ChevronRight aria-hidden className="hidden h-4 w-4 text-faint sm:block rtl:rotate-180" strokeWidth={1.8} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {(canCreate || isAdmin) && (
          <div className="flex flex-col gap-5">
            {canCreate && (
              <ReportForm
                monitors={monitors}
                locale={locale}
                aiOff={!aiEnabled() ? t.assistant.disabled : null}
                ranges={t.common.range}
                labels={{ title: tp.newReport, period: tp.period, covering: tp.covering, all: t.reports.allMonitors, language: tp.language, submit: tp.generate }}
              />
            )}
            {isAdmin && (
              <WeeklyCard
                enabled={org.weeklyReportEnabled}
                day={org.weeklyReportDay}
                locale={org.weeklyReportLocale}
                recipients={org.weeklyReportRecipients}
                lastSent={
                  org.weeklyReportLastSentAt
                    ? fmt(tp.weekly.lastSent, {
                        when: formatDate(org.weeklyReportLastSentAt, locale, { dateStyle: undefined, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }, tz),
                      })
                    : tp.weekly.notSent
                }
                days={t.weekly.days}
                labels={{ ...tp.weekly, language: tp.language, saved: t.common.saved }}
              />
            )}
          </div>
        )}
      </section>
      <DeliveryStatus orgId={user.organizationId} weekly canRetry={isAdmin} />
    </>
  );
}
