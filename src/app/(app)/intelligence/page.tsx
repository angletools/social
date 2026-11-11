import Link from "next/link";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { getTopSlang, parseDays } from "@/lib/analytics";
import { fallbackBrief, getIntelligence, readBrief, type BriefTheme, type Driver } from "@/lib/intelligence";
import { Card, Delta, Meter } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { NetTrendChart } from "@/components/charts";
import { SentimentBar } from "@/components/sentiment";
import { DIALECT_COLORS } from "@/components/dialect-badges";
import { DotBar, Waffle } from "@/components/dots";
import { Glossary } from "./glossary";
import { RefreshBrief } from "./refresh-brief";

export const metadata = { title: "Intelligence" };

const TONE = { POSITIVE: "bg-pos", NEGATIVE: "bg-neg", MIXED: "bg-warn" } as const;
const TONE_VAR: Record<string, string> = { POSITIVE: "var(--color-pos)", NEGATIVE: "var(--color-neg)", MIXED: "var(--color-warn)" };

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const tab = sp.tab === "language" ? "language" : "overview";
  const T = t.intelligencePage;
  const ar = locale === "ar";
  const scope = { orgId: user.organizationId, days, tz: user.organization.timezone };
  const q = (extra: Record<string, string>) => `/mentions?${new URLSearchParams({ days: String(days), ...extra })}`;

  const tabs = (
    <div className="inline-flex rounded-[10px] bg-sunken p-0.5">
      {(["overview", "language"] as const).map((k) => (
        <Link
          key={k}
          href={`/intelligence?${new URLSearchParams({ days: String(days), ...(k === "language" && { tab: k }) })}`}
          aria-current={tab === k ? "page" : undefined}
          className={cn("rounded-[8px] px-3 py-1.5 text-[13px] transition", tab === k ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted hover:text-ink")}
        >
          {T.tabs[k]}
        </Link>
      ))}
    </div>
  );
  const header = (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <h1 className="text-[28px] font-semibold leading-tight">{T.title}</h1>
      <div className="flex flex-wrap items-center gap-2">
        {tabs}
        <RangeTabs days={days} labels={t.common.range} basePath="/intelligence" params={{ tab: tab === "language" ? "language" : undefined }} />
      </div>
    </div>
  );

  if (tab === "language") {
    const [slang, terms] = await Promise.all([
      getTopSlang(scope, 20),
      db.lexiconTerm.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
    ]);
    return (
      <>
        {header}
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card title={t.dialectPage.slang} bodyClassName="p-0">
            {slang.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t.dialectPage.noSlang}</p>
            ) : (
              <ul className="divide-y divide-line">
                {slang.map((s) => (
                  <li key={s.term}>
                    <Link prefetch={false} href={q({ q: s.term })} className="flex items-center gap-4 px-5 py-2.5 hover:bg-panel">
                      <b dir="auto" className="w-36 shrink-0 text-base font-medium">{s.term}</b>
                      <span dir="ltr" className="flex-1 text-start text-sm text-muted">{s.gloss}</span>
                      <span className="w-20">
                        <SentimentBar pos={s.positive} neg={s.negative} neu={s.count - s.positive - s.negative} />
                      </span>
                      <span className="w-10 text-end text-sm text-muted ltr-nums">{s.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t.dialectPage.glossary}>
            <Glossary
              terms={terms}
              canEdit={hasRole(user, "ANALYST")}
              t={t.dialectPage}
              dialects={t.dialects}
              sentiments={{ POSITIVE: t.sentiment.POSITIVE, NEUTRAL: t.sentiment.NEUTRAL, NEGATIVE: t.sentiment.NEGATIVE }}
              addLabel={t.dialectPage.add}
            />
          </Card>
        </div>
      </>
    );
  }

  const [intel, stored] = await Promise.all([
    getIntelligence(scope),
    db.intelligenceBrief.findFirst({ where: { organizationId: user.organizationId, days }, orderBy: { createdAt: "desc" } }),
  ]);
  const brief =
    readBrief(stored) ??
    fallbackBrief({
      days,
      comparable: intel.comparable,
      total: intel.kpis.mentions,
      netSentiment: intel.kpis.netSentiment,
      netChange: intel.kpis.deltas.netSentiment,
      churn: intel.churn.count,
      churnPrev: intel.churn.prev,
      negative: intel.negative,
      positive: intel.positive,
      emerging: intel.emerging,
    });
  const fromNumbers = !stored || stored.source === "fallback";
  const label = (x: { labelAr: string; labelEn: string }) => (ar ? x.labelAr : x.labelEn);
  const cmp = intel.comparable;
  const churnDelta = intel.churn.change ?? 0;
  const totalDialect = intel.dialects.reduce((a, d) => a + d.count, 0);

  return (
    <>
      {header}
      <div className="space-y-8">
        {/* Customer voice: one plain sentence, set large */}
        <section aria-label={T.brief} className="max-w-[920px]">
          <p dir="auto" className="text-[21px] leading-[1.65] md:text-[25px]">{ar ? brief.summaryAr : brief.summaryEn}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-faint">
            {stored && <span>{fmt(T.updated, { when: timeAgo(stored.createdAt, locale) })}</span>}
            {fromNumbers && <span>· {T.numbersOnly}</span>}
            {hasRole(user, "ANALYST") && (
              <RefreshBrief days={days} stamp={stored?.id ?? null} labels={{ refresh: T.refresh, refreshing: T.refreshing, queued: T.queued }} />
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="card px-6 pt-6 pb-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-[15px] text-muted">{T.netSentiment}</h2>
              <span className="text-[32px] font-semibold leading-none tracking-tight ltr-nums">
                {intel.kpis.netSentiment > 0 ? "+" : ""}
                {intel.kpis.netSentiment}
              </span>
              {cmp && <Delta value={intel.kpis.deltas.netSentiment} suffix="" />}
            </div>
            <div className="mt-3">
              <NetTrendChart points={intel.trend} unit={intel.unit} locale={locale} />
            </div>
          </section>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
            <Stat label={T.churn} value={formatNumber(intel.churn.count, locale)} delta={cmp && intel.churn.change !== null && <Delta value={churnDelta} invert />} href={q({ intent: "CHURN_RISK" })} />
            <Stat label={T.mentions} value={formatNumber(intel.kpis.mentions, locale)} delta={cmp && <Delta value={intel.kpis.deltas.mentions} />} href={q({})} />
          </div>
        </div>

        {brief.themes.length > 0 && (
          <section aria-labelledby="saying" className="space-y-2">
            <h2 id="saying" className="mb-3 text-[18px] font-semibold">{T.saying}</h2>
            <ul className="space-y-2">
              {brief.themes.map((th, i) => (
                <ThemeItem key={i} th={th} ar={ar} href={th.topicKey ? q({ topic: th.topicKey }) : null} labels={{ doNext: T.doNext }} max={Math.max(...brief.themes.map((x) => x.sharePct))} />
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <DriverList comparable={cmp} title={T.frustrations} items={intel.negative} tone="neg" ar={ar} hrefFor={(k) => q({ topic: k, sentiment: "NEGATIVE" })} empty={T.empty} sub={T.ofNegative} newLabel={T.isNew} />
          <DriverList comparable={cmp} title={T.loves} items={intel.positive} tone="pos" ar={ar} hrefFor={(k) => q({ topic: k, sentiment: "POSITIVE" })} empty={T.empty} sub={T.ofPositive} newLabel={T.isNew} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card title={T.complaints} bodyClassName="p-0 pb-2">
            {intel.complaints.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted">{T.empty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {intel.complaints.map((c) => (
                  <li key={c.key}>
                    <Link prefetch={false} href={q({ topic: c.key, intent: "COMPLAINT" })} className="block px-5 py-3.5 hover:bg-panel">
                      <div className="flex items-baseline gap-3">
                        <span className="flex-1 text-[14px] font-medium">{label(c)}</span>
                        {c.churn > 0 && (
                          <span className="text-[12.5px] text-neg ltr-nums">
                            {c.churn} {t.intents.CHURN_RISK}
                          </span>
                        )}
                        <span className="text-[13px] text-muted ltr-nums">{c.count}</span>
                      </div>
                      <p dir="auto" className="mt-1 line-clamp-1 text-[13.5px] text-muted">
                        “{c.example.text}”
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="space-y-6">
            <Card title={T.emerging} bodyClassName="p-0 pb-2">
              {intel.emerging.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted">{T.empty}</p>
              ) : (
                <ul>
                  {intel.emerging.map((e) => (
                    <li key={e.key}>
                      <Link prefetch={false} href={q({ topic: e.key })} className="flex items-center gap-3 px-5 py-2.5 hover:bg-panel">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", e.net < -10 ? "bg-neg" : e.net > 10 ? "bg-pos" : "bg-neu")} />
                        <span className="flex-1 truncate text-[14px]">{label(e)}</span>
                        <span className="text-[13px] text-muted ltr-nums">{e.count}</span>
                        <span className="w-14 text-end text-[13px] font-medium ltr-nums">
                          {e.change === null ? <span className="text-brand-700">{T.isNew}</span> : <span className="text-ink">+{e.change}%</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={T.intents} bodyClassName="p-0 pb-2">
              <ul>
                {intel.intents.map((i) => (
                  <li key={i.intent}>
                    <Link prefetch={false} href={q({ intent: i.intent })} className="flex items-center gap-3 px-5 py-2 hover:bg-panel">
                      <span className="flex-1 text-[14px]">{t.intents[i.intent]}</span>
                      <span className={cn("w-12 text-end text-[13px] ltr-nums", i.net >= 0 ? "text-pos" : "text-neg")}>
                        {i.net > 0 ? "+" : ""}
                        {i.net}
                      </span>
                      <span className="w-12 text-end text-[13px] text-muted ltr-nums">{formatNumber(i.count, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={T.dialects}>
              <Waffle className="max-w-[360px]" label={T.dialects} parts={intel.dialects.map((d) => ({ value: d.count, color: DIALECT_COLORS[d.dialect], name: t.dialects[d.dialect] }))} />
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
                {intel.dialects.slice(0, 6).map((d) => (
                  <li key={d.dialect}>
                    <Link prefetch={false} href={q({ dialect: d.dialect })} className="flex items-center gap-2 text-[13.5px] hover:text-brand-700">
                      <span className="h-2 w-2 rounded-full" style={{ background: DIALECT_COLORS[d.dialect] }} />
                      <span className="flex-1 truncate">{t.dialects[d.dialect]}</span>
                      <span className="text-muted ltr-nums">{Math.round((d.count / Math.max(1, totalDialect)) * 100)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, delta, href }: { label: string; value: string; delta: React.ReactNode; href: string }) {
  return (
    <Link prefetch={false} href={href} className="card flex flex-col justify-center gap-1.5 px-6 py-5 transition-colors hover:bg-panel">
      <span className="text-[14px] text-muted">{label}</span>
      <span className="flex items-baseline gap-2.5">
        <span className="text-[28px] font-semibold leading-none tracking-tight ltr-nums">{value}</span>
        {delta}
      </span>
    </Link>
  );
}

function ThemeItem({ th, ar, href, labels, max }: { th: BriefTheme; ar: boolean; href: string | null; labels: { doNext: string }; max: number }) {
  const rec = ar ? th.recommendation_ar : th.recommendation_en;
  const inner = (
    <div className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 px-6 py-5 sm:grid-cols-[10px_minmax(0,1fr)_140px_52px] sm:items-center">
      <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full sm:mt-0", TONE[th.sentiment] ?? "bg-neu")} />
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold">{ar ? th.title_ar : th.title_en}</h3>
        <p dir="auto" className="mt-1 text-[14px] leading-relaxed text-muted">
          {ar ? th.summary_ar : th.summary_en}
        </p>
        {rec && (
          <p dir="auto" className="mt-2 text-[14px] leading-relaxed">
            <span className="text-faint">{labels.doNext} · </span>
            {rec}
          </p>
        )}
      </div>
      <div className="col-start-2 sm:col-start-auto">
        <DotBar segments={[{ value: th.sharePct, color: TONE_VAR[th.sentiment] ?? "var(--color-neu)" }]} max={Math.max(1, max)} />
      </div>
      <span className="hidden text-end text-[14px] font-semibold ltr-nums sm:block">{th.sharePct}%</span>
    </div>
  );
  return (
    <li className="card overflow-hidden">
      {href ? (
        <Link prefetch={false} href={href} className="block transition-colors hover:bg-panel">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

function DriverList({
  comparable,
  title,
  items,
  tone,
  ar,
  hrefFor,
  empty,
  sub,
  newLabel,
}: {
  comparable: boolean;
  title: string;
  items: Driver[];
  tone: "pos" | "neg";
  ar: boolean;
  hrefFor: (key: string) => string;
  empty: string;
  sub: string;
  newLabel: string;
}) {
  const max = Math.max(1, ...items.map((d) => d.share));
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((d) => (
            <li key={d.key}>
              <Link prefetch={false} href={hrefFor(d.key)} className="group block">
                <div className="mb-1.5 flex items-baseline gap-3 text-[14px]">
                  <span className="flex-1 truncate group-hover:text-brand-700">{ar ? d.labelAr : d.labelEn}</span>
                  <span className="text-[13px] text-muted ltr-nums">
                    {d.share}% <span className="text-faint">{sub}</span>
                  </span>
                  {comparable && (
                    <span className="w-14 text-end text-[12.5px] ltr-nums">
                      {d.change === null ? <span className="text-faint">{newLabel}</span> : <Delta value={d.change} invert={tone === "neg"} />}
                    </span>
                  )}
                </div>
                <Meter value={d.share} max={max} color={`var(--color-${tone})`} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
