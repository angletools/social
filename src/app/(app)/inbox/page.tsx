import Link from "next/link";
import { ArrowRight, BadgeCheck, ExternalLink } from "lucide-react";
import type { Intent } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import type { Translation } from "@/lib/ai/engage";
import { INBOX_INTENTS, inboxPriority } from "@/lib/analytics";
import { PlatformIcon } from "@/components/platform";
import { SolidAvatar } from "@/components/avatar";
import { ReplyComposer } from "./reply-composer";
import { AssignSelect } from "./assign-select";
import { Queue, type QueueItem } from "./queue";
import { Meaning } from "./meaning";

const TONE: Partial<Record<Intent, QueueItem["tone"]>> = { CHURN_RISK: "neg", COMPLAINT: "warn", QUESTION: "info", PURCHASE_INTENT: "pos" };
const TEXT_TONE: Record<QueueItem["tone"], string> = { neg: "text-neg", warn: "text-warn", info: "text-info", pos: "text-pos", faint: "text-muted" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ m?: string; who?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { m: selectedId, who } = await searchParams;
  const mine = who === "me";
  const orgId = user.organizationId;
  const include = { assignedTo: { select: { id: true, name: true } } } as const;

  const where = {
    organizationId: orgId,
    relevant: true,
    repliedAt: null,
    status: { not: "ARCHIVED" as const },
    publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
    OR: [{ intent: { in: INBOX_INTENTS } }, { isRisk: true }],
    ...(mine && { assignedToId: user.id }),
  };
  const [candidates, waitingCount, members] = await Promise.all([
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
      include,
    }),
    db.mention.count({ where }),
    db.user.findMany({ where: { organizationId: orgId, active: true, role: { not: "VIEWER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const queue = candidates
    .map((m) => ({ m, p: inboxPriority(m) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 60)
    .map((x) => x.m);

  const selected =
    (selectedId &&
      (queue.find((q) => q.id === selectedId) ?? (await db.mention.findFirst({ where: { id: selectedId, organizationId: orgId }, include })))) ||
    queue[0] ||
    null;
  const replies = selected ? await db.replyDraft.findMany({ where: { mentionId: selected.id }, orderBy: { createdAt: "desc" } }) : [];
  const canAct = hasRole(user, "ANALYST");
  const base = mine ? "/inbox?who=me&" : "/inbox?";
  const tone = (m: { intent: Intent | null; isRisk: boolean }): QueueItem["tone"] => (m.isRisk ? "neg" : (m.intent && TONE[m.intent]) || "faint");

  const items: QueueItem[] = queue.map((m) => ({
    id: m.id,
    name: m.authorName ?? m.authorHandle ?? "—",
    seed: m.authorHandle ?? m.authorName ?? m.id,
    when: timeAgo(m.publishedAt, locale),
    text: m.text,
    tone: tone(m),
    assignee: m.assignedTo?.name ?? null,
  }));

  const slang = selected && Array.isArray(selected.slang) ? (selected.slang as { term: string; gloss: string }[]) : [];
  const name = selected ? (selected.authorName ?? selected.authorHandle ?? "—") : "";
  const posted = replies.filter((r) => r.status === "POSTED");

  return (
    <div className="full-bleed flex min-h-[calc(100dvh-4rem)] flex-1 flex-col md:min-h-0 md:flex-row">
      <Queue
        items={items}
        selectedId={selected?.id ?? null}
        base={base}
        title={t.inbox.title}
        waiting={fmt(t.inbox.waiting, { n: formatNumber(waitingCount, locale) })}
        empty={t.inbox.empty}
        hiddenOnPhone={Boolean(selectedId)}
        tabs={[
          { label: t.inbox.everyone, href: "/inbox", active: !mine },
          { label: t.inbox.mine, href: "/inbox?who=me", active: mine },
        ]}
      />

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col md:flex", selectedId ? "flex" : "hidden")}>
        {selected ? (
          <>
            <header className="flex items-center gap-3.5 border-b border-sunken px-5 py-4 md:px-10 md:py-5">
              <Link href={base.slice(0, -1)} className="btn-ghost -ms-2 w-9 px-0 md:hidden" aria-label={t.common.back}>
                <ArrowRight className="h-4 w-4 ltr:rotate-180" />
              </Link>
              <SolidAvatar name={name} seed={selected.authorHandle ?? selected.authorName ?? selected.id} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[16px] font-semibold">
                  <span className="truncate">{name}</span>
                  {selected.authorVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-info" aria-label="verified" />}
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-faint">
                  <PlatformIcon platform={selected.platform} size="xs" title={t.platforms[selected.platform]} />
                  {selected.authorHandle && <span className="truncate ltr-nums">@{selected.authorHandle}</span>}
                  {selected.authorFollowers ? (
                    <span className="shrink-0">
                      · <span className="ltr-nums">{formatNumber(selected.authorFollowers, locale)}</span> {t.inbox.followers}
                    </span>
                  ) : null}
                </div>
              </div>
              {(selected.intent || selected.isRisk) && (
                <span className={cn("hidden text-[13px] font-medium sm:inline", TEXT_TONE[tone(selected)])}>
                  {selected.intent ? t.intents[selected.intent] : t.inbox.reasonRisk}
                </span>
              )}
              {selected.url && (
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="btn-ghost w-9 px-0" title={t.inbox.openPost} aria-label={t.inbox.openPost}>
                  <ExternalLink className="h-4 w-4" strokeWidth={1.6} />
                </a>
              )}
              {canAct && (
                <AssignSelect
                  key={selected.id}
                  mentionId={selected.id}
                  value={selected.assignedToId ?? ""}
                  label={t.inbox.assignTo}
                  members={members.map((u) => ({ id: u.id, name: u.id === user.id ? `${u.name} (${t.common.you})` : u.name }))}
                />
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-7 md:px-10 md:py-9">
              <div className="max-w-[760px] space-y-5">
                <p dir="auto" className="text-[20px] leading-[1.75] md:text-[23px]">{selected.text}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-muted">
                  <span>{timeAgo(selected.publishedAt, locale)}</span>
                  {selected.dialect && selected.dialect !== "OTHER" && <span>{t.dialects[selected.dialect]}</span>}
                  {selected.sarcasm && <span className="text-plum" title={t.engage.sarcasmHelp}>{t.engage.sarcasm}</span>}
                  {selected.isRisk && selected.riskReason && <span className="text-neg">{selected.riskReason}</span>}
                  <Meaning
                    key={selected.id}
                    id={selected.id}
                    slang={slang}
                    cached={selected.translation ? (JSON.parse(selected.translation) as Translation) : null}
                    canTranslate={selected.dialect !== "ENGLISH" && (selected.lang === "ar" || Boolean(selected.dialect))}
                    labels={{ meaning: t.inbox.meaning, hide: t.inbox.hideMeaning, translate: t.engage.translate, translating: t.engage.translating, aiOff: t.engage.aiOff }}
                  />
                </div>
                {posted.length > 0 && (
                  <div className="space-y-2 pt-4">
                    <p className="text-xs text-faint">{t.inbox.previous}</p>
                    {posted.map((p) => (
                      <p key={p.id} dir="auto" className="rounded-2xl bg-surface px-4 py-3 text-[14.5px] leading-relaxed">
                        {p.text} <span className="text-xs text-faint">· {p.postedAt ? timeAgo(p.postedAt, locale) : ""}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {canAct && (
              <div className="border-t border-sunken px-5 pt-4 pb-6 md:px-10">
                <div className="max-w-[840px]">
                  <ReplyComposer
                    key={selected.id}
                    mentionId={selected.id}
                    url={selected.url}
                    canAct={canAct}
                    aiOn={aiEnabled()}
                    drafts={replies.filter((r) => r.status === "DRAFT").map((r) => ({ id: r.id, text: r.text }))}
                    t={t.inbox}
                    aiOffLabel={t.engage.aiOff}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="m-auto p-10 text-center text-sm text-muted">{t.inbox.pick}</p>
        )}
      </section>
    </div>
  );
}
