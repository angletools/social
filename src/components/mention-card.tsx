import Link from "next/link";
import type { Intent, Mention, Platform, Sentiment } from "@prisma/client";
import { BadgeCheck, Check, ExternalLink, Eye, Flag, Heart, MessageCircle, Repeat2, Reply, ShieldAlert } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import { cn, formatDate, formatNumber, timeShort } from "@/lib/utils";
import type { Translation } from "@/lib/ai/engage";
import { PlatformIcon } from "./platform";
import { SlangChips } from "./dialect-badges";
import { SolidAvatar } from "./avatar";
import { MentionCardActions } from "./mention-card-actions";

export type MentionRow = Pick<
  Mention,
  | "id" | "platform" | "text" | "url" | "publishedAt" | "authorHandle" | "authorName" | "authorFollowers" | "authorVerified"
  | "likes" | "comments" | "shares" | "views" | "sentiment" | "topics" | "isRisk" | "riskReason" | "status" | "lang" | "enrichedAt"
  | "dialect" | "intent" | "sarcasm" | "slang" | "translation" | "repliedAt" | "note"
> & { monitor?: { name: string }; assignedTo?: { id?: string; name: string; email: string } | null };

/** Intent colours: the dot and text take the colour, the pill a light tint of it. */
export const INTENT_TONE: Partial<Record<Intent, string>> = {
  COMPLAINT: "var(--color-orange)",
  QUESTION: "var(--color-info)",
  PRAISE: "var(--color-pos)",
  CHURN_RISK: "var(--color-neg)",
  SUGGESTION: "var(--color-plum)",
  PURCHASE_INTENT: "var(--color-pos)",
};
export const SENTIMENT_DOT: Record<Sentiment, string> = { POSITIVE: "var(--color-pos)", NEUTRAL: "var(--color-faint)", NEGATIVE: "var(--color-neg)" };

const Dot = () => <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-faint" aria-hidden />;
/** "X (Twitter)" reads as "X" in dense rows. */
export const shortPlatform = (label: string) => label.replace(/\s*\(.*\)$/, "");

export function IntentPill({ intent, label }: { intent: Intent; label: string }) {
  const c = INTENT_TONE[intent] ?? "var(--color-muted)";
  return (
    <span
      className="inline-flex h-[26px] shrink-0 items-center gap-[7px] rounded-lg px-2.5 text-[13px] font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 11%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

export function SentimentDot({ sentiment, label }: { sentiment: Sentiment; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[7px] text-muted">
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: SENTIMENT_DOT[sentiment] }} aria-hidden />
      {label}
    </span>
  );
}

export function MentionCard({
  m,
  t,
  locale,
  topicLabels,
  canAct,
  compact,
  className,
  members,
}: {
  m: MentionRow;
  t: Dict;
  locale: string;
  topicLabels: Map<string, { en: string; ar: string }>;
  canAct?: boolean;
  compact?: boolean;
  className?: string;
  /** Teammates for the Assign menu; without it the assignee is shown read-only. */
  members?: { id: string; name: string }[];
}) {
  const T = t.mentionsV2;
  const slang = (Array.isArray(m.slang) ? m.slang : []) as { term: string; gloss: string }[];
  const translatable = !compact && m.dialect !== "ENGLISH" && (m.lang === "ar" || Boolean(m.dialect));
  const name = m.authorName ?? m.authorHandle ?? "?";
  const text = compact && m.text.length > 220 ? `${m.text.slice(0, 220)}…` : m.text.length > 700 ? `${m.text.slice(0, 700)}…` : m.text;
  const n = (v: number) => formatNumber(v, locale);
  const assignee = m.assignedTo ? { id: m.assignedTo.id ?? m.assignedTo.email, name: m.assignedTo.name } : null;
  let cached: Translation | null = null;
  try {
    cached = m.translation ? (JSON.parse(m.translation) as Translation) : null;
  } catch {
    cached = null;
  }

  return (
    <article
      className={cn(
        "grid grid-cols-[40px_minmax(0,1fr)] gap-x-3.5 rounded-[20px] bg-surface px-4 pb-4 pt-5 sm:px-6",
        compact && "grid-cols-[32px_minmax(0,1fr)] gap-x-3",
        m.status === "REVIEWED" && "bg-surface/70",
        className,
      )}
    >
      <SolidAvatar name={name} seed={m.authorHandle ?? name} size={compact ? 32 : 40} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 text-[14.5px] leading-5">
          <span dir="auto" className="min-w-0 truncate font-semibold">{name}</span>
          {m.authorVerified && <BadgeCheck className="h-[15px] w-[15px] shrink-0 fill-info text-surface" aria-label={T.verified} />}
          {m.authorHandle && !compact && (
            <span dir="ltr" className="min-w-0 shrink truncate text-faint">
              @{m.authorHandle}
            </span>
          )}
          {m.status === "FLAGGED" && (
            <span className="ms-1 inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-sand-700">
              <Flag className="h-3 w-3 fill-current" /> {T.flagged}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] leading-[18px] text-faint">
          <PlatformIcon platform={m.platform as Platform} size="xs" title={t.platforms[m.platform]} className="[&_svg]:fill-muted" />
          <span className="max-sm:hidden">{shortPlatform(t.platforms[m.platform])}</span>
          <Dot />
          <time dateTime={new Date(m.publishedAt).toISOString()} title={formatDate(m.publishedAt, locale, { dateStyle: "medium", timeStyle: "short" })}>
            {timeShort(m.publishedAt, locale)}
          </time>
          {m.authorFollowers ? (
            <>
              <Dot />
              <span>
                <span className="ltr-nums">{n(m.authorFollowers)}</span> {m.authorFollowers === 1 ? t.inbox.follower : t.overview.followers}
              </span>
            </>
          ) : null}
          {m.monitor && !compact && (
            <>
              <Dot />
              <span dir="auto" className="min-w-0 truncate text-muted">{m.monitor.name}</span>
            </>
          )}
        </div>

        <p dir="auto" className={cn("mt-3 max-w-[860px] whitespace-pre-line leading-[1.75] [overflow-wrap:anywhere]", compact ? "text-[14px]" : "text-[15px]")}>
          {text}
        </p>

        {m.isRisk && (
          <div
            className="mt-2.5 inline-flex min-h-[30px] items-start gap-2 rounded-[9px] py-1.5 pe-3 ps-2.5 text-[13px] leading-[18px] text-neg"
            style={{ background: "color-mix(in srgb, var(--color-neg) 9%, transparent)" }}
          >
            <ShieldAlert className="mt-px h-[15px] w-[15px] shrink-0" strokeWidth={1.7} />
            <span>
              <b className="font-semibold">{t.mentions.risk}</b>
              {m.riskReason ? <> · {m.riskReason}</> : null}
            </span>
          </div>
        )}

        {!compact && slang.length > 0 && <SlangChips items={slang} />}
        {m.note && (
          <p className="mt-3 rounded-lg bg-sand-50 px-3 py-2 text-xs text-sand-700" dir="auto">
            {m.note}
          </p>
        )}

        <MentionCardActions
          id={m.id}
          status={m.status}
          assignee={assignee}
          members={members}
          canAct={canAct && !compact}
          translatable={translatable}
          cached={cached}
          labels={{
            assign: T.assign,
            assignedTo: T.assignedTo,
            more: T.moreActions,
            translate: t.engage.translate,
            hideTranslation: t.engage.hideTranslation,
            translating: t.engage.translating,
            meaning: t.engage.meaning,
            aiOff: t.engage.aiOff,
            markReviewed: t.mentions.markReviewed,
            reviewed: t.mentions.status.REVIEWED,
            flag: t.mentions.flag,
            flagged: T.flagged,
            archive: t.mentions.archive,
          }}
          after={
            m.url ? (
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-muted transition-colors hover:bg-sunken hover:text-ink max-md:h-10 max-md:w-10"
                title={t.mentions.open}
                aria-label={t.mentions.open}
              >
                <ExternalLink className="h-[15px] w-[15px] rtl:-scale-x-100" strokeWidth={1.7} />
              </a>
            ) : null
          }
        >
          <div className="flex min-w-0 grow basis-full flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] lg:basis-0">
            {m.enrichedAt ? (
              <>
                {m.sentiment && <SentimentDot sentiment={m.sentiment} label={t.sentiment[m.sentiment]} />}
                {m.intent && m.intent !== "OTHER" && <IntentPill intent={m.intent} label={t.intents[m.intent]} />}
                {m.dialect && m.dialect !== "OTHER" && <span className="text-faint">{t.dialects[m.dialect]}</span>}
                {m.sarcasm && (
                  <span className="text-plum" title={t.engage.sarcasmHelp}>
                    {t.engage.sarcasm}
                  </span>
                )}
                {!compact &&
                  m.topics.slice(0, 3).map((k) => {
                    const l = topicLabels.get(k);
                    return (
                      <Link key={k} prefetch={false} href={`/mentions?topic=${encodeURIComponent(k)}`} className="text-faint underline-offset-4 hover:text-ink hover:underline">
                        #{l ? (locale === "ar" ? l.ar : l.en) : k}
                      </Link>
                    );
                  })}
              </>
            ) : (
              <span className="text-faint">{t.mentions.analyzing}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3.5 text-[13px] text-faint tnum max-lg:me-auto">
            <span className="inline-flex items-center gap-[5px]" title={t.mentions.likes}>
              <Heart className="h-3.5 w-3.5" strokeWidth={1.7} /> <span className="ltr-nums">{n(m.likes)}</span>
            </span>
            <span className="inline-flex items-center gap-[5px]" title={t.mentions.commentsN}>
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.7} /> <span className="ltr-nums">{n(m.comments)}</span>
            </span>
            <span className="inline-flex items-center gap-[5px]" title={t.mentions.sharesN}>
              <Repeat2 className="h-3.5 w-3.5" strokeWidth={1.7} /> <span className="ltr-nums">{n(m.shares)}</span>
            </span>
            {m.views > 0 && (
              <span className="inline-flex items-center gap-[5px] max-sm:hidden" title={t.mentions.views}>
                <Eye className="h-3.5 w-3.5" strokeWidth={1.7} /> <span className="ltr-nums">{n(m.views)}</span>
              </span>
            )}
          </div>
          {!compact && <span aria-hidden className="hidden h-[18px] w-px shrink-0 bg-line lg:block" />}
          {!compact &&
            (m.repliedAt ? (
              <span className="inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[13.5px] text-faint">
                <Check className="h-[15px] w-[15px]" strokeWidth={1.8} /> {T.replied}
              </span>
            ) : canAct ? (
              <Link
                prefetch={false}
                href={`/inbox?m=${m.id}`}
                className="-me-1 inline-flex h-8 shrink-0 items-center gap-[7px] rounded-[9px] px-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-sunken max-md:h-10"
              >
                <Reply className="h-[15px] w-[15px] rtl:-scale-x-100" strokeWidth={1.7} /> {t.engage.reply}
              </Link>
            ) : null)}
        </MentionCardActions>
      </div>
    </article>
  );
}
