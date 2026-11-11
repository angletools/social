import type { Mention, Platform } from "@prisma/client";
import Link from "next/link";
import { BadgeCheck, ExternalLink, Heart, MessageCircle, Repeat2, ShieldAlert, Eye, Reply } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import { formatNumber, timeAgo } from "@/lib/utils";
import { PlatformIcon } from "./platform";
import { SentimentBadge } from "./sentiment";
import { MentionActions } from "./mention-actions";
import { TranslateButton } from "./translate-button";
import { DialectBadge, IntentBadge, SarcasmBadge, SlangChips } from "./dialect-badges";
import type { Translation } from "@/lib/ai/engage";

export type MentionRow = Pick<
  Mention,
  | "id" | "platform" | "text" | "url" | "publishedAt" | "authorHandle" | "authorName" | "authorFollowers" | "authorVerified"
  | "likes" | "comments" | "shares" | "views" | "sentiment" | "topics" | "isRisk" | "riskReason" | "status" | "lang" | "enrichedAt"
  | "dialect" | "intent" | "sarcasm" | "slang" | "translation" | "repliedAt" | "note"
> & { monitor?: { name: string } };

export function MentionCard({
  m,
  t,
  locale,
  topicLabels,
  canAct,
  compact,
}: {
  m: MentionRow;
  t: Dict;
  locale: string;
  topicLabels: Map<string, { en: string; ar: string }>;
  canAct?: boolean;
  compact?: boolean;
}) {
  const slang = (Array.isArray(m.slang) ? m.slang : []) as { term: string; gloss: string }[];
  const showTranslate = m.dialect !== "ENGLISH" && (m.lang === "ar" || m.dialect);
  return (
    <article className="card p-4 transition hover:border-slate-300">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={m.platform as Platform} title={t.platforms[m.platform]} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">{m.authorName ?? m.authorHandle}</span>
            {m.authorVerified && <BadgeCheck className="h-4 w-4 text-sky-500" />}
            {m.authorHandle && <span className="text-muted ltr-nums">@{m.authorHandle}</span>}
            {m.authorFollowers ? (
              <span className="text-xs text-muted">
                · <span className="ltr-nums">{formatNumber(m.authorFollowers, locale)}</span> {t.overview.followers}
              </span>
            ) : null}
            <span className="text-xs text-muted">· {timeAgo(m.publishedAt, locale)}</span>
            {m.monitor && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">{m.monitor.name}</span>}
          </div>
          <p dir="auto" className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">
            {m.text.length > 600 ? `${m.text.slice(0, 600)}…` : m.text}
          </p>
          {m.isRisk && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>{t.mentions.risk}</b>
                {m.riskReason ? ` — ${m.riskReason}` : ""}
              </span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {m.enrichedAt ? (
              <>
                <SentimentBadge sentiment={m.sentiment} label={m.sentiment ? t.sentiment[m.sentiment] : ""} />
                {m.sarcasm && <SarcasmBadge label={t.engage.sarcasm} help={t.engage.sarcasmHelp} />}
                {m.dialect && <DialectBadge dialect={m.dialect} label={t.dialects[m.dialect]} />}
                {m.intent && m.intent !== "OTHER" && <IntentBadge intent={m.intent} label={t.intents[m.intent]} />}
              </>
            ) : (
              <span className="animate-pulse text-xs text-muted">{t.mentions.analyzing}</span>
            )}
            {m.topics.map((k) => {
              const l = topicLabels.get(k);
              return (
                <a key={k} href={`/mentions?topic=${k}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
                  {l ? (locale === "ar" ? l.ar : l.en) : k}
                </a>
              );
            })}
          </div>
          {!compact && slang.length > 0 && <SlangChips items={slang} />}
          {m.note && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800" dir="auto">{m.note}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex items-center gap-4 text-xs text-muted ltr-nums">
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
            <div className="flex flex-wrap items-center gap-1">
              {!compact && showTranslate && (
                <TranslateButton
                  id={m.id}
                  cached={m.translation ? (JSON.parse(m.translation) as Translation) : null}
                  labels={{ translate: t.engage.translate, hide: t.engage.hideTranslation, translating: t.engage.translating, meaning: t.engage.meaning, aiOff: t.engage.aiOff }}
                />
              )}
              {!compact && canAct && !m.repliedAt && (
                <Link href={`/inbox?m=${m.id}`} className="btn-ghost px-2 py-1 text-xs">
                  <Reply className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t.engage.reply}
                </Link>
              )}
              {canAct && <MentionActions id={m.id} status={m.status} labels={{ ...t.mentions.status, markReviewed: t.mentions.markReviewed, flag: t.mentions.flag, archive: t.mentions.archive }} />}
              {m.url && (
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn-ghost px-2 py-1 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" /> {t.mentions.open}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
