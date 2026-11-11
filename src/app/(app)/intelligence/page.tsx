import Link from "next/link";
import type { Intent } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, ltr, timeAgo } from "@/lib/utils";
import { getPostingHeatmap, getTopSlang, parseDays } from "@/lib/analytics";
import { fallbackBrief, getIntelligence, getTopicExamples, readBrief, type Driver } from "@/lib/intelligence";
import { sharpestDrop, signedInt, tzCity } from "@/lib/insight";
import { NetEventChart } from "@/components/app-charts";
import { DIALECT_COLORS } from "@/components/dialect-badges";
import { DotBar } from "@/components/dots";
import { LegendRow, Panel, PanelTitle, RangeSegmented, Rings, Segmented } from "@/components/insight-ui";
import { PostingHeatmapCard } from "./posting-heatmap";
import { Glossary } from "./glossary";
import { RefreshBrief } from "./refresh-brief";
import { ThemeList, type ThemeRow } from "./themes";

export const metadata = { title: "Intelligence" };

const TONE_VAR: Record<string, string> = {
  POSITIVE: "var(--color-pos)",
  NEGATIVE: "var(--color-neg)",
  MIXED: "var(--color-warn)",
};
const INTENT_COLORS: Record<Intent, string> = {
  COMPLAINT: "var(--color-ink)",
  QUESTION: "var(--color-info)",
  PRAISE: "var(--color-pos)",
  CHURN_RISK: "var(--color-neg)",
  PURCHASE_INTENT: "var(--color-warn)",
  SUGGESTION: "var(--color-plum)",
  OTHER: "var(--color-faint)",
};

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const tab = sp.tab === "language" ? "language" : "overview";
  const T = t.intelligencePage;
  const I = t.intel2;
  const ar = locale === "ar";
  const tz = user.organization.timezone;
  const scope = { orgId: user.organizationId, days, tz };
  const q = (extra: Record<string, string>) => `/mentions?${new URLSearchParams({ days: String(days), ...extra })}`;
  const rangeLabel = t.common.range[String(days) as keyof typeof t.common.range];

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-[28px] font-semibold leading-tight">{T.title}</h1>
        <Segmented
          label={I.section}
          items={(["overview", "language"] as const).map((k) => ({
            key: k,
            label: T.tabs[k],
            href: `/intelligence?${new URLSearchParams({ days: String(days), ...(k === "language" && { tab: k }) })}`,
            on: tab === k,
          }))}
        />
      </div>
      <RangeSegmented days={days} labels={t.common.range} basePath="/intelligence" params={{ tab: tab === "language" ? "language" : undefined }} label={t.home2.period2} />
    </header>
  );

  if (tab === "language") {
    const [slang, terms] = await Promise.all([
      getTopSlang(scope, 20),
      db.lexiconTerm.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
    ]);
    return (
      <div className="flex flex-col gap-8 md:gap-11">
        {header}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel>
            <PanelTitle className="mb-2" aside={<span className="text-[13px] text-faint">{fmt(I.lastRange, { range: rangeLabel })}</span>}>
              {I.topSlang}
            </PanelTitle>
            {slang.length === 0 ? (
              <p className="py-3 text-sm text-muted">{t.dialectPage.noSlang}</p>
            ) : (
              <ul>
                {slang.map((s, i) => (
                  <li key={s.term} className={cn(i > 0 && "border-t border-line")}>
                    <Link
                      prefetch={false}
                      href={q({ q: s.term })}
                      className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-4 gap-y-1 py-3 text-[14.5px] transition-colors hover:text-muted sm:h-[52px] sm:grid-cols-[150px_minmax(0,1fr)_72px_110px_40px] sm:py-0"
                    >
                      <span dir="auto" className="truncate text-[16px] font-semibold">
                        {s.term}
                      </span>
                      <span dir="ltr" className="col-start-1 row-start-2 truncate text-left text-muted sm:col-start-auto sm:row-start-auto rtl:text-right">
                        {s.gloss}
                      </span>
                      <span className="hidden truncate text-[13px] text-faint sm:block">{s.dialect ? t.dialects[s.dialect] : ""}</span>
                      <span className="hidden sm:block">
                        <DotBar
                          max={Math.max(1, s.count)}
                          label={`${t.sentiment.POSITIVE} ${pct(s.positive, s.count)}%, ${t.sentiment.NEGATIVE} ${pct(s.negative, s.count)}%`}
                          segments={[
                            { value: s.positive, color: "var(--color-pos)" },
                            { value: s.negative, color: "var(--color-neg)" },
                          ]}
                        />
                      </span>
                      <span className="col-start-2 row-span-2 row-start-1 text-end text-muted ltr-nums sm:col-start-auto sm:row-span-1 sm:row-start-auto">{s.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel className="flex flex-col gap-3.5">
            <PanelTitle>{I.teamGlossary}</PanelTitle>
            <Glossary
              terms={terms}
              canEdit={hasRole(user, "ANALYST")}
              t={t.dialectPage}
              help={I.glossaryHelp}
              dialects={t.dialects}
              sentiments={{ POSITIVE: t.sentiment.POSITIVE, NEUTRAL: t.sentiment.NEUTRAL, NEGATIVE: t.sentiment.NEGATIVE }}
              addLabel={I.add}
            />
          </Panel>
        </div>
      </div>
    );
  }

  const [intel, stored, heat] = await Promise.all([
    getIntelligence(scope),
    db.intelligenceBrief.findFirst({ where: { organizationId: user.organizationId, days }, orderBy: { createdAt: "desc" } }),
    getPostingHeatmap(scope),
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

  // One representative post per theme: the brief's own example, or the most engaged one on that topic.
  const needExamples = brief.themes.filter((th) => !th.exampleMentionIds?.length && th.topicKey).map((th) => th.topicKey!);
  const extra = needExamples.length ? await getTopicExamples(scope, needExamples, 1) : {};
  const exampleId = (th: (typeof brief.themes)[number]) => th.exampleMentionIds?.[0] ?? (th.topicKey ? extra[th.topicKey]?.[0] : undefined);
  const exampleIds = brief.themes.map(exampleId).filter((x): x is string => Boolean(x));
  const examples = exampleIds.length
    ? await db.mention.findMany({
        where: { id: { in: exampleIds }, organizationId: user.organizationId },
        select: { id: true, text: true, authorName: true, authorHandle: true, authorFollowers: true },
      })
    : [];
  const byId = new Map(examples.map((m) => [m.id, m]));
  const driverChange = (th: (typeof brief.themes)[number]) => {
    if (!cmp || !th.topicKey) return null;
    const list: { key: string; change: number | null }[] = th.sentiment === "NEGATIVE" ? intel.negative : th.sentiment === "POSITIVE" ? intel.positive : intel.emerging;
    return list.find((x) => x.key === th.topicKey)?.change ?? null;
  };
  const themes: ThemeRow[] = brief.themes.map((th) => {
    const ex = byId.get(exampleId(th) ?? "");
    const ch = driverChange(th);
    const rec = ar ? th.recommendation_ar : th.recommendation_en;
    return {
      title: ar ? th.title_ar : th.title_en,
      summary: ar ? th.summary_ar : th.summary_en,
      color: TONE_VAR[th.sentiment] ?? "var(--color-faint)",
      share: th.sharePct,
      delta: ch === null ? null : `${signedInt(ch)}%`,
      deltaTone: ch !== null && ch > 0 && th.sentiment !== "POSITIVE" ? "neg" : "muted",
      quote: ex ? ex.text.replace(/\s+/g, " ").slice(0, 240) : null,
      who: ex ? [ex.authorName ?? (ex.authorHandle ? `@${ex.authorHandle}` : null), ex.authorFollowers ? formatNumber(ex.authorFollowers, locale) : null].filter(Boolean).join(" · ") : null,
      rec: rec || null,
      href: th.topicKey ? q({ topic: th.topicKey }) : null,
    };
  });

  const intentOf = (i: Intent) => intel.intents.find((x) => x.intent === i);
  const signal = (i: Intent, labelText: string, goodWhenUp: boolean) => {
    const x = intentOf(i);
    const d = x && cmp ? x.count - x.prevCount : null;
    return { key: i, label: labelText, value: x?.count ?? 0, delta: d, tone: d === null || d === 0 ? "text-faint" : (d > 0) === goodWhenUp ? "text-pos" : "text-neg" };
  };
  const signals = [signal("CHURN_RISK", t.intents.CHURN_RISK, false), signal("COMPLAINT", I.complaints, false), signal("PURCHASE_INTENT", t.intents.PURCHASE_INTENT, true)];

  const drop = sharpestDrop(intel.trend);
  const event = drop ? { index: drop.index, label: fmt(intel.unit === "hour" ? I.dropHour : I.dropDay, { n: ltr(signedInt(-drop.drop)) }) } : null;
  const netDelta = intel.kpis.deltas.netSentiment;

  const totalIntents = intel.intents.reduce((a, x) => a + x.count, 0);
  const totalDialect = intel.dialects.reduce((a, d) => a + d.count, 0);
  const mixes = [
    {
      title: I.dialects,
      link: { href: `/intelligence?days=${days}&tab=language`, label: I.glossaryLink },
      parts: intel.dialects.slice(0, 4).map((d) => ({ key: d.dialect, label: t.dialects[d.dialect], value: pct(d.count, totalDialect), color: DIALECT_COLORS[d.dialect], href: q({ dialect: d.dialect }) })),
    },
    {
      title: I.intent,
      link: null,
      parts: intel.intents.slice(0, 4).map((x) => ({ key: x.intent, label: t.intents[x.intent], value: pct(x.count, totalIntents), color: INTENT_COLORS[x.intent], href: q({ intent: x.intent }) })),
    },
  ];

  return (
    <div className="flex flex-col gap-8 md:gap-11">
      {header}

      <section aria-label={T.brief} className="flex flex-col gap-3.5">
        <p dir="auto" className="max-w-[900px] text-[20px] leading-[1.7] md:text-[26px]">
          {ar ? brief.summaryAr : brief.summaryEn}
        </p>
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 text-[13.5px] text-faint">
          <span>
            {fmt(I.fromN, { n: formatNumber(intel.kpis.mentions, locale) })}
            {stored && <> · {timeAgo(stored.createdAt, locale)}</>}
            {fromNumbers && <> · {T.numbersOnly}</>}
          </span>
          {hasRole(user, "ANALYST") && <RefreshBrief days={days} stamp={stored?.id ?? null} labels={{ refresh: T.refresh, refreshing: T.refreshing, queued: T.queued }} />}
        </div>
      </section>

      <section aria-label={T.netSentiment} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
        <Panel className="pb-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] text-muted">{T.netSentiment}</h2>
            <span className="text-[34px] font-semibold leading-none tracking-[-0.02em] ltr-nums">{signedInt(intel.kpis.netSentiment)}</span>
            {cmp && netDelta !== 0 && <span className={cn("text-[14px] font-semibold ltr-nums", netDelta > 0 ? "text-pos" : "text-neg")}>{signedInt(netDelta)}</span>}
          </div>
          <div className="mt-3.5">
            <NetEventChart points={intel.trend} unit={intel.unit} locale={locale} label={I.netOverTime} event={event} height="clamp(190px, 45vw, 250px)" />
          </div>
        </Panel>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          {signals.map((s) => (
            <Link
              key={s.key}
              prefetch={false}
              href={q({ intent: s.key })}
              className="flex flex-col justify-center gap-1 rounded-[20px] bg-surface px-4 py-4 transition-colors duration-150 hover:bg-surface/70 sm:px-6 sm:py-6"
            >
              <span className="truncate text-[13px] text-muted sm:text-[14px]">{s.label}</span>
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-[24px] font-semibold leading-tight ltr-nums sm:text-[28px]">{formatNumber(s.value, locale)}</span>
                {s.delta !== null && s.delta !== 0 && <span className={cn("text-[13px] font-semibold ltr-nums", s.tone)}>{signedInt(s.delta)}</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {themes.length > 0 && (
        <section aria-labelledby="saying" className="flex flex-col gap-2">
          <h2 id="saying" className="mb-2 text-[18px] font-semibold">
            {T.saying}
          </h2>
          <ThemeList themes={themes} labels={{ suggested: I.suggested, seePosts: I.seePosts }} />
        </section>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DriverCard title={I.driversDown} items={intel.negative.slice(0, 4)} color="var(--color-neg)" ar={ar} empty={T.empty} hrefFor={(k) => q({ topic: k, sentiment: "NEGATIVE" })} />
        <DriverCard title={I.driversUp} items={intel.positive.slice(0, 4)} color="var(--color-pos)" ar={ar} empty={T.empty} hrefFor={(k) => q({ topic: k, sentiment: "POSITIVE" })} />
      </section>

      <Panel aria-labelledby="heat-h" className="flex flex-col gap-[18px]">
        <PanelTitle id="heat-h" aside={<span className="text-[13px] text-faint">{fmt(I.tzTime, { city: tzCity(tz, locale) })}</span>}>
          {T.whenPost}
        </PanelTitle>
        <PostingHeatmapCard grid={heat} locale={locale} labels={{ less: T.heatLess, more: T.heatMore, posts: T.heatPosts, peak: I.peak, quiet: I.quiet, summary: I.heatSummary }} />
      </Panel>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <PanelTitle className="mb-4">{I.rising}</PanelTitle>
          {intel.emerging.length === 0 ? (
            <p className="text-sm text-muted">{T.empty}</p>
          ) : (
            <ul>
              {intel.emerging.map((e, i) => {
                const tone = e.net < -10 ? "neg" : e.net > 10 ? "pos" : "faint";
                return (
                  <li key={e.key} className={cn(i > 0 && "border-t border-line")}>
                    <Link prefetch={false} href={q({ topic: e.key })} className="grid h-11 grid-cols-[8px_minmax(0,1fr)_56px_56px] items-center gap-3 text-[14.5px] transition-colors hover:text-muted">
                      <span className={cn("h-2 w-2 rounded-full", tone === "neg" ? "bg-neg" : tone === "pos" ? "bg-pos" : "bg-faint")} />
                      <span className="truncate">{label(e)}</span>
                      <span className="text-end text-muted ltr-nums">{formatNumber(e.count, locale)}</span>
                      <span className={cn("text-end font-semibold ltr-nums", tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-ink")}>
                        {e.change === null ? T.isNew : `${signedInt(e.change)}%`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel>
          <PanelTitle className="mb-4">{T.complaints}</PanelTitle>
          {intel.complaints.length === 0 ? (
            <p className="text-sm text-muted">{T.empty}</p>
          ) : (
            <ul>
              {intel.complaints.slice(0, 4).map((c, i) => (
                <li key={c.key} className={cn(i > 0 && "border-t border-line")}>
                  <Link prefetch={false} href={q({ topic: c.key, intent: "COMPLAINT" })} className="group flex flex-col gap-1 py-3">
                    <span className="flex items-baseline justify-between gap-3 text-[14.5px]">
                      <span className="truncate font-semibold group-hover:text-muted">{label(c)}</span>
                      <span className="flex shrink-0 gap-3 text-muted ltr-nums">
                        {c.churn > 0 && <span className="text-neg">{fmt(I.mayLeave, { n: c.churn })}</span>}
                        <span>{formatNumber(c.count, locale)}</span>
                      </span>
                    </span>
                    <span dir="auto" className="truncate text-[13.5px] leading-relaxed text-muted">
                      «{c.example.text.replace(/\s+/g, " ")}»
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {mixes.map((m) => (
          <Panel key={m.title}>
            <PanelTitle
              className="mb-[18px]"
              aside={
                m.link && (
                  <Link href={m.link.href} className="text-[13.5px] text-brand-600 transition-colors hover:text-ink">
                    {m.link.label}
                  </Link>
                )
              }
            >
              {m.title}
            </PanelTitle>
            {m.parts.length === 0 ? (
              <p className="text-sm text-muted">{T.empty}</p>
            ) : (
              <div className="flex items-center gap-6 sm:gap-7">
                <Rings label={m.title} size={150} outer={80} items={m.parts} />
                <ul className="flex min-w-0 max-w-[220px] flex-1 flex-col gap-3 text-[14.5px]">
                  {m.parts.map((p) => (
                    <li key={p.key}>
                      <LegendRow color={p.color} label={p.label} value={`${p.value}%`} href={p.href} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        ))}
      </section>
    </div>
  );
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

function DriverCard({ title, items, color, ar, empty, hrefFor }: { title: string; items: Driver[]; color: string; ar: boolean; empty: string; hrefFor: (key: string) => string }) {
  const max = Math.max(1, ...items.map((d) => d.hits));
  return (
    <Panel>
      <PanelTitle className="mb-4">{title}</PanelTitle>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {items.map((d) => (
            <li key={d.key}>
              <Link prefetch={false} href={hrefFor(d.key)} className="group grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_40px] items-center gap-3.5 text-[14.5px]">
                <span className="truncate group-hover:text-muted">{ar ? d.labelAr : d.labelEn}</span>
                <DotBar max={max} segments={[{ value: d.hits, color }]} />
                <span className="text-end text-muted ltr-nums">{d.hits}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
