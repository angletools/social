"use client";

import { useClientDict } from "@/components/client-dict";
import { confirmDialog, toast } from "@/components/feedback";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Bookmark, EyeOff, Loader2, RefreshCw, ScanText, Star, Trash2 } from "lucide-react";
import type { BrandVoice, Dialect, Platform } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import {
  createTrendWatch,
  deleteTrendWatch,
  deleteVoice,
  learnVoiceAction,
  saveVoice,
  scanTrendWatch,
  setDefaultVoice,
  setFormatFlag,
} from "@/app/actions";
import { PlatformIcon } from "@/components/platform";
import { cn } from "@/lib/utils";

export function ScanButton({ ids, label, quiet }: { ids: string[]; label: string; done?: string; quiet?: boolean }) {
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();
  return (
    <>
      <button
        type="button"
        className={quiet ? "inline-flex items-center gap-1.5 text-muted transition-colors hover:text-ink disabled:opacity-60" : "btn-secondary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            for (const id of ids) await scanTrendWatch(id);
            toast(toasts.scanQueued, "info");
          })
        }
      >
        <RefreshCw className={cn(quiet ? "h-3.5 w-3.5" : "h-4 w-4", pending && "animate-spin")} /> {label}
      </button>
    </>
  );
}

export function FormatActions({ id, saved, labels }: { id: string; saved: boolean; labels: { save: string; saved: string; hide: string } }) {
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();
  return (
    <>
      <button type="button" className={cn("btn-secondary", saved && "border-brand-500 text-brand-700")} disabled={pending} onClick={() => start(async () => { await setFormatFlag(id, "saved", !saved); if (!saved) toast(toasts.formatSaved); })}>
        <Bookmark className={cn("h-4 w-4", saved && "fill-brand-600")} /> {saved ? labels.saved : labels.save}
      </button>
      <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(async () => { await setFormatFlag(id, "dismissed", true); toast(toasts.formatHidden); })}>
        <EyeOff className="h-4 w-4" /> {labels.hide}
      </button>
    </>
  );
}

export function WatchRow({
  id,
  canEdit,
  labels,
  children,
}: {
  id: string;
  canEdit: boolean;
  labels: { scan: string; done: string; delete: string; confirm: string };
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-start gap-3 p-5">
      {children}
      <div className="flex items-center gap-2">
        <ScanButton ids={[id]} label={labels.scan} done={labels.done} />
        {canEdit && (
          <button type="button" className="btn-ghost w-9 px-0" disabled={pending} onClick={async () => (await confirmDialog(labels.confirm, { danger: true, confirmLabel: labels.delete })) && start(() => deleteTrendWatch(id))} aria-label={labels.delete}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function WatchForm({ labels, platformLabels, platforms }: { labels: Dict["studio"]["watch"]; platformLabels: Dict["platforms"]; platforms: Platform[] }) {
  const [state, action, pending] = useActionState(createTrendWatch, null);
  const ref = useRef<HTMLFormElement>(null);
  const { toasts, common } = useClientDict();
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      ref.current?.reset();
      toast(toasts.scanQueued, "info");
    } else toast(common.failed, "error");
  }, [state, toasts.scanQueued, common.failed]);
  return (
    <form ref={ref} action={action} className="space-y-4">
      <div>
        <label className="label">{labels.name}</label>
        <input name="name" required className="input" placeholder={labels.namePh} dir="auto" />
      </div>
      <div>
        <label className="label">{labels.seeds}</label>
        <textarea name="seeds" required className="input min-h-20" placeholder={"ادخار\nاستثمار\npersonal finance"} dir="auto" />
        <p className="hint">{labels.seedsHint}</p>
      </div>
      <div>
        <label className="label">{labels.accounts}</label>
        <textarea name="accounts" className="input min-h-14" dir="ltr" />
      </div>
      <div>
        <label className="label">{labels.platforms}</label>
        <div className="grid grid-cols-2 gap-2">
          {platforms.map((p) => (
            <label key={p} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-ink has-[:checked]:shadow-[0_0_0_1px_var(--color-ink)]">
              <input type="checkbox" name="platforms" value={p} defaultChecked={p === "TIKTOK" || p === "INSTAGRAM"} className="accent-brand-600" />
              <PlatformIcon platform={p} size="sm" /> {platformLabels[p]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">{labels.minViews}</label>
        <input name="minViews" type="number" defaultValue={20000} min={0} className="input" dir="ltr" />
      </div>
      <button className="btn-primary w-full" disabled={pending}>{labels.create}</button>
    </form>
  );
}

export function LearnVoiceForm({
  monitors,
  labels,
  aiOn,
}: {
  monitors: { id: string; name: string }[];
  labels: { samples: string; fromMonitor: string; none: string; submit: string; learning: string; aiOff: string };
  aiOn: boolean;
}) {
  const [state, action, pending] = useActionState(learnVoiceAction, null);
  return (
    <form action={action} className="space-y-3">
      <textarea name="samples" className="input min-h-36" placeholder={labels.samples} dir="auto" disabled={!aiOn} />
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">{labels.fromMonitor}</span>
        <select name="monitorId" className="input w-auto" disabled={!aiOn}>
          <option value="">{labels.none}</option>
          {monitors.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      {!aiOn && <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-700">{labels.aiOff}</p>}
      {state && !state.ok && <p className="text-sm text-neg">{state.error}</p>}
      <button className="btn-primary" disabled={pending || !aiOn}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} {pending ? labels.learning : labels.submit}
      </button>
    </form>
  );
}

export function VoiceForm({
  voice,
  labels,
  dialects,
  saveLabel,
  onSaved,
}: {
  voice?: BrandVoice;
  labels: Dict["studio"]["voice"];
  dialects: Dict["dialects"];
  saveLabel: string;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveVoice, null);
  const { toasts } = useClientDict();
  useEffect(() => {
    if (state?.ok) {
      toast(toasts.voiceSaved);
      onSaved?.();
    }
  }, [state, onSaved, toasts.voiceSaved]);
  const list = (name: string, label: string, value?: string[]) => (
    <div>
      <label className="label">{label}</label>
      <textarea name={name} defaultValue={value?.join("\n")} className="input min-h-20" placeholder={labels.listHint} dir="auto" />
    </div>
  );
  return (
    <form action={action} className="space-y-3">
      {voice && <input type="hidden" name="id" value={voice.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">{labels.name}</label>
          <input name="name" required defaultValue={voice?.name} className="input" dir="auto" />
        </div>
        <div>
          <label className="label">{labels.dialect}</label>
          <select name="dialect" defaultValue={voice?.dialect ?? "SAUDI"} className="input">
            {Object.entries(dialects).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">{labels.summary}</label>
        <textarea name="summary" required defaultValue={voice?.summary} className="input min-h-24" dir="auto" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {list("traits", labels.traits, voice?.traits)}
        {list("bannedWords", labels.banned, voice?.bannedWords)}
        {list("dos", labels.dos, voice?.dos)}
        {list("donts", labels.donts, voice?.donts)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">{labels.audience}</label>
          <input name="audience" defaultValue={voice?.audience ?? ""} className="input" dir="auto" />
        </div>
        <div>
          <label className="label">{labels.cta}</label>
          <input name="ctaStyle" defaultValue={voice?.ctaStyle ?? ""} className="input" dir="auto" />
        </div>
        <div>
          <label className="label">{labels.emoji}</label>
          <input name="emojiPolicy" defaultValue={voice?.emojiPolicy ?? ""} className="input" dir="auto" />
        </div>
      </div>
      <div>
        <label className="label">{labels.examples}</label>
        <textarea name="examples" defaultValue={voice?.examples.join("\n")} className="input min-h-24" placeholder={labels.listHint} dir="auto" />
      </div>
      {state && !state.ok && <p className="text-sm text-neg">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{saveLabel}</button>
    </form>
  );
}

export function VoiceList({
  voices,
  labels,
  dialects,
  canEdit,
  saveLabel,
  deleteLabel,
  editLabel,
}: {
  voices: BrandVoice[];
  labels: Dict["studio"]["voice"];
  dialects: Dict["dialects"];
  canEdit: boolean;
  saveLabel: string;
  deleteLabel: string;
  editLabel: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (voices.length === 0) return <p className="card p-8 text-center text-sm text-muted">{labels.empty}</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {voices.map((v) => (
        <article key={v.id} className={cn("card p-6", v.isDefault && "ring-2 ring-brand-500")}>
          {editing === v.id ? (
            <VoiceForm voice={v} labels={labels} dialects={dialects} saveLabel={saveLabel} onSaved={() => setEditing(null)} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold" dir="auto">{v.name}</h3>
                  <p className="text-xs text-muted">
                    {dialects[v.dialect as Dialect]}
                    {v.isDefault && <span className="ms-2 rounded-full bg-brand-600 px-2 py-0.5 text-on-ink">{labels.isDefault}</span>}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    {!v.isDefault && (
                      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => start(() => setDefaultVoice(v.id))}>
                        <Star className="h-3.5 w-3.5" /> {labels.makeDefault}
                      </button>
                    )}
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(v.id)}>{editLabel}</button>
                    <button type="button" className="btn-ghost btn-sm w-7 px-0" disabled={pending} onClick={() => start(() => deleteVoice(v.id))} aria-label={deleteLabel}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p dir="auto" className="mt-3 text-sm leading-relaxed text-ink/80">{v.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {v.traits.map((x) => (
                  <span key={x} dir="auto" className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">{x}</span>
                ))}
              </div>
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-xs font-medium text-pos">✓ {labels.dos}</h4>
                  <ul className="space-y-1" dir="auto">{v.dos.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div>
                  <h4 className="mb-1 text-xs font-medium text-neg">✕ {labels.donts}</h4>
                  <ul className="space-y-1" dir="auto">{[...v.donts, ...v.bannedWords.map((w) => `«${w}»`)].map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              </div>
              {v.examples.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-medium text-muted">{labels.examples}</h4>
                  {v.examples.slice(0, 3).map((e) => (
                    <p key={e} dir="auto" className="rounded-xl bg-canvas px-3 py-2 text-sm">{e}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </div>
  );
}
