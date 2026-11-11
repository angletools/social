"use client";

import { toast } from "@/components/feedback";
import { useClientDict } from "@/components/client-dict";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { X } from "lucide-react";
import type { Dialect, Sentiment } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import { addLexiconTerm, deleteLexiconTerm } from "@/app/actions";

type Term = { id: string; term: string; meaning: string; dialect: Dialect | null; sentimentHint: Sentiment | null };

const field =
  "h-10 w-full min-w-0 rounded-[12px] border border-line bg-canvas px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink/40 max-sm:text-[16px]";

/** Team glossary: words the analysis should read with your meaning. */
export function Glossary({
  terms,
  canEdit,
  t,
  help,
  dialects,
  sentiments,
  addLabel,
}: {
  terms: Term[];
  canEdit: boolean;
  t: Dict["dialectPage"];
  help: string;
  dialects: Dict["dialects"];
  sentiments: Record<Sentiment, string>;
  addLabel: string;
}) {
  const [state, action, pending] = useActionState(addLexiconTerm, null);
  const [delPending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const { toasts, common } = useClientDict();
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      toast(toasts.termAdded);
    }
  }, [state, toasts.termAdded]);

  return (
    <>
      <p className="text-[13.5px] leading-[1.7] text-muted">{help}</p>
      {canEdit && (
        <form ref={ref} action={action} className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input name="term" required aria-label={t.term} placeholder={t.term} className={field} dir="auto" />
            <input name="meaning" required aria-label={t.meaning} placeholder={t.meaning} className={field} dir="auto" />
            <select name="dialect" aria-label={t.dialect} className={`${field} text-muted`} defaultValue="">
              <option value="">
                {t.dialect}: {t.anyDialect}
              </option>
              {Object.entries(dialects).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select name="sentimentHint" aria-label={t.hint} className={`${field} text-muted`} defaultValue="">
              <option value="">{t.hint}…</option>
              {Object.entries(sentiments).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <button className="mt-1.5 h-[38px] rounded-[11px] bg-ink text-[14px] font-semibold text-on-ink transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-60" disabled={pending}>
            {addLabel}
          </button>
        </form>
      )}
      {terms.length === 0 ? (
        <p className="text-sm text-muted">{t.emptyGlossary}</p>
      ) : (
        <ul className="mt-1">
          {terms.map((x) => (
            <li key={x.id} className="group flex items-center gap-3 border-t border-line py-2.5 text-[14px]">
              <span dir="auto" className="min-w-0 shrink-0 font-semibold">
                {x.term}
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                {x.dialect && <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[11.5px] text-muted">{dialects[x.dialect]}</span>}
                <span dir="auto" className="min-w-0 truncate text-end text-muted" title={x.sentimentHint ? `${t.hint}: ${sentiments[x.sentimentHint]}` : undefined}>
                  {x.meaning}
                </span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="-me-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-sunken hover:text-ink"
                  disabled={delPending}
                  onClick={() => start(async () => { await deleteLexiconTerm(x.id); toast(toasts.deleted); })}
                  aria-label={`${common.delete}: ${x.term}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
