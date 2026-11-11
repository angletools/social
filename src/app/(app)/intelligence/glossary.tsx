"use client";

import { toast } from "@/components/feedback";
import { useClientDict } from "@/components/client-dict";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { Dialect, Sentiment } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import { addLexiconTerm, deleteLexiconTerm } from "@/app/actions";

type Term = { id: string; term: string; meaning: string; dialect: Dialect | null; sentimentHint: Sentiment | null };

export function Glossary({
  terms,
  canEdit,
  t,
  dialects,
  sentiments,
  addLabel,
}: {
  terms: Term[];
  canEdit: boolean;
  t: Dict["dialectPage"];
  dialects: Dict["dialects"];
  sentiments: Record<Sentiment, string>;
  addLabel: string;
}) {
  const [state, action, pending] = useActionState(addLexiconTerm, null);
  const [delPending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const { toasts } = useClientDict();
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      toast(toasts.termAdded);
    }
  }, [state, toasts.termAdded]);

  return (
    <div>
      <p className="mb-4 text-sm text-muted">{t.glossaryHelp}</p>
      {canEdit && (
        <form ref={ref} action={action} className="mb-5 grid gap-2 rounded-xl bg-canvas p-3 sm:grid-cols-[1fr_2fr_auto_auto_auto]">
          <input name="term" required placeholder={t.term} className="input" dir="auto" />
          <input name="meaning" required placeholder={t.meaning} className="input" dir="auto" />
          <select name="dialect" className="input w-auto">
            <option value="">{t.anyDialect}</option>
            {Object.entries(dialects).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select name="sentimentHint" className="input w-auto">
            <option value="">{t.hint}…</option>
            {Object.entries(sentiments).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className="btn-primary" disabled={pending}>{addLabel}</button>
        </form>
      )}
      {terms.length === 0 ? (
        <p className="text-sm text-muted">{t.emptyGlossary}</p>
      ) : (
        <ul className="divide-y divide-line">
          {terms.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
              <b dir="auto" className="min-w-24">{x.term}</b>
              <span dir="auto" className="flex-1 text-ink/80">{x.meaning}</span>
              {x.dialect && <span className="rounded-full bg-sunken px-2 py-0.5 text-xs">{dialects[x.dialect]}</span>}
              {x.sentimentHint && <span className="text-xs text-muted">{t.hint}: {sentiments[x.sentimentHint]}</span>}
              {canEdit && (
                <button type="button" className="btn-ghost btn-sm w-7 px-0" disabled={delPending} onClick={() => start(async () => { await deleteLexiconTerm(x.id); toast(toasts.deleted); })} aria-label="delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
