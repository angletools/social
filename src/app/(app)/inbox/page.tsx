import { ClassificationReview, HandoffNote } from "@/components/classification-review";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ExternalLink } from "lucide-react";
import type { Intent } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, guessLang, timeAgo, timeShort } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import type { Translation } from "@/lib/ai/engage";
import { getInboxPage } from "@/lib/inbox";
import { PlatformIcon } from "@/components/platform";
import { SolidAvatar } from "@/components/avatar";
import { ReplyComposer } from "./reply-composer";
import { AssignSelect } from "./assign-select";
import { Queue, type QueueItem } from "./queue";
import { Meaning } from "./meaning";
import { CaughtUp } from "@/components/states";
import { dayStart } from "@/lib/workspace";

const TONE: Partial<Record<Intent, QueueItem["tone"]>> = { CHURN_RISK: "neg", COMPLAINT: "warn", QUESTION: "info", PURCHASE_INTENT: "pos" };
const PILL_TONE: Record<QueueItem["tone"], string> = {
  neg: "bg-neg/10 text-neg",
  warn: "bg-warn/12 text-warn",
  info: "bg-info/10 text-info",
  pos: "bg-pos/10 text-pos",
  faint: "bg-sunken text-muted",
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ m?: string; who?: string; page?: string; scope?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { m: selectedId, who, page: pageParam, scope } = await searchParams;
  const allMonitors = scope === "all";
  const mine = who === "me";
  const orgId = user.organizationId;
  const include = { assignedTo: { select: { id: true, name: true } } } as const;

  const [result, members] = await Promise.all([
    getInboxPage(orgId, { userId: mine ? user.id : undefined, allMonitors, page: Number(pageParam ?? 1) }),
    db.user.findMany({ where: { organizationId: orgId, active: true, role: { not: "VIEWER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const queue = result.items;
  const waitingCount = result.total;
  const href = (changes: Record<string, string> = {}) => `/inbox?${new URLSearchParams({ ...(mine && { who: "me" }), ...(allMonitors && { scope: "all" }), page: String(result.page), ...changes })}`;
  const scopeControls = <div className="flex gap-4 px-6 py-2 text-xs text-muted"><Link href={href({ scope: "own", page: "1" })} aria-current={!allMonitors ? "page" : undefined} className={!allMonitors ? "font-semibold text-ink" : ""}>{t.inbox.ownBrand}</Link><Link href={href({ scope: "all", page: "1" })} aria-current={allMonitors ? "page" : undefined} className={allMonitors ? "font-semibold text-ink" : ""}>{t.inbox.allMonitors}</Link></div>;
  const pagination = result.pages > 1 ? <nav aria-label={t.inbox.pages} className="flex items-center justify-between border-t border-line px-6 py-3 text-sm">{result.page > 1 ? <Link href={href({ page: String(result.page - 1) })}>{t.common.prev}</Link> : <span />}<span className="text-muted">{result.page} / {result.pages}</span>{result.page < result.pages ? <Link href={href({ page: String(result.page + 1) })}>{t.common.next}</Link> : <span />}</nav> : null;

  const selected =
    (selectedId &&
      (queue.find((q) => q.id === selectedId) ?? (await db.mention.findFirst({ where: { id: selectedId, organizationId: orgId }, include })))) ||
    queue[0] ||
    null;
  const captureIds = selected ? (await db.mention.findMany({ where: { organizationId: orgId, platform: selected.platform, externalId: selected.externalId }, select: { id: true } })).map(m => m.id) : [];
  const replies = selected ? await db.replyDraft.findMany({ where: { organizationId: orgId, mentionId: { in: captureIds } }, orderBy: { createdAt: "desc" } }) : [];
  const canAct = hasRole(user, "ANALYST");
  const activity = selected ? await db.auditLog.findMany({ where: { organizationId: orgId, target: { in: captureIds }, action: { startsWith: "mention." } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 }) : [];
  const authors = await db.user.findMany({ where: { organizationId: orgId, id: { in: activity.flatMap(a => a.userId ? [a.userId] : []) } }, select: { id: true, name: true } });
  const base = `${href()}&`;
  const tone = (m: { intent: Intent | null; isRisk: boolean }): QueueItem["tone"] => (m.isRisk ? "neg" : (m.intent && TONE[m.intent]) || "faint");

  const items: QueueItem[] = queue.map((m) => ({
    id: m.id,
    name: m.authorName ?? m.authorHandle ?? "—",
    seed: m.authorHandle ?? m.authorName ?? m.id,
    when: timeShort(m.publishedAt, locale),
    text: m.text,
    tone: tone(m),
    assignee: m.assignedTo?.name ?? null,
  }));

  // Empty state: nothing waiting. Say so, with what the team got through today.
  if (queue.length === 0 && !selectedId) {
    const replied = await db.mention.findMany({
      where: { organizationId: orgId, repliedAt: { gte: dayStart(user.organization.timezone) }, ...(mine && { assignedToId: user.id }) },
      select: { publishedAt: true, repliedAt: true },
      take: 2000,
    });
    const mins = replied.map((r) => (r.repliedAt!.getTime() - r.publishedAt.getTime()) / 60000).filter((m) => m >= 0).sort((a, b) => a - b);
    const median = mins.length ? mins[Math.floor(mins.length / 2)] : null;
    const C = t.states.caughtUp;
    return (
      <div className="full-bleed flex min-h-[calc(100dvh-4rem)] flex-1 flex-col md:min-h-0">
        <div className="flex items-baseline justify-between gap-3 px-6 pt-7 pb-4 md:px-10">
          <h1 className="text-[24px] leading-tight font-semibold">{t.inbox.title}</h1>
          <span className="text-sm text-muted tnum">{fmt(t.inbox.waiting, { n: "0" })}</span>
        </div>
        <div role="tablist" className="flex gap-5 border-b border-line px-6 md:px-10">
          {[
            { label: t.inbox.everyone, href: href({ who: "all", page: "1" }), active: !mine },
            { label: t.inbox.mine, href: href({ who: "me", page: "1" }), active: mine },
          ].map((x) => (
            <Link key={x.href} role="tab" aria-selected={x.active} prefetch={false} href={x.href} className={cn("-mb-px flex h-11 items-center border-b-2 text-sm", x.active ? "border-ink font-semibold text-ink" : "border-transparent text-faint hover:text-ink")}>
              {x.label}
            </Link>
          ))}
        </div>
        {scopeControls}
        <CaughtUp
          title={C.title}
          body={C.body}
          stats={[
            ...(replied.length ? [{ value: formatNumber(replied.length, locale), label: C.replied }] : []),
            ...(median !== null ? [{ value: median < 90 ? fmt(C.min, { n: Math.max(1, Math.round(median)) }) : fmt(C.hours, { n: Math.round(median / 60) }), label: C.median }] : []),
          ]}
        />
      </div>
    );
  }

  const slang = selected && Array.isArray(selected.slang) ? (selected.slang as { term: string; gloss: string }[]) : [];
  const name = selected ? (selected.authorName ?? selected.authorHandle ?? "—") : "";
  const posted = replies.filter((r) => r.status === "POSTED");

  return (
    <div className="full-bleed flex min-h-[calc(100dvh-4rem)] flex-1 flex-col md:min-h-0 md:flex-row">
      <Queue
        controls={scopeControls}
        pagination={pagination}
        items={items}
        selectedId={selected?.id ?? null}
        base={base}
        title={t.inbox.title}
        waiting={fmt(t.inbox.waiting, { n: formatNumber(waitingCount, locale) })}
        empty={t.inbox.empty}
        hiddenOnPhone={Boolean(selectedId)}
        tabs={[
          { label: t.inbox.everyone, href: href({ who: "all", page: "1" }), active: !mine },
          { label: t.inbox.mine, href: href({ who: "me", page: "1" }), active: mine },
        ]}
      />

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col md:flex", selectedId ? "flex" : "hidden")}>
        {selected ? (
          <>
            <header className="flex min-h-[72px] items-center gap-3.5 border-b border-sunken px-5 py-3 md:h-[88px] md:px-10 md:py-0">
              <Link href={base.slice(0, -1)} className="btn-ghost -ms-2 h-11 w-11 px-0 md:hidden" aria-label={t.common.back}>
                <ArrowRight className="h-4 w-4 ltr:rotate-180" />
              </Link>
              <SolidAvatar name={name} seed={selected.authorHandle ?? selected.authorName ?? selected.id} size={40} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-[16px] leading-tight font-semibold">
                  <span dir="auto" className="min-w-0 truncate">{name}</span>
                  {selected.authorVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-info" aria-label="verified" />}
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight text-faint">
                  <PlatformIcon platform={selected.platform} size="xs" title={t.platforms[selected.platform]} />
                  {selected.authorHandle && <span className="truncate ltr-nums max-sm:hidden">@{selected.authorHandle}</span>}
                  {selected.authorFollowers ? (
                    <span className="shrink-0">
                      · <span className="ltr-nums">{formatNumber(selected.authorFollowers, locale)}</span> {selected.authorFollowers === 1 ? t.inbox.follower : t.inbox.followers}
                    </span>
                  ) : null}
                </div>
              </div>
              {(selected.intent || selected.isRisk) && (
                <span className={cn("hidden h-[30px] shrink-0 items-center gap-[7px] rounded-[9px] px-3 text-[13px] font-semibold sm:inline-flex", PILL_TONE[tone(selected)])}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {selected.intent ? t.intents[selected.intent] : t.inbox.reasonRisk}
                </span>
              )}
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border border-line text-muted transition-colors hover:text-ink max-md:h-11 max-md:w-11"
                  title={t.inbox.openPost}
                  aria-label={t.inbox.openPost}
                >
                  <ExternalLink className="h-[15px] w-[15px]" strokeWidth={1.7} />
                </a>
              )}
              {canAct && (
                <AssignSelect
                  key={selected.id}
                  mentionId={selected.id}
                  value={selected.assignedToId ?? ""}
                  label={t.inbox.assignTo}
                  buttonLabel={t.inbox.assign}
                  members={members.map((u) => ({ id: u.id, name: u.id === user.id ? `${u.name} (${t.common.you})` : u.name }))}
                />
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-5 pt-8 pb-6 md:px-10 md:pt-10">
              <div className="flex max-w-[760px] flex-col gap-[18px]">
                <p dir="auto" className="text-[19px] leading-[1.8] [overflow-wrap:anywhere] md:text-[22px]">{selected.text}</p>
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13.5px] leading-5 text-muted">
                  <Meta>{timeAgo(selected.publishedAt, locale)}</Meta>
                  {selected.dialect && selected.dialect !== "OTHER" && <Meta dot>{t.dialects[selected.dialect]}</Meta>}
                  {selected.sarcasm && (
                    <Meta dot>
                      <span className="text-plum" title={t.engage.sarcasmHelp}>{t.engage.sarcasm}</span>
                    </Meta>
                  )}
                  {selected.isRisk && selected.riskReason && guessLang(selected.riskReason) === locale && (
                    <Meta dot>
                      <span className="text-neg">{selected.riskReason}</span>
                    </Meta>
                  )}
                  <Meaning
                    key={selected.id}
                    id={selected.id}
                    slang={slang}
                    cached={selected.translation ? (JSON.parse(selected.translation) as Translation) : null}
                    canTranslate={selected.dialect !== "ENGLISH" && (selected.lang === "ar" || Boolean(selected.dialect))}
                    labels={{ meaning: t.inbox.meaning, hide: t.inbox.hideMeaning, translate: t.engage.translate, translating: t.engage.translating, aiOff: t.engage.aiOff }}
                  />
                </div>
                <ClassificationReview key={`${selected.id}-${selected.classificationRevision}`} m={selected} t={t} locale={locale} canEdit={canAct} />
                <details className="border-t border-line pt-3 text-sm">
                  <summary className="cursor-pointer text-muted">{locale === "ar" ? "ملاحظات الفريق وسجل الإجراءات" : "Team notes and activity"}</summary>
                  <div className="mt-4 grid gap-3">
                    {canAct && <HandoffNote key={selected.id} id={selected.id} locale={locale} />}
                    {activity.map(a => { const meta = (a.meta ?? {}) as { text?: string; reason?: string; to?: string; status?: string }; return <div key={a.id} className="border-t border-line pt-3"><p className="text-xs text-faint">{authors.find(u => u.id === a.userId)?.name ?? (locale === "ar" ? "عضو سابق" : "Former teammate")} · {timeAgo(a.createdAt, locale)}</p><p dir="auto" className="mt-1 whitespace-pre-wrap break-words">{a.action === "mention.note" ? meta.text : a.action === "mention.correct" ? `${locale === "ar" ? "تصحيح" : "Correction"}: ${meta.reason}` : a.action === "mention.assign" ? `${locale === "ar" ? "إسناد" : "Assigned"}: ${meta.to ?? "—"}` : `${locale === "ar" ? "حالة" : "Status"}: ${meta.status ?? a.action}`}</p></div>; })}
                  </div>
                </details>
                {posted.length > 0 && (
                  <div className="flex flex-col gap-2 pt-4">
                    <p className="text-[13px] text-faint">{t.inbox.previous}</p>
                    {posted.map((p) => (
                      <p key={p.id} dir="auto" className="rounded-xl bg-surface px-4 py-3 text-[14.5px] leading-relaxed">
                        {p.text} <span className="text-xs text-faint">· {p.postedAt ? timeAgo(p.postedAt, locale) : ""}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {canAct && (
              <div className="bg-canvas px-5 pt-3 pb-4 max-md:sticky max-md:bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:px-10 md:pt-0 md:pb-8">
                <div className="max-w-[760px]">
                  <ReplyComposer
                    key={selected.id}
                    mentionId={selected.id}
                    url={selected.url}
                    canAct={canAct}
                    aiOn={aiEnabled()}
                    drafts={replies.filter((r) => r.status === "DRAFT").map((r) => ({ id: r.id, text: r.text }))}
                    t={t.inbox}
                    aiOffLabel={t.engage.aiOff}
                    replyingOn={fmt(t.inbox.replyingOn, { platform: t.platforms[selected.platform] })}
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

/** One item in the post's meta row, with a 3px dot separating it from the previous one. */
function Meta({ children, dot }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3.5">
      {dot && <span className="h-[3px] w-[3px] rounded-full bg-faint" aria-hidden />}
      {children}
    </span>
  );
}
