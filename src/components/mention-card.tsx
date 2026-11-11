import Link from "next/link";
import type { Mention, Platform } from "@prisma/client";
import { BadgeCheck, ExternalLink, Eye, Heart, MessageCircle, Repeat2, Reply, ShieldAlert } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import type { Translation } from "@/lib/ai/engage";
import { PlatformIcon } from "./platform";
import { SentimentBadge } from "./sentiment";
import { MentionActions } from "./mention-actions";
import { TranslateButton } from "./translate-button";
import { DialectBadge, IntentBadge, SarcasmBadge, SlangChips } from "./dialect-badges";
import { Avatar } from "./avatar";

export type MentionRow = Pick<
  Mention,
  | "id" | "platform" | "text" | "url" | "publishedAt" | "authorHandle" | "authorName" | "authorFollowers" | "authorVerified"
  | "likes" | "comments" | "shares" | "views" | "sentiment" | "topics" | "isRisk" | "riskReason" | "status" | "lang" | "enrichedAt"
  | "dialect" | "intent" | "sarcasm" | "slang" | "translation" | "repliedAt" | "note"
> & { monitor?: { name: string }; assignedTo?: { name: string; email: string } | null };

const Dot = () => <span className="text-line-strong">·</span>;

export function MentionCard({
  m,
  t,
  locale,
  topicLabels,
  canAct,
  compact,
  className,
}: {
  m: MentionRow;
  t: Dict;
  locale: string;
  topicLabels: Map<string, { en: string; ar: string }>;
  canAct?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const slang = (Array.isArray(m.slang) ? m.slang : []) as { term: string; gloss: string }[];
  const showTranslate = m.dialect !== "ENGLISH" && (m.lang === "ar" || Boolean(m.dialect));
  const name = m.authorName ?? m.authorHandle ?? "—";
  const text = compact && m.text.length > 220 ? `${m.text.slice(0, 220)}…` : m.text.length > 700 ? `${m.text.slice(0, 700)}…` : m.text;

  return (
    <article className={cn("card group/m p-4 transition-colors hover:border-line-strong", m.status === "REVIEWED" && "bg-surface/70", className)}>
      <header className="flex items-start gap-3">
        <Avatar name={name} seed={m.authorHandle ?? name} size={compact ? 30 : 36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px]">
            <span className="truncate font-semibold">{name}</span>
            {m.authorVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-info" aria-label="verified" />}
            {m.authorHandle && !compact && <span className="truncate text-muted ltr-nums">@{m.authorHandle}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-faint">
            <PlatformIcon platform={m.platform as Platform} size="xs" title={t.platforms[m.platform]} />
            <span>{timeAgo(m.publishedAt, locale)}</span>
            {m.authorFollowers ? (
              <>
                <Dot />
                <span>
                  <span className="ltr-nums">{formatNumber(m.authorFollowers, locale)}</span> {t.overview.followers}
                </span>
              </>
            ) : null}
            {m.monitor && !compact && (
              <>
                <Dot />
                <span className="text-muted">{m.monitor.name}</span>
              </>
            )}
          </div>
        </div>
        {m.assignedTo && (
          <span title={m.assignedTo.name}>
            <Avatar name={m.assignedTo.name} seed={m.assignedTo.email} size={22} />
          </span>
        )}
      </header>

      <p dir="auto" className={cn("mt-3 whitespace-pre-line leading-relaxed", compact ? "text-[13.5px]" : "text-[14.5px]")}>
        {text}
      </p>

      {m.isRisk && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border-s-2 border-neg bg-neg/[0.05] px-3 py-2 text-xs text-neg">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <b className="font-semibold">{t.mentions.risk}</b>
            {m.riskReason ? `: ${m.riskReason}` : ""}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {m.enrichedAt ? (
          <>
            <SentimentBadge sentiment={m.sentiment} label={m.sentiment ? t.sentiment[m.sentiment] : ""} />
            {m.intent && m.intent !== "OTHER" && <IntentBadge intent={m.intent} label={t.intents[m.intent]} />}
            {m.sarcasm && <SarcasmBadge label={t.engage.sarcasm} help={t.engage.sarcasmHelp} />}
            {m.dialect && <DialectBadge dialect={m.dialect} label={t.dialects[m.dialect]} />}
            {!compact &&
              m.topics.map((k) => {
                const l = topicLabels.get(k);
                return (
                  <Link key={k} prefetch={false} href={`/mentions?topic=${k}`} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                    #{l ? (locale === "ar" ? l.ar : l.en) : k}
                  </Link>
                );
              })}
          </>
        ) : (
          <span className="text-xs text-faint">{t.mentions.analyzing}</span>
        )}
      </div>

      {!compact && slang.length > 0 && <SlangChips items={slang} />}
      {m.note && (
        <p className="mt-3 rounded-lg bg-sand-50 px-3 py-2 text-xs text-sand-700" dir="auto">
          {m.note}
        </p>
      )}

      <footer className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-3.5 text-xs text-faint ltr-nums">
          <span className="flex items-center gap-1" title={t.mentions.likes}>
            <Heart className="h-3.5 w-3.5" /> {formatNumber(m.likes, locale)}
          </span>
          <span className="flex items-center gap-1" title={t.mentions.commentsN}>
            <MessageCircle className="h-3.5 w-3.5" /> {formatNumber(m.comments, locale)}
          </span>
          <span className="flex items-center gap-1" title={t.mentions.sharesN}>
            <Repeat2 className="h-3.5 w-3.5" /> {formatNumber(m.shares, locale)}
          </span>
          {m.views > 0 && (
            <span className="flex items-center gap-1" title={t.mentions.views}>
              <Eye className="h-3.5 w-3.5" /> {formatNumber(m.views, locale)}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-0.5">
          {!compact && canAct && !m.repliedAt && (
            <Link prefetch={false} href={`/inbox?m=${m.id}`} className="btn-ghost btn-sm">
              <Reply className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t.engage.reply}
            </Link>
          )}
          {!compact && showTranslate && (
            <TranslateButton
              id={m.id}
              cached={m.translation ? (JSON.parse(m.translation) as Translation) : null}
              labels={{ translate: t.engage.translate, hide: t.engage.hideTranslation, translating: t.engage.translating, meaning: t.engage.meaning, aiOff: t.engage.aiOff }}
            />
          )}
          {canAct && (
            <MentionActions
              id={m.id}
              status={m.status}
              labels={{ ...t.mentions.status, markReviewed: t.mentions.markReviewed, flag: t.mentions.flag, archive: t.mentions.archive }}
            />
          )}
          {m.url && (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm w-7 px-0" title={t.mentions.open} aria-label={t.mentions.open}>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </footer>
    </article>
  );
}
