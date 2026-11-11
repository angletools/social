import Link from "next/link";
import { Inbox, ShieldAlert } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import { INBOX_INTENTS, getInboxStats, inboxPriority } from "@/lib/analytics";
import { KpiCard, PageHeader } from "@/components/ui";
import { PlatformIcon } from "@/components/platform";
import { DialectBadge, IntentBadge } from "@/components/dialect-badges";
import { MentionCard } from "@/components/mention-card";
import { ReplyComposer } from "./reply-composer";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { m: selectedId } = await searchParams;
  const orgId = user.organizationId;

  const [stats, candidates, topicRows] = await Promise.all([
    getInboxStats(orgId),
    db.mention.findMany({
      where: {
        organizationId: orgId,
        relevant: true,
        repliedAt: null,
        status: { not: "ARCHIVED" },
        publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        OR: [{ intent: { in: INBOX_INTENTS } }, { isRisk: true }],
      },
      orderBy: { publishedAt: "desc" },
      take: 400,
      include: { monitor: { select: { name: true } } },
    }),
    db.topic.findMany({ where: { organizationId: orgId } }),
  ]);
  const queue = candidates
    .map((m) => ({ m, p: inboxPriority(m) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 60)
    .map((x) => x.m);

  const selected =
    (selectedId &&
      (queue.find((q) => q.id === selectedId) ??
        (await db.mention.findFirst({ where: { id: selectedId, organizationId: orgId }, include: { monitor: { select: { name: true } } } })))) ||
    queue[0] ||
    null;
  const replies = selected ? await db.replyDraft.findMany({ where: { mentionId: selected.id }, orderBy: { createdAt: "desc" } }) : [];
  const topicLabels = new Map(topicRows.map((r) => [r.key, { en: r.labelEn, ar: r.labelAr }]));
  const fmtMinutes = (n: number | null) =>
    n === null ? "—" : n < 90 ? fmt(t.inbox.minutes, { n }) : fmt(t.inbox.hours, { n: Math.round(n / 6) / 10 });

  return (
    <>
      <PageHeader title={t.inbox.title} subtitle={t.inbox.subtitle} />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <KpiCard label={t.inbox.awaiting} value={formatNumber(stats.awaiting, locale)} />
        <KpiCard label={t.inbox.repliedToday} value={formatNumber(stats.repliedToday, locale)} />
        <KpiCard label={t.inbox.medianResponse} value={fmtMinutes(stats.medianResponseMinutes)} />
      </div>

      {queue.length === 0 && !selected ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <Inbox className="mb-3 h-10 w-10 text-brand-600" />
          <p className="font-medium">{t.inbox.empty}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
          <ul className="card max-h-[75vh] divide-y divide-line overflow-y-auto">
            {queue.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/inbox?m=${m.id}`}
                  scroll={false}
                  className={cn("block px-4 py-3 transition hover:bg-canvas", selected?.id === m.id && "bg-brand-50/60 ring-2 ring-inset ring-brand-500")}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <PlatformIcon platform={m.platform} size="sm" />
                    <span className="truncate font-medium">{m.authorName ?? m.authorHandle}</span>
                    {m.authorFollowers ? <span className="text-muted ltr-nums">{formatNumber(m.authorFollowers, locale)}</span> : null}
                    <span className="ms-auto shrink-0 text-muted">{timeAgo(m.publishedAt, locale)}</span>
                  </div>
                  <p dir="auto" className="mt-1.5 line-clamp-2 text-sm">{m.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {m.isRisk && <ShieldAlert className="h-4 w-4 text-red-600" aria-label={t.inbox.reasonRisk} />}
                    {m.intent && <IntentBadge intent={m.intent} label={t.intents[m.intent]} />}
                    {m.dialect && <DialectBadge dialect={m.dialect} label={t.dialects[m.dialect]} />}
                    {m.sarcasm && <span className="text-xs">🙃</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="space-y-4">
            {selected ? (
              <>
                <MentionCard m={selected} t={t} locale={locale} topicLabels={topicLabels} />
                <ReplyComposer
                  key={selected.id}
                  mentionId={selected.id}
                  url={selected.url}
                  dialect={selected.dialect}
                  canAct={hasRole(user, "ANALYST")}
                  aiOn={aiEnabled()}
                  drafts={replies.filter((r) => r.status === "DRAFT").map((r) => ({ id: r.id, text: r.text, approach: r.approach, dialect: r.dialect }))}
                  posted={replies.filter((r) => r.status === "POSTED").map((r) => ({ id: r.id, text: r.text, when: r.postedAt ? timeAgo(r.postedAt, locale) : "" }))}
                  t={t.inbox}
                  dialectLabels={t.dialects}
                  aiOffLabel={t.engage.aiOff}
                />
              </>
            ) : (
              <p className="card p-10 text-center text-sm text-muted">{t.inbox.pick}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
