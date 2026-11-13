import { CompactMentions } from "./compact-list";
import { MetricNotes } from "@/components/metric-notes";
import { countUniqueMentions, uniqueMentionIds } from "@/lib/mention-query";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Search } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { mentionWhere } from "@/lib/analytics";
import { filtersFromParams, normalizeViewParams, parseSort, QUICK_VIEWS, quickView, sortOrder, viewWhere } from "@/lib/filters";
import { MentionCard } from "@/components/mention-card";
import { MentionsBrowser } from "./filter-bar";

const PAGE_SIZE = 20;

export default async function MentionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const T = t.mentionsV2;
  const sp = await searchParams;
  const legacy = normalizeViewParams(sp);
  if (legacy) redirect(`/mentions${legacy.size ? `?${legacy}` : ""}`);

  const view = quickView(sp);
  const sort = parseSort(sp.sort);
  const base = mentionWhere(filtersFromParams(user.organizationId, sp, user.id));
  const where = { AND: [base, viewWhere(view, user.id)] };
  const requested = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const [counts, monitors, topicRows, members] = await Promise.all([
    Promise.all(QUICK_VIEWS.map((v) => countUniqueMentions({ AND: [base, viewWhere(v, user.id)] }))),
    db.monitor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    db.topic.findMany({ where: { organizationId: user.organizationId } }),
    db.user.findMany({ where: { organizationId: user.organizationId, active: true, role: { not: "VIEWER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const total = counts[QUICK_VIEWS.indexOf(view)];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pages);
  const ids = await uniqueMentionIds(where, { orderBy: sortOrder(sort), skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const rows = await db.mention.findMany({
    where: { id: { in: ids }, organizationId: user.organizationId },
    orderBy: sortOrder(sort),
    take: PAGE_SIZE,
    include: { monitor: { select: { name: true } }, assignedTo: { select: { id: true, name: true, email: true } } },
  });

  const topicLabels = new Map(topicRows.map((r) => [r.key, { en: r.labelEn, ar: r.labelAr }]));
  const topic = sp.topic ? topicLabels.get(sp.topic) : undefined;
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const plural = new Intl.PluralRules(locale === "ar" ? "ar" : "en").select(total) as keyof typeof T.noun;
  const pageHref = (p: number) => {
    const next = new URLSearchParams(sp);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `/mentions${next.size ? `?${next}` : ""}`;
  };
  const exportQs = new URLSearchParams(sp);
  exportQs.delete("page");
  const canAct = hasRole(user, "ANALYST");
  const compact = sp.display === "list";
  const displayHref = (display: string) => `/mentions?${new URLSearchParams({ ...sp, display })}`;
  // "Nothing is assigned to you" only when the view itself is empty, not when a filter emptied it.
  const narrowed = ["q", "platform", "sentiment", "monitor", "dialect", "intent", "status", "sarcasm", "topic"].some((k) => sp[k]);
  const empty = view === "mine" && !narrowed ? T.emptyMine : T.empty;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="flex items-center justify-between gap-5">
        <h1 className="text-[24px] font-semibold leading-tight md:text-[28px]">{t.mentions.title}</h1>
        <a href={`/api/export${exportQs.size ? `?${exportQs}` : ""}`} download className="btn-secondary h-10 px-4 text-[14px]">
          <Download className="h-4 w-4" strokeWidth={1.7} /> {t.common.export}
        </a>
      </header>

      <div className="mt-4 flex gap-4 text-sm text-muted"><Link href={displayHref("cards")} aria-current={!compact ? "page" : undefined} className={!compact ? "font-semibold text-ink" : ""}>{locale === "ar" ? "بطاقات" : "Cards"}</Link><Link href={displayHref("list")} aria-current={compact ? "page" : undefined} className={compact ? "font-semibold text-ink" : ""}>{locale === "ar" ? "قائمة مختصرة" : "Compact list"}</Link></div>
      <MetricNotes locale={locale} />
      <MentionsBrowser
        tabs={QUICK_VIEWS.map((k, i) => ({ key: k, label: T.quick[k], count: nf.format(counts[i]) }))}
        activeTab={view}
        total={nf.format(total)}
        noun={T.noun[plural] ?? T.noun.other}
        monitors={monitors.map((m) => ({ value: m.id, label: m.name }))}
        platforms={Object.entries(t.platforms).map(([value, label]) => ({ value, label: label.replace(/\s*\(.*\)$/, "") }))}
        sentiments={(["POSITIVE", "NEUTRAL", "NEGATIVE"] as const).map((value) => ({ value, label: t.sentiment[value] }))}
        periods={Object.entries(T.periods).map(([value, label]) => ({ value, label }))}
        dialects={Object.entries(t.dialects).map(([value, label]) => ({ value, label }))}
        intents={Object.entries(t.intents).map(([value, label]) => ({ value, label }))}
        statuses={Object.entries(t.mentions.status).map(([value, label]) => ({ value, label }))}
        sorts={Object.entries(T.sorts).map(([value, label]) => ({ value, label }))}
        topicLabel={sp.topic ? (topic ? (locale === "ar" ? topic.ar : topic.en) : sp.topic) : undefined}
        labels={{
          quickLabel: T.quickLabel,
          search: t.mentions.searchPlaceholder,
          searchLabel: T.search,
          platform: T.platform,
          allPlatforms: t.mentions.allPlatforms,
          sentiment: T.sentiment,
          anySentiment: t.mentions.allSentiment,
          period: T.period,
          more: T.more,
          monitor: T.monitor,
          dialect: T.dialect,
          intent: T.intent,
          status: T.status,
          topic: T.topic,
          any: T.any,
          all: T.all,
          only: T.only,
          sarcastic: T.sarcastic,
          sarcasticOnly: T.sarcasticOnly,
          clear: T.clear,
          clearAll: T.clearAll,
          removeFilter: T.removeFilter,
          sort: T.sort,
        }}
      >
        {rows.length > 0 ? (
          <>
            {compact ? <CompactMentions key={rows.map(r => `${r.id}:${r.assignedToId}:${r.status}`).join(",")} rows={rows.map(r => ({ id: r.id, author: r.authorName ?? r.authorHandle ?? "—", platform: t.platforms[r.platform], text: r.text, sentiment: r.sentiment ? t.sentiment[r.sentiment] : "—", assigned: r.assignedTo?.name ?? "", date: new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { day: "numeric", month: "short", timeZone: user.organization.timezone }).format(r.publishedAt) }))} members={members} locale={locale} canAct={canAct} /> : <ul className="mt-3.5 flex flex-col gap-2.5">
              {rows.map((m) => (
                <li key={m.id}>
                  <MentionCard m={m} t={t} locale={locale} topicLabels={topicLabels} canAct={canAct} members={members} />
                </li>
              ))}
            </ul>}
            {pages > 1 && (
              <nav aria-label={T.pages} className="mt-5 flex items-center justify-between gap-4">
                <span className="text-[13.5px] text-faint tnum">{fmt(t.mentions.pageOf, { page: nf.format(page), pages: nf.format(pages) })}</span>
                <div className="flex gap-2">
                  <PageLink href={pageHref(page - 1)} disabled={page <= 1} label={t.mentions.prev} />
                  <PageLink href={pageHref(page + 1)} disabled={page >= pages} label={t.mentions.nextPage} />
                </div>
              </nav>
            )}
          </>
        ) : (
          <div className="mt-3.5 flex flex-col items-center rounded-[20px] bg-surface px-6 py-[72px] text-center">
            <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-sunken">
              <Search className="h-5 w-5 text-muted" strokeWidth={1.6} />
            </span>
            <h2 className="mt-[18px] text-[17px] font-semibold">{empty.title}</h2>
            <p className="mt-1.5 max-w-[380px] text-[14.5px] leading-relaxed text-muted">{empty.body}</p>
            <Link href="/mentions" prefetch={false} className="btn-secondary mt-5 h-10 px-4 text-[14px]">
              {empty.cta}
            </Link>
          </div>
        )}
      </MentionsBrowser>
    </div>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  const cls = "inline-flex h-9 items-center rounded-[10px] border border-line px-3.5 text-[14px] transition-colors";
  return disabled ? (
    <span aria-disabled className={`${cls} text-faint`}>
      {label}
    </span>
  ) : (
    <Link href={href} prefetch={false} className={`${cls} font-medium text-ink hover:bg-sunken`}>
      {label}
    </Link>
  );
}
