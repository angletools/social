"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, ShieldAlert, PenLine } from "lucide-react";
import type { Dialect } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import { draftRepliesAction, markReplied, skipInboxItem } from "@/app/actions";
import { toast } from "@/components/feedback";
import { useClientDict } from "@/components/client-dict";

type DraftItem = { id: string; text: string; approach: string | null; dialect: Dialect | null };

export function ReplyComposer({
  mentionId,
  url,
  dialect,
  drafts,
  posted,
  canAct,
  aiOn,
  t,
  dialectLabels,
  aiOffLabel,
}: {
  mentionId: string;
  url: string | null;
  dialect: Dialect | null;
  drafts: DraftItem[];
  posted: { id: string; text: string; when: string }[];
  canAct: boolean;
  aiOn: boolean;
  t: Dict["inbox"];
  dialectLabels: Dict["dialects"];
  aiOffLabel: string;
}) {
  const router = useRouter();
  const [texts, setTexts] = useState<Record<string, string>>(Object.fromEntries(drafts.map((d) => [d.id, d.text])));
  const [own, setOwn] = useState("");
  const [instruction, setInstruction] = useState("");
  const [escalation, setEscalation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();

  const generate = () =>
    start(async () => {
      setError(null);
      const res = await draftRepliesAction(mentionId, instruction || undefined);
      if (!res.ok) setError(res.error === "ai_disabled" ? aiOffLabel : "Error");
      else {
        setEscalation(res.escalate ? res.reason ?? t.escalate : null);
        router.refresh();
      }
    });

  const copy = async (id: string, text: string, open: boolean) => {
    await navigator.clipboard.writeText(text).catch(() => null);
    setCopiedId(id);
    toast(t.copied, "info");
    if (open && url) window.open(url, "_blank", "noopener");
  };

  const done = (text: string, replyId?: string) =>
    start(async () => {
      await markReplied(mentionId, text, replyId);
      toast(toasts.replied);
      router.push("/inbox");
      router.refresh();
    });

  if (!canAct) return null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input flex-1"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t.instruction}
          dir="auto"
          disabled={!aiOn}
        />
        <button type="button" className="btn-brand" onClick={generate} disabled={pending || !aiOn}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
          {drafts.length ? t.regenerate : t.draft}
        </button>
      </div>
      {dialect && (
        <p className="mt-2 text-xs text-muted">
          {t.replyIn}: <b>{dialectLabels[dialect]}</b>
        </p>
      )}
      {!aiOn && <p className="mt-3 rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-700">{aiOffLabel}</p>}
      {pending && <p className="mt-4 animate-pulse text-sm text-muted">{t.drafting}</p>}
      {error && <p className="mt-3 text-sm text-neg">{error}</p>}
      {escalation && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-neg/[0.06] px-3 py-2 text-sm text-neg">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> <b>{t.escalate}:</b> {escalation}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {drafts.map((d) => (
          <div key={d.id} className="rounded-xl border border-line bg-canvas/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span className="font-medium text-ink/80" dir="ltr">{d.approach}</span>
              {d.dialect && <span>{dialectLabels[d.dialect]}</span>}
            </div>
            <textarea
              dir="auto"
              className="input min-h-20 bg-surface text-[14.5px] leading-relaxed [field-sizing:content]"
              value={texts[d.id] ?? d.text}
              onChange={(e) => setTexts({ ...texts, [d.id]: e.target.value })}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => copy(d.id, texts[d.id] ?? d.text, true)}>
                {url ? <ExternalLink className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {url ? t.copyOpen : t.copy}
              </button>
              <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => done(texts[d.id] ?? d.text, d.id)}>
                <Check className="h-3.5 w-3.5" /> {t.markReplied}
              </button>
              {copiedId === d.id && <span className="text-xs text-muted">{t.copied}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <label className="label">{t.writeOwn}</label>
        <textarea dir="auto" className="input min-h-20" value={own} onChange={(e) => setOwn(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-primary btn-sm" disabled={!own.trim() || pending} onClick={() => done(own)}>
            <Check className="h-3.5 w-3.5" /> {t.markReplied}
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await skipInboxItem(mentionId); toast(toasts.ARCHIVED); router.push("/inbox"); })}>
            {t.skip}
          </button>
        </div>
      </div>

      {posted.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium text-muted">{t.previous}</p>
          {posted.map((p) => (
            <p key={p.id} dir="auto" className="mb-2 rounded-xl bg-canvas px-3 py-2 text-sm">
              {p.text} <span className="text-xs text-muted">· {p.when}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
