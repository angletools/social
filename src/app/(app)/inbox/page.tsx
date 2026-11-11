import Link from "next/link";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import { INBOX_INTENTS, getInboxStats, inboxPriority } from "@/lib/analytics";
import { KpiCard, PageHeader } from "@/components/ui";
import { PlatformIcon } from "@/components/platform";
import { IntentBadge } from "@/components/dialect-badges";
import { MentionCard } from "@/components/mention-card";
import { Avatar } from "@/components/avatar";
import { ReplyComposer } from "./reply-composer";
import { AssignSelect } from "./assign-select";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ m?: string; who?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { m: selectedId, who } = await searchParams;
  const mine = who === "me";
  const orgId = user.organizationId;

  const [stats, candidates, topicRows, members] = await Promise.all([
    getInboxStats(orgId),
    db.mention.findMany({
      where: {
        organizationId: orgId,
        relevant: true,
        repliedAt: null,
        status: { not: "ARCHIVED" },
        publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        OR: [{ intent: { in: INBOX_INTENTS } }, { isRisk: true }],
        ...(mine && { assignedToId: user.id }),
      },
      orderBy: { publishedAt: "desc" },
      take: 400,
      include: { monitor: { select: { name: true } }, assignedTo: { select: { id: true, name: true, email: true } } },
    }),
    db.topic.findMany({ where: { organizationId: orgId } }),
    db.user.findMany({ where: { organizationId: orgId, active: true, role: { not: "VIEWER" } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const queue = candidates
    .map((m) => ({ m, p: inboxPriority(m) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 60)
    .map((x) => x.m);
  const mineCount = mine ? queue.length : candidates.filter((c) => c.assignedToId === user.id).length;

  const selected =
    (selectedId &&
      (queue.find((q) => q.id === selectedId) ??
        (await db.mention.findFirst({
          where: { id: selectedId, organizationId: orgId },
          include: { monitor: { select: { name: true } }, assignedTo: { select: { id: true, name: true, email: true } } },
        })))) ||
    queue[0] ||
    null;
  const replies = selected ? await db.replyDraft.findMany({ where: { mentionId: selected.id }, orderBy: { createdAt: "desc" } }) : [];
  const topicLabels = new Map(topicRows.map((r) => [r.key, { en: r.labelEn, ar: r.labelAr }]));
  const fmtMinutes = (n: number | null) => (n === null ? "—" : n < 90 ? fmt(t.inbox.minutes, { n }) : fmt(t.inbox.hours, { n: Math.round(n / 6) / 10 }));
  const canAct = hasRole(user, "ANALYST");
  const base = mine ? "/inbox?who=me&" : "/inbox?";

  return (
    <>
      <PageHeader title={t.inbox.title} />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <KpiCard label={t.inbox.awaiting} value={formatNumber(stats.awaiting, locale)} />
        <KpiCard label={t.inbox.repliedToday} value={formatNumber(stats.repliedToday, locale)} />
        <KpiCard label={t.inbox.medianResponse} value={fmtMinutes(stats.medianResponseMinutes)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[23rem_1fr]">
        <div className="card flex max-h-[78vh] flex-col overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line p-2">
            {[
              { k: "all", label: t.inbox.everyone, href: "/inbox" },
              { k: "me", label: `${t.inbox.mine}${mineCount ? ` · ${mineCount}` : ""}`, href: "/inbox?who=me" },
            ].map((x) => (
              <Link
                key={x.k} prefetch={false} href={x.href}
                className={cn("h-8 rounded-lg px-3 text-[13px] leading-8", (x.k === "me") === mine ? "bg-sunken font-medium text-ink" : "text-muted hover:text-ink")}
              >
                {x.label}
              </Link>
            ))}
          </div>
          {queue.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <CheckCircle2 className="mb-3 h-8 w-8 text-brand-600" strokeWidth={1.5} />
              <p className="text-[13.5px] text-muted">{t.inbox.empty}</p>
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-line overflow-y-auto">
              {queue.map((m) => {
                const active = selected?.id === m.id;
                return (
                  <li key={m.id}>
                    <Link prefetch={false} href={`${base}m=${m.id}`}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cn("relative flex gap-3 px-4 py-3 transition-colors hover:bg-canvas", active && "bg-canvas")}
                    >
                      {active && <span className="absolute inset-y-0 start-0 w-[3px] bg-ink" />}
                      <Avatar name={m.authorName ?? m.authorHandle ?? "?"} seed={m.authorHandle ?? undefined} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="truncate font-medium text-ink">{m.authorName ?? m.authorHandle}</span>
                          <PlatformIcon platform={m.platform} size="xs" />
                          {m.authorFollowers ? <span className="text-faint ltr-nums">{formatNumber(m.authorFollowers, locale)}</span> : null}
                          <span className="ms-auto shrink-0 text-faint">{timeAgo(m.publishedAt, locale)}</span>
                        </div>
                        <p dir="auto" className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink/85">
                          {m.text}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          {m.isRisk && <ShieldAlert className="h-3.5 w-3.5 text-neg" aria-label={t.inbox.reasonRisk} />}
                          {m.intent && <IntentBadge intent={m.intent} label={t.intents[m.intent]} />}
                          {m.dialect && m.dialect !== "ENGLISH" && <span className="text-[11.5px] text-faint">{t.dialects[m.dialect]}</span>}
                          {m.assignedTo && (
                            <span className="ms-auto" title={m.assignedTo.name}>
                              <Avatar name={m.assignedTo.name} seed={m.assignedTo.email} size={18} />
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {selected ? (
            <>
              {canAct && (
                <div className="flex items-center justify-end gap-2 text-[13px] text-muted">
                  {t.inbox.assignTo}
                  <AssignSelect mentionId={selected.id} value={selected.assignedToId ?? ""} members={members.map((u) => ({ id: u.id, name: u.id === user.id ? `${u.name} (${t.common.you})` : u.name }))} />
                </div>
              )}
              <MentionCard m={selected} t={t} locale={locale} topicLabels={topicLabels} />
              <ReplyComposer
                key={selected.id}
                mentionId={selected.id}
                url={selected.url}
                dialect={selected.dialect}
                canAct={canAct}
                aiOn={aiEnabled()}
                drafts={replies.filter((r) => r.status === "DRAFT").map((r) => ({ id: r.id, text: r.text, approach: r.approach, dialect: r.dialect }))}
                posted={replies.filter((r) => r.status === "POSTED").map((r) => ({ id: r.id, text: r.text, when: r.postedAt ? timeAgo(r.postedAt, locale) : "" }))}
                t={t.inbox}
                dialectLabels={t.dialects}
                aiOffLabel={t.engage.aiOff}
              />
            </>
          ) : (
            <p className="card p-10 text-center text-[13.5px] text-muted">{t.inbox.pick}</p>
          )}
        </div>
      </div>
    </>
  );
}
