"use client";

import { useActionState, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import type { Dialect, Platform } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import { createDraft } from "@/app/actions";
import { fmtClient } from "@/lib/fmt";
import { PlatformIcon } from "@/components/platform";
import { cn } from "@/lib/utils";

const PLATFORMS: Platform[] = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "X", "LINKEDIN"];
const DURATIONS = [15, 30, 45, 60, 90];
const WRITE_DIALECTS: Dialect[] = ["SAUDI", "KHALEEJI", "EGYPTIAN", "MSA", "ENGLISH"];

export function NewDraftForm({
  t,
  dialects,
  platforms,
  formats,
  voices,
  initialFormat,
  aiOn,
}: {
  t: Dict["studio"]["draft"];
  dialects: Dict["dialects"];
  platforms: Dict["platforms"];
  formats: { id: string; name: string; summary: string; hook: string; platforms: Platform[] }[];
  voices: { id: string; name: string; dialect: Dialect; isDefault: boolean }[];
  initialFormat?: string;
  aiOn: boolean;
}) {
  const [state, action, pending] = useActionState(createDraft, null);
  const [formatId, setFormatId] = useState(initialFormat ?? "");
  const [platform, setPlatform] = useState<Platform>(formats.find((f) => f.id === initialFormat)?.platforms[0] ?? "TIKTOK");
  const [duration, setDuration] = useState(30);
  const defaultVoice = voices.find((v) => v.isDefault) ?? voices[0];
  const [voiceId, setVoiceId] = useState(defaultVoice?.id ?? "");
  const [dialect, setDialect] = useState<Dialect>(defaultVoice?.dialect ?? "SAUDI");
  const format = formats.find((f) => f.id === formatId);

  return (
    <form action={action} className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="card space-y-5 p-6">
        <div>
          <label className="label">{t.basedOn}</label>
          <select name="formatId" className="input" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            <option value="">{t.scratch}</option>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {format && (
            <div className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm">
              <p className="text-ink/80">{format.summary}</p>
              <p dir="auto" className="mt-1 text-xs text-brand-700">{format.hook}</p>
            </div>
          )}
        </div>
        <div>
          <label className="label">{t.brief}</label>
          <textarea name="brief" required minLength={3} className="input min-h-28" placeholder={t.briefPh} dir="auto" />
        </div>
        <div>
          <label className="label">{t.goal}</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(t.goals).map(([v, l], i) => (
              <label key={v} className="cursor-pointer rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-on-ink">
                <input type="radio" name="goal" value={v} defaultChecked={i === 0} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{t.platform}</label>
          <input type="hidden" name="platform" value={platform} />
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPlatform(p)}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", platform === p ? "border-ink bg-surface shadow-[0_0_0_1px_var(--color-ink)]" : "border-line")}
              >
                <PlatformIcon platform={p} size="sm" /> {platforms[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card h-fit space-y-5 p-6">
        <div>
          <label className="label">{t.voice}</label>
          <select
            name="voiceId"
            className="input"
            value={voiceId}
            onChange={(e) => {
              setVoiceId(e.target.value);
              const v = voices.find((x) => x.id === e.target.value);
              if (v) setDialect(v.dialect);
            }}
          >
            <option value="">—</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.dialect}</label>
          <select name="dialect" className="input" value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
            {WRITE_DIALECTS.map((d) => (
              <option key={d} value={d}>{dialects[d]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.duration}</label>
          <input type="hidden" name="durationSec" value={duration} />
          <div className="grid grid-cols-5 gap-1.5">
            {DURATIONS.map((d) => (
              <button type="button" key={d} onClick={() => setDuration(d)} className={cn("rounded-lg border py-2 text-sm ltr-nums", duration === d ? "border-ink bg-ink font-medium text-on-ink" : "border-line")}>
                {d}s
              </button>
            ))}
          </div>
          <p className="hint">{fmtClient(t.seconds, { n: duration })}</p>
        </div>
        {!aiOn && <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-700">{t.aiOff}</p>}
        {state && !state.ok && <p className="text-sm text-neg">{state.error}</p>}
        <button className="btn-primary w-full py-3" disabled={pending || !aiOn}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} {t.generate}
        </button>
      </div>
    </form>
  );
}
