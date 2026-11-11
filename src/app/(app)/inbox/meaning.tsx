"use client";

import { useState, useTransition } from "react";
import { translateMentionAction } from "@/app/actions";
import type { Translation } from "@/lib/ai/engage";

/** "What do they mean?": reveals slang glosses and, on demand, a plain translation. */
export function Meaning({
  id,
  slang,
  cached,
  canTranslate,
  labels,
}: {
  id: string;
  slang: { term: string; gloss: string }[];
  cached: Translation | null;
  canTranslate: boolean;
  labels: { meaning: string; hide: string; translate: string; translating: string; aiOff: string };
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Translation | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const translate = () =>
    start(async () => {
      const res = await translateMentionAction(id);
      if (res.ok && "translation" in res) {
        setData(res.translation);
        setError(null);
      } else setError(labels.aiOff);
    });

  if (slang.length === 0 && !canTranslate) return null;

  return (
    <>
      <span className="inline-flex items-center gap-3.5">
        <span className="h-[3px] w-[3px] rounded-full bg-faint" aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-ink underline decoration-faint decoration-1 underline-offset-[5px] hover:decoration-ink"
        >
          {open ? labels.hide : labels.meaning}
        </button>
      </span>
      {open && (
        <div className="order-last mt-2 flex basis-full flex-col gap-3 rounded-xl bg-surface px-4 py-3.5">
          {slang.length > 0 && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2.5 text-sm leading-5">
              {slang.map((s) => (
                <div key={s.term} className="contents">
                  <dt dir="auto" className="font-semibold text-ink">{s.term}</dt>
                  <dd dir="ltr" className="text-muted rtl:text-right">{s.gloss}</dd>
                </div>
              ))}
            </dl>
          )}
          {canTranslate &&
            (data ? (
              <p dir="ltr" className="max-w-2xl text-[14.5px] leading-relaxed text-ink">
                {data.text}
                <span className="ms-2 text-xs text-faint">{data.tone}</span>
              </p>
            ) : (
              <button type="button" onClick={translate} disabled={pending} className="self-start text-sm text-muted underline decoration-faint decoration-1 underline-offset-[5px] hover:text-ink">
                {pending ? labels.translating : labels.translate}
              </button>
            ))}
          {error && <p className="text-xs text-muted">{error}</p>}
        </div>
      )}
    </>
  );
}
