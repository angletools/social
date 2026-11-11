"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import { draftRepliesAction, markReplied, skipInboxItem } from "@/app/actions";
import { toast } from "@/components/feedback";
import { useClientDict } from "@/components/client-dict";
import { cn } from "@/lib/utils";

type DraftItem = { id: string; text: string };

/** One composer: suggested replies are a short pick-list that fills the reply box. */
export function ReplyComposer({
  mentionId,
  url,
  drafts,
  canAct,
  aiOn,
  t,
  aiOffLabel,
}: {
  mentionId: string;
  url: string | null;
  drafts: DraftItem[];
  canAct: boolean;
  aiOn: boolean;
  t: Dict["inbox"];
  aiOffLabel: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(drafts[0]?.id ?? null);
  const [text, setText] = useState(drafts[0]?.text ?? "");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [escalation, setEscalation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toasts, common } = useClientDict();

  if (!canAct) return null;

  const pick = (d: DraftItem) => {
    setPicked(d.id);
    setText(d.text);
  };

  const generate = () =>
    start(async () => {
      setError(null);
      const res = await draftRepliesAction(mentionId, note.trim() || undefined);
      if (!res.ok) setError(res.error === "ai_disabled" ? aiOffLabel : common.failed);
      else {
        setEscalation(res.escalate ? (res.reason ?? t.escalate) : null);
        router.refresh();
      }
    });

  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => null);
    toast(t.copied, "info");
    if (url) window.open(url, "_blank", "noopener");
  };

  const done = () =>
    start(async () => {
      const original = drafts.find((d) => d.id === picked);
      await markReplied(mentionId, text.trim(), original ? original.id : undefined);
      toast(toasts.replied);
      router.push("/inbox");
      router.refresh();
    });

  const skip = () =>
    start(async () => {
      await skipInboxItem(mentionId);
      toast(toasts.ARCHIVED);
      router.push("/inbox");
    });

  return (
    <div className="flex flex-col gap-3">
      {drafts.length > 0 && (
        <div role="radiogroup" aria-label={t.suggest} className="flex flex-col gap-1">
          {drafts.map((d) => {
            const on = picked === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(d)}
                className={cn(
                  "flex w-full gap-3 rounded-xl px-3 py-2.5 text-start text-[14.5px] leading-relaxed transition-colors",
                  on ? "bg-selected text-ink" : "text-muted hover:bg-selected/60 hover:text-ink",
                )}
              >
                <span className={cn("mt-[5px] h-4 w-4 shrink-0 rounded-full", on ? "border-[5px] border-ink" : "border-[1.5px] border-faint")} aria-hidden />
                <span dir="auto" className="flex-1">{d.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {pending && <p className="animate-pulse px-1 text-sm text-muted">{t.drafting}</p>}
      {error && <p className="px-1 text-sm text-neg">{error}</p>}
      {escalation && (
        <p className="px-1 text-sm text-neg">
          <b className="font-semibold">{t.escalate}:</b> {escalation}
        </p>
      )}
      {noteOpen && (
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.instruction} dir="auto" autoFocus />
      )}

      <label className="sr-only" htmlFor={`reply-${mentionId}`}>{t.yourReply}</label>
      <textarea
        id={`reply-${mentionId}`}
        dir="auto"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.yourReply}
        className="input min-h-[64px] resize-none rounded-2xl px-4 py-3 text-[15px] leading-relaxed [field-sizing:content]"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary h-11 px-5 text-[14px]" disabled={!text.trim() || pending} onClick={done}>
          <Check className="h-4 w-4" /> {t.markReplied}
        </button>
        <button
          type="button"
          className="btn-secondary h-11 w-11 px-0"
          disabled={!text.trim()}
          onClick={copy}
          title={url ? t.copyOpen : t.copy}
          aria-label={url ? t.copyOpen : t.copy}
        >
          {url ? <ExternalLink className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button type="button" className="btn-ghost" onClick={generate} disabled={pending || !aiOn} title={aiOn ? undefined : aiOffLabel}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" strokeWidth={1.6} />}
          {drafts.length ? t.regenerate : t.suggest}
        </button>
        {aiOn && (
          <button type="button" className="btn-ghost" onClick={() => setNoteOpen((o) => !o)} aria-expanded={noteOpen}>
            {t.addNote}
          </button>
        )}
        <button type="button" className="btn-ghost ms-auto" disabled={pending} onClick={skip}>
          {t.skip}
        </button>
      </div>
    </div>
  );
}
