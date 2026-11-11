"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import { draftRepliesAction, markReplied, skipInboxItem } from "@/app/actions";
import { toast } from "@/components/feedback";
import { useClientDict } from "@/components/client-dict";
import { cn } from "@/lib/utils";
import { useMac } from "@/components/shell/nav-links";

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
  replyingOn,
}: {
  mentionId: string;
  url: string | null;
  drafts: DraftItem[];
  canAct: boolean;
  aiOn: boolean;
  t: Dict["inbox"];
  aiOffLabel: string;
  replyingOn: string;
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
  const doneRef = useRef<() => void>(() => {});
  const mac = useMac();

  // ⌘↵ / Ctrl+↵ marks the reply as sent from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        doneRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  doneRef.current = () => {
    if (text.trim() && !pending) done();
  };

  const skip = () =>
    start(async () => {
      await skipInboxItem(mentionId);
      toast(toasts.ARCHIVED);
      router.push("/inbox");
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-6 items-center justify-between gap-3 text-[13px] text-faint">
        <span>{drafts.length > 0 ? t.suggested : t.yourReply}</span>
        <span className="flex items-center gap-4">
          {aiOn && (
            <button type="button" className="text-muted hover:text-ink" onClick={() => setNoteOpen((o) => !o)} aria-expanded={noteOpen}>
              {t.addNote}
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink disabled:opacity-45"
            onClick={generate}
            disabled={pending || !aiOn}
            title={aiOn ? undefined : aiOffLabel}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />}
            {drafts.length ? t.regenerate : t.suggest}
          </button>
        </span>
      </div>

      {noteOpen && (
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.instruction} dir="auto" autoFocus enterKeyHint="send" />
      )}

      {drafts.length > 0 && (
        <div role="radiogroup" aria-label={t.suggested} className="flex flex-col gap-0.5">
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
                  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-start text-[14.5px] leading-[1.6] transition-colors",
                  on ? "bg-selected text-ink" : "text-muted hover:bg-selected/60 hover:text-ink",
                )}
              >
                <span className={cn("h-4 w-4 shrink-0 rounded-full", on ? "border-[5px] border-ink" : "border-[1.5px] border-faint")} aria-hidden />
                <span dir="auto" className="min-w-0 flex-1">{d.text}</span>
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

      <div className="overflow-hidden rounded-2xl border border-line bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100">
        <label className="sr-only" htmlFor={`reply-${mentionId}`}>{t.yourReply}</label>
        <textarea
          id={`reply-${mentionId}`}
          dir="auto"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.yourReply}
          enterKeyHint="send"
          className="block min-h-[64px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[16px] leading-[1.75] text-ink outline-none placeholder:text-faint [field-sizing:content] md:text-[15px]"
        />
        <div className="flex items-center gap-2 py-2 ps-4 pe-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-faint">{replyingOn}</span>
          <button type="button" className="btn-ghost h-9 px-3 max-md:h-11" disabled={pending} onClick={skip}>
            {t.skip}
          </button>
          <button
            type="button"
            className="btn-secondary h-9 w-9 px-0 max-md:h-11 max-md:w-11"
            disabled={!text.trim()}
            onClick={copy}
            title={url ? t.copyOpen : t.copy}
            aria-label={url ? t.copyOpen : t.copy}
          >
            {url ? <ExternalLink className="h-4 w-4" strokeWidth={1.7} /> : <Copy className="h-4 w-4" strokeWidth={1.7} />}
          </button>
          <button type="button" className="btn-primary h-9 gap-2 px-4 max-md:h-11" disabled={!text.trim() || pending} onClick={done}>
            <Check className="h-4 w-4" strokeWidth={2} />
            {t.markReplied}
            <kbd dir="ltr" className="hidden font-sans text-[12px] font-medium opacity-55 md:inline">{mac ? "⌘↵" : "Ctrl ↵"}</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
