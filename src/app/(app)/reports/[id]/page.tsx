import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dictFor, fmt, getDict } from "@/lib/i18n";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import type { NotablePost, ReportContent } from "@/lib/ai/report";
import { getReportSeries, type ReportSeries } from "@/lib/report-series";
import { DotBar } from "@/components/dots";
import { SolidAvatar } from "@/components/avatar";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReportToolbar, RetryInline } from "./toolbar";
import { ConversationChart, NetGauge } from "./report-visuals";

type Stats = {
  kpis: {
    mentions: number;
    netSentiment: number;
    engagement: number;
    reach: number;
    risks: number;
    positive?: number;
    negative?: number;
    neutral?: number;
    deltas: Record<string, number>;
  };
  topics: { key: string; labelEn: string; labelAr: string; count: number; positive?: number; negative?: number }[];
  series?: ReportSeries;
};

const PLATFORM_NAME: Record<Platform, string> = { X: "X", INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn" };

/** "Own the crash in public. Pin one post…" → bold title + the rest. */
function splitRecommendation(r: string) {
  const m = r.match(/^(.{6,120}?[.!?؟:])\s+([\s\S]+)$/);
  return m ? { title: m[1], body: m[2] } : { title: "", body: r };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t: ui, locale: uiLocale } = await getDict();
  const { id } = await params;
  const report = await db.report.findFirst({ where: { id, organizationId: user.organizationId }, include: { monitor: { select: { name: true } } } });
  if (!report) notFound();

  // The document renders in its own language, regardless of the UI language.
  const locale = report.locale === "en" ? "en" : "ar";
  const t = dictFor(locale);
  const d = t.reportDoc;
  const org = user.organization;
  const tz = org.timezone;
  const content = report.content as ReportContent | null;
  const stats = report.stats as Stats | null;
  const series = stats?.series ?? (report.status === "READY" ? await getReportSeries({ orgId: org.id, monitorId: report.monitorId, start: report.periodStart, end: report.periodEnd, tz }) : null);
  const days = Math.max(1, Math.round((report.periodEnd.getTime() - report.periodStart.getTime()) / 86400_000));
  const loc = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB";
  const n = (v: number) => formatNumber(v, locale);
  const period = new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric", timeZone: tz }).formatRange(report.periodStart, report.periodEnd);
  const generated = formatDate(report.createdAt, locale, { dateStyle: undefined, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }, tz);
  const kind = report.weekly ? d.weeklyReport : d.report;
  const vs = days === 7 ? d.vsLastWeek : d.vsPrev;

  const k = stats?.kpis;
  // Colour carries meaning: more talk while sentiment falls is bad; more reach and fewer risks are good.
  const kpis = k
    ? [
        { label: d.mentions, value: n(k.mentions), delta: k.deltas.mentions ?? 0, unit: "%", good: (k.deltas.mentions ?? 0) === 0 ? null : (k.deltas.netSentiment ?? 0) >= 0 },
        { label: d.net, value: `${k.netSentiment > 0 ? "+" : k.netSentiment < 0 ? "−" : ""}${Math.abs(k.netSentiment)}`, delta: k.deltas.netSentiment ?? 0, unit: ` ${d.pts}`, good: (k.deltas.netSentiment ?? 0) > 0 },
        { label: d.reach, value: n(k.reach), delta: k.deltas.reach ?? 0, unit: "%", good: (k.deltas.reach ?? 0) > 0 },
        { label: d.risks, value: n(k.risks), delta: k.deltas.risks ?? 0, unit: "%", good: (k.deltas.risks ?? 0) < 0 },
      ]
    : [];
  const sentTotal = k ? (k.positive ?? 0) + (k.neutral ?? 0) + (k.negative ?? 0) : 0;
  const split = k && sentTotal
    ? [
        { label: d.positive, v: Math.round(((k.positive ?? 0) / sentTotal) * 100), color: "var(--color-pos)" },
        { label: d.neutral, v: Math.round(((k.neutral ?? 0) / sentTotal) * 100), color: "var(--color-faint)" },
        { label: d.negative, v: Math.round(((k.negative ?? 0) / sentTotal) * 100), color: "var(--color-neg)" },
      ]
    : [];
  const splitMax = Math.max(1, ...split.map((s) => s.v));
  const topics = (stats?.topics ?? []).slice(0, 5);
  const topicMax = Math.max(1, ...topics.map((x) => x.count));
  const posts = (content?.notablePosts ?? []).slice(0, 6);
  const hasTopicSentiment = topics.some((x) => typeof x.negative === "number");

  const postMeta = (p: NotablePost) =>
    [PLATFORM_NAME[p.platform as Platform] ?? p.platform, p.followers ? fmt(d.followers, { n: n(p.followers) }) : null].filter(Boolean).join(" · ");
  const postStats = (p: NotablePost) =>
    [
      p.views && p.platform !== "X" ? fmt(d.views, { n: n(p.views) }) : null,
      p.likes ? fmt(d.likes, { n: n(p.likes) }) : null,
      p.comments ? fmt(d.replies, { n: n(p.comments) }) : null,
      p.publishedAt ? formatDate(p.publishedAt, locale, { dateStyle: undefined, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }, tz) : null,
    ]
      .filter(Boolean)
      .slice(0, 4)
      .join(" · ");

  return (
    <div className="mx-auto flex max-w-[920px] flex-col gap-5">
      <AutoRefresh active={report.status === "GENERATING"} every={4000} maxMs={300_000} />
      <ReportToolbar
        id={report.id}
        canDelete={hasRole(user, "ANALYST")}
        docTitle={`${org.name} · ${kind} · ${period}`}
        labels={{
          back: ui.reportDoc.back,
          share: ui.reportDoc.share,
          shareTitle: ui.reportDoc.shareTitle,
          copy: ui.reportDoc.copy,
          copied: ui.reportDoc.copied,
          emailPdf: ui.reportDoc.emailPdf,
          shareNote: fmt(ui.reportDoc.shareNote, { org: org.name }),
          exportPdf: ui.reportDoc.exportPdf,
          delete: ui.reportDoc.delete,
          confirm: ui.common.confirmDelete,
        }}
        ready={report.status === "READY"}
        uiLocale={uiLocale}
      />

      <article
        dir={locale === "ar" ? "rtl" : "ltr"}
        lang={locale}
        className="report-doc card flex flex-col gap-9 rounded-[20px] px-5 pt-8 pb-7 shadow-[0_1px_0_var(--color-sunken)] sm:px-10 md:px-16 md:pt-11 md:pb-9"
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 border-b border-line pb-5 text-[13.5px] text-muted">
            <span dir="ltr" className="shrink-0 text-[17px] font-semibold tracking-[-0.02em] text-ink">
              angle<span className="font-normal tracking-normal text-faint"> /social</span>
            </span>
            <span className="truncate" dir="auto">
              {org.name} · {kind}
            </span>
          </div>
          <div>
            <h1 className="text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] sm:text-[34px]">{period}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13.5px] text-faint">
              <span dir="auto">{report.monitor?.name ?? d.allMonitors}</span>
              {k && (
                <>
                  <Dot />
                  <span>{fmt(d.conversations, { n: n(k.mentions) })}</span>
                </>
              )}
              <Dot />
              <span>{fmt(d.generated, { when: generated })}</span>
            </div>
          </div>
          {content && (
            <>
              <p className="text-[19px] leading-normal font-medium tracking-[-0.01em] sm:text-[23px]">{content.headline}</p>
              <p className="max-w-[700px] text-[15.5px] leading-[1.75] text-muted">{content.summary}</p>
            </>
          )}
        </div>

        {report.status === "GENERATING" && (
          <div className="flex flex-col gap-3 py-6" aria-live="polite">
            <p className="text-[15px] text-muted">{ui.reportDoc.writing}</p>
            <div className="skeleton h-5 w-3/4" />
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton h-32 w-full" />
          </div>
        )}
        {report.status === "FAILED" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-neg/[0.06] px-4 py-3 text-[14px] text-neg">
            <span>
              {ui.reportDoc.failed}
              {report.error ? `: ${report.error}` : ""}
            </span>
            {hasRole(user, "ANALYST") && <RetryInline id={report.id} label={ui.reportDoc.retry} />}
          </div>
        )}

        {k && (
          <section aria-labelledby="rd-kn" className="flex flex-col gap-4">
            <h2 id="rd-kn" className="text-[13.5px] font-semibold text-muted">{d.keyNumbers}</h2>
            <div className="grid grid-cols-2 border-y border-line md:grid-cols-4">
              {kpis.map((x, i) => (
                <div
                  key={x.label}
                  className={cn(
                    "flex min-w-0 flex-col gap-1 py-[18px] pe-3 md:pe-5",
                    i % 2 === 1 && "border-s border-line ps-4 md:ps-5",
                    i >= 2 && "border-t border-line md:border-t-0",
                    i === 2 && "md:border-s md:ps-5",
                  )}
                >
                  <span className="text-[13.5px] text-muted">{x.label}</span>
                  <span className="text-[26px] font-semibold tracking-[-0.02em] tnum ltr-nums self-start sm:text-[30px]">{x.value}</span>
                  <span className="flex flex-wrap items-center gap-x-1 text-[13px]">
                    <span className={cn("inline-flex items-center gap-0.5 font-semibold ltr-nums", x.good === null || x.delta === 0 ? "text-faint" : x.good ? "text-pos" : "text-neg")}>
                      {x.delta > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : x.delta < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                      {Math.abs(x.delta)}
                      {x.unit}
                    </span>
                    <span className="text-faint">{vs}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {series && series.points.length > 1 && (
          <section aria-labelledby="rd-vol" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id="rd-vol" className="text-[18px] font-semibold">{d.byDay}</h2>
              <span className="text-[13px] text-faint">{d.every[series.unit]}</span>
            </div>
            <ConversationChart series={series} locale={locale} ariaLabel={`${d.byDay}: ${period}`} peakLabel={(v, when) => fmt(d.peak, { n: n(v), when })} />
          </section>
        )}

        {(split.length > 0 || topics.length > 0) && (
          <section className="grid gap-10 md:grid-cols-[300px_minmax(0,1fr)] md:gap-14">
            {split.length > 0 && k && (
              <div className="flex flex-col gap-4" aria-labelledby="rd-sent">
                <h2 id="rd-sent" className="text-[18px] font-semibold">{d.sentiment}</h2>
                <div className="flex items-center gap-5">
                  <NetGauge net={k.netSentiment} label={d.net} />
                  <span className="text-[14px] leading-[1.6] text-muted">
                    {d.net}
                    <span className={cn("block font-semibold ltr-nums", (k.deltas.netSentiment ?? 0) < 0 ? "text-neg" : (k.deltas.netSentiment ?? 0) > 0 ? "text-pos" : "text-faint")}>
                      {(k.deltas.netSentiment ?? 0) > 0 ? "+" : (k.deltas.netSentiment ?? 0) < 0 ? "−" : ""}
                      {Math.abs(k.deltas.netSentiment ?? 0)} {d.pts}
                    </span>
                  </span>
                </div>
                <ul className="mt-1 flex flex-col gap-3">
                  {split.map((s) => (
                    <li key={s.label} className="grid grid-cols-[70px_minmax(0,1fr)_40px] items-center gap-3 text-[14px]">
                      <span>{s.label}</span>
                      <DotBar segments={[{ value: s.v, color: s.color }]} max={splitMax} />
                      <span className="text-end text-muted tnum">{s.v}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {topics.length > 0 && (
              <div className="flex min-w-0 flex-col gap-4" aria-labelledby="rd-themes">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 id="rd-themes" className="text-[18px] font-semibold">{d.themes}</h2>
                  {hasTopicSentiment && (
                    <span className="flex gap-3.5 text-[12.5px] text-faint">
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-neg" />{d.negative}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-pos" />{d.other}</span>
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-3.5">
                  {topics.map((x) => {
                    const negPct = x.count ? Math.round(((x.negative ?? 0) / x.count) * 100) : 0;
                    return (
                      <li key={x.key} className="flex flex-col gap-[7px]">
                        <span className="flex justify-between gap-3 text-[14px]">
                          <span className="min-w-0 truncate">{locale === "ar" ? x.labelAr : x.labelEn}</span>
                          <span className="flex shrink-0 gap-2.5 text-muted tnum">
                            <bdi>{n(x.count)}</bdi>
                            {hasTopicSentiment && <bdi className={negPct > 50 ? "text-neg" : "text-faint"}>{fmt(d.negShare, { pct: negPct })}</bdi>}
                          </span>
                        </span>
                        <DotBar
                          segments={hasTopicSentiment ? [{ value: x.count - (x.negative ?? 0), color: "var(--color-pos)" }, { value: x.negative ?? 0, color: "var(--color-neg)" }] : [{ value: x.count, color: "var(--color-chart)" }]}
                          max={topicMax}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        )}

        {content && content.sections.length > 0 && (
          <section aria-labelledby="rd-details" className="flex flex-col gap-4">
            <h2 id="rd-details" className="text-[18px] font-semibold">{d.details}</h2>
            <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
              {content.sections.map((s, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <h3 className="text-[15px] font-semibold">{s.title}</h3>
                  <p className="text-[14.5px] leading-[1.7] whitespace-pre-line text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {posts.length > 0 && (
          <section aria-labelledby="rd-posts" className="flex flex-col gap-4">
            <h2 id="rd-posts" className="text-[18px] font-semibold">{d.notable}</h2>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {posts.map((p, i) => {
                const name = p.name || (p.author ? `@${p.author}` : PLATFORM_NAME[p.platform as Platform]);
                const tone = p.sentiment === "NEGATIVE" ? "bg-neg" : p.sentiment === "POSITIVE" ? "bg-pos" : "bg-faint";
                const stat = postStats(p);
                return (
                  <figure key={p.id ?? i} className="flex min-w-0 flex-col gap-3.5 rounded-[16px] border border-line p-[18px]">
                    <figcaption className="flex items-center gap-2.5">
                      <SolidAvatar name={name} seed={p.author ?? name} size={34} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer" dir="auto" className="truncate text-[14px] font-semibold hover:underline">
                            {name}
                          </a>
                        ) : (
                          <span dir="auto" className="truncate text-[14px] font-semibold">{name}</span>
                        )}
                        <span className="truncate text-[12.5px] text-faint">{postMeta(p)}</span>
                      </span>
                      {p.sentiment && <span title={t.sentiment[p.sentiment as "POSITIVE"]} className={cn("h-2 w-2 shrink-0 rounded-full", tone)} />}
                    </figcaption>
                    <blockquote dir="auto" className="line-clamp-6 text-[15.5px] leading-[1.8] [overflow-wrap:anywhere]">{p.text}</blockquote>
                    {stat && <span className="mt-auto text-[12.5px] text-faint">{stat}</span>}
                  </figure>
                );
              })}
            </div>
          </section>
        )}

        {content && content.recommendations.length > 0 && (
          <section aria-labelledby="rd-recs" className="flex flex-col gap-4 rounded-[16px] bg-canvas px-5 py-6 sm:px-7">
            <h2 id="rd-recs" className="text-[18px] font-semibold">{d.recommendations}</h2>
            <ol className="grid gap-x-10 gap-y-4 md:grid-cols-2">
              {content.recommendations.map((r, i) => {
                const { title, body } = splitRecommendation(r);
                return (
                  <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5 text-[14.5px] leading-[1.6]">
                    <span className="font-semibold text-faint tnum">{i + 1}</span>
                    <span>
                      {title && <span className="font-semibold">{title} </span>}
                      <span className="text-muted">{body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-line pt-4 text-[12.5px] text-faint">
          <span>{fmt(d.preparedBy, { org: org.name })}</span>
          <span>{d.internal}</span>
        </div>
      </article>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-faint" />;
}
