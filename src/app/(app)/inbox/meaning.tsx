"use client";

import { useState, useTransition } from "react";
import { translateMentionAction } from "@/app/actions";
import type { Translation } from "@/lib/ai/engage";

/** "What do they mean?" — reveals slang glosses and, on demand, a plain translation. */
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-brand-700 underline decoration-1 underline-offset-4 hover:text-ink"
      >
        {open ? labels.hide : labels.meaning}
      </button>
      {open && (
        <div className="order-last basis-full space-y-3 pt-1">
          {slang.length > 0 && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 text-sm">
              {slang.map((s) => (
                <div key={s.term} className="contents">
                  <dt dir="auto" className="font-medium text-ink">{s.term}</dt>
                  <dd dir="ltr" className="text-end text-muted rtl:text-start">{s.gloss}</dd>
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
              <button type="button" onClick={translate} disabled={pending} className="text-sm text-muted underline decoration-1 underline-offset-4 hover:text-ink">
                {pending ? labels.translating : labels.translate}
              </button>
            ))}
          {error && <p className="text-xs text-muted">{error}</p>}
        </div>
      )}
    </>
  );
}
