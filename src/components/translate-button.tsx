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
      <button type="button" onClick={toggle} disabled={pending} className="btn-ghost btn-sm">
        <Languages className="h-3.5 w-3.5" /> {pending ? labels.translating : open ? labels.hide : labels.translate}
      </button>
      {error && <span className="text-xs text-sand-700">{error}</span>}
      {open && data && (
        <div className="order-last mt-2 w-full basis-full rounded-lg border border-line bg-canvas p-3 text-[13px]" dir="ltr">
          <p className="leading-relaxed text-ink">{data.text}</p>
          <p className="mt-1 text-xs text-faint">
            {data.dialect} · {data.tone}
          </p>
          {data.notes.length > 0 && (
            <div className="mt-2.5 border-t border-line pt-2.5">
              <p className="mb-1 text-xs font-medium text-muted">{labels.meaning}</p>
              <ul className="space-y-1 text-xs text-ink/80">
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
