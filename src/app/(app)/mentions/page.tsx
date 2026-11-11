import Link from "next/link";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { mentionWhere } from "@/lib/analytics";
import { filtersFromParams } from "@/lib/filters";
import { PageHeader } from "@/components/ui";
import { MentionCard } from "@/components/mention-card";
import { FilterBar } from "./filter-bar";

const PAGE_SIZE = 20;

export default async function MentionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const filters = filtersFromParams(user.organizationId, sp, user.id);
  const page = Math.max(1, Number(sp.page) || 1);
  const where = mentionWhere(filters);

  const [total, rows, monitors, topicRows] = await Promise.all([
    db.mention.count({ where }),
    db.mention.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { monitor: { select: { name: true } }, assignedTo: { select: { name: true, email: true } } },
    }),
    db.monitor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } }),
    db.topic.findMany({ where: { organizationId: user.organizationId } }),
  ]);
  const topicLabels = new Map(topicRows.map((r) => [r.key, { en: r.labelEn, ar: r.labelAr }]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/mentions?${new URLSearchParams({ ...sp, page: String(p) })}`;
  const topic = filters.topic ? topicLabels.get(filters.topic) : undefined;

  return (
    <>
      <PageHeader title={t.mentions.title} subtitle={`${t.mentions.subtitle} · ${formatNumber(total, locale)}`} />
      <FilterBar
        monitors={monitors.map((m) => ({ value: m.id, label: m.name }))}
        platforms={Object.entries(t.platforms).map(([value, label]) => ({ value, label }))}
        statuses={Object.entries(t.mentions.status).map(([value, label]) => ({ value, label }))}
        ranges={Object.entries(t.common.range).map(([value, label]) => ({ value, label }))}
        dialects={Object.entries(t.dialects).map(([value, label]) => ({ value, label }))}
        intents={Object.entries(t.intents).map(([value, label]) => ({ value, label }))}
        quick={t.quick}
        topicLabel={filters.topic ? (topic ? (locale === "ar" ? topic.ar : topic.en) : filters.topic) : undefined}
        labels={{
          search: t.mentions.searchPlaceholder,
          allMonitors: t.mentions.allMonitors,
          allPlatforms: t.mentions.allPlatforms,
          allSentiment: t.mentions.allSentiment,
          onlyRisks: t.mentions.onlyRisks,
          export: t.common.export,
          all: t.common.all,
          allDialects: t.engage.allDialects,
          allIntents: t.engage.allIntents,
          onlySarcasm: t.engage.onlySarcasm,
        }}
      />
      <div className="space-y-3">
        {rows.map((m) => (
          <MentionCard key={m.id} m={m} t={t} locale={locale} topicLabels={topicLabels} canAct={hasRole(user, "ANALYST")} />
        ))}
        {rows.length === 0 && <div className="card px-6 py-16 text-center text-[13.5px] text-muted">{t.mentions.empty}</div>}
      </div>
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm">
          <Link aria-disabled={page <= 1} href={pageHref(page - 1)} className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>
            {t.mentions.prev}
          </Link>
          <span className="text-[13px] text-muted">{fmt(t.mentions.pageOf, { page, pages })}</span>
          <Link aria-disabled={page >= pages} href={pageHref(page + 1)} className={`btn-secondary ${page >= pages ? "pointer-events-none opacity-40" : ""}`}>
            {t.mentions.nextPage}
          </Link>
        </nav>
      )}
    </>
  );
}
