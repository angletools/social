import Link from "next/link";
import { Plus, Radar } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatNumber, timeAgo } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui";
import { PlatformIcon } from "@/components/platform";

export default async function MonitorsPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const monitors = await db.monitor.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } });
  const since = new Date(Date.now() - 86400_000);
  const counts = await db.mention.groupBy({
    by: ["monitorId"],
    where: { organizationId: user.organizationId, relevant: true, publishedAt: { gte: since } },
    _count: true,
  });
  const negCounts = await db.mention.groupBy({
    by: ["monitorId"],
    where: { organizationId: user.organizationId, relevant: true, publishedAt: { gte: since }, sentiment: "NEGATIVE" },
    _count: true,
  });
  const c24 = new Map(counts.map((c) => [c.monitorId, c._count]));
  const n24 = new Map(negCounts.map((c) => [c.monitorId, c._count]));
  const canEdit = hasRole(user, "ADMIN");

  return (
    <>
      <PageHeader
        title={t.monitors.title}
        actions={
          canEdit && (
            <Link href="/monitors/new" className="btn-primary">
              <Plus className="h-4 w-4" /> {t.monitors.new}
            </Link>
          )
        }
      />
      {monitors.length === 0 ? (
        <EmptyState icon={<Radar className="h-7 w-7" />} title={t.overview.emptyTitle} body={t.overview.emptyBody} cta={canEdit ? { href: "/monitors/new", label: t.overview.emptyCta } : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {monitors.map((m) => {
            const total = c24.get(m.id) ?? 0;
            const neg = n24.get(m.id) ?? 0;
            return (
              <Link key={m.id} href={`/monitors/${m.id}`} className="card group flex flex-col p-5 transition hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold group-hover:text-brand-700">{m.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.monitors.types[m.type]}
                      {m.isCompetitor && <> · {t.monitors.competitor}</>}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.status === "ACTIVE" ? "bg-pos/[0.07] text-pos" : "bg-sunken text-muted"}`}>
                    {m.status === "ACTIVE" ? t.common.active : t.common.paused}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {m.terms.slice(0, 4).map((term) => (
                    <span key={term} dir="auto" className="rounded-lg bg-canvas px-2 py-1 text-xs">{term}</span>
                  ))}
                  {m.terms.length > 4 && <span className="px-1 py-1 text-xs text-muted">+{m.terms.length - 4}</span>}
                </div>
                <div className="mt-auto flex items-end justify-between pt-5">
                  <div>
                    <div className="text-2xl font-semibold ltr-nums">{formatNumber(total, locale)}</div>
                    <div className="text-xs text-muted">
                      {t.monitors.mentions24h}
                      {neg > 0 && <span className="text-neg"> · <span className="ltr-nums">{neg}</span> {t.sentiment.NEGATIVE}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.platforms.map((p) => (
                      <PlatformIcon key={p} platform={p} size="sm" title={t.platforms[p]} />
                    ))}
                  </div>
                </div>
                <div className="mt-3 border-t border-line pt-3 text-xs text-muted">
                  {t.common.lastUpdated}: {m.lastSyncAt ? timeAgo(m.lastSyncAt, locale) : t.common.never}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
