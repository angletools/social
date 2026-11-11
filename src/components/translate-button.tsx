"use client";

import { useState, useTransition } from "react";
import { Languages } from "lucide-react";
import { translateMentionAction } from "@/app/actions";
import type { Translation } from "@/lib/ai/engage";

export function TranslateButton({
  id,
  cached,
  labels,
}: {
  id: string;
  cached: Translation | null;
  labels: { translate: string; hide: string; translating: string; meaning: string; aiOff: string };
}) {
  const [data, setData] = useState<Translation | null>(cached);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    if (open) return setOpen(false);
    if (data) return setOpen(true);
    start(async () => {
      const res = await translateMentionAction(id);
      if (res.ok && "translation" in res) {
        setData(res.translation);
        setOpen(true);
        setError(null);
      } else setError(labels.aiOff);
    });
  };

  return (
    <>
      <button type="button" onClick={toggle} disabled={pending} className="btn-ghost px-2 py-1 text-xs">
        <Languages className="h-3.5 w-3.5" /> {pending ? labels.translating : open ? labels.hide : labels.translate}
      </button>
      {error && <span className="text-xs text-amber-700">{error}</span>}
      {open && data && (
        <div className="order-last mt-2 w-full basis-full rounded-xl bg-sky-50 p-3 text-sm" dir="ltr">
          <p className="leading-relaxed text-slate-800">{data.text}</p>
          <p className="mt-1 text-xs text-slate-500">
            {data.dialect} · {data.tone}
          </p>
          {data.notes.length > 0 && (
            <div className="mt-2 border-t border-sky-100 pt-2">
              <p className="mb-1 text-xs font-medium text-slate-600">{labels.meaning}</p>
              <ul className="space-y-1 text-xs text-slate-700">
                {data.notes.map((n) => (
                  <li key={n.term}>
                    <b dir="auto">{n.term}</b> — {n.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
