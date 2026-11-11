"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check, Hash, Lightbulb, Tag, X } from "lucide-react";
import type { MonitorType, Platform } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import { createMonitor } from "@/app/actions";
import { PlatformIcon } from "@/components/platform";
import { cn } from "@/lib/utils";

const TYPES: { type: MonitorType; icon: React.ElementType }[] = [
  { type: "KEYWORD", icon: Tag },
  { type: "HASHTAG", icon: Hash },
  { type: "PROFILE", icon: AtSign },
  { type: "TOPIC", icon: Lightbulb },
];
const ALL_PLATFORMS: Platform[] = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"];

function ChipInput({ value, onChange, placeholder, prefix }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; prefix?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(/[,،\n]/).map((s) => s.trim().replace(/^[#@]/, "")).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft("");
  };
  return (
    <div className="input flex min-h-12 flex-wrap items-center gap-1.5 py-2">
      {value.map((v) => (
        <span key={v} dir="auto" className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-sm text-brand-700">
          {prefix}
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-brand-700/60 hover:text-brand-700" aria-label="remove">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[10rem] flex-1 bg-transparent outline-none"
        dir="auto"
      />
    </div>
  );
}

export function MonitorWizard({
  t,
  platforms: platformLabels,
  common,
  support,
}: {
  t: Dict["monitors"];
  platforms: Dict["platforms"];
  common: Dict["common"];
  support: Record<MonitorType, Platform[]>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<MonitorType>("KEYWORD");
  const [name, setName] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [languages, setLanguages] = useState<("ar" | "en")[]>(["ar", "en"]);
  const [platforms, setPlatforms] = useState<Platform[]>(["X", "INSTAGRAM", "TIKTOK"]);
  const [competitor, setCompetitor] = useState(false);
  const [refresh, setRefresh] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const available = support[type];
  const chosen = platforms.filter((p) => available.includes(p));
  const steps = [t.wizard.step1, t.wizard.step2, t.wizard.step3, t.wizard.step4];
  const prefix = type === "HASHTAG" ? "#" : type === "PROFILE" ? "@" : "";

  const canNext =
    step === 0 ||
    (step === 1 && terms.length > 0 && name.trim().length > 0 && (type !== "TOPIC" || description.trim().length > 0)) ||
    (step === 2 && chosen.length > 0) ||
    step === 3;

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createMonitor({
        name: name.trim(),
        type,
        platforms: chosen,
        terms,
        excludeTerms: exclude,
        languages,
        description: description.trim() || undefined,
        isCompetitor: competitor,
        refreshMinutes: refresh,
      });
      if (res.ok) router.push(`/monitors/${res.id}?created=1`);
      else setError(res.error === "limit" ? t.wizard.limitReached : common.forbidden);
    });

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                i < step ? "bg-brand-600 text-white" : i === step ? "bg-brand-100 text-brand-700 ring-2 ring-brand-500" : "bg-sunken text-muted",
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm sm:block", i === step ? "font-medium" : "text-muted")}>{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      <div className="card p-6 sm:p-8">
        {step === 0 && (
          <>
            <h2 className="mb-5 text-lg font-semibold">{t.wizard.step1}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map(({ type: ty, icon: Icon }) => (
                <button
                  type="button"
                  key={ty}
                  onClick={() => setType(ty)}
                  className={cn(
                    "rounded-xl border p-4 text-start transition",
                    type === ty ? "border-ink bg-surface shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-line-strong",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", type === ty ? "bg-brand-600 text-white" : "bg-canvas text-muted")}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-semibold">{t.types[ty]}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{t.typeHelp[ty]}</p>
                  <p className="mt-2 text-xs text-faint" dir="auto">{t.typeExample[ty]}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">{t.wizard.step2}</h2>
            <div>
              <label className="label">{t.wizard.name}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.wizard.namePlaceholder} dir="auto" />
            </div>
            {type === "TOPIC" && (
              <div>
                <label className="label">{t.wizard.description}</label>
                <textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.typeExample.TOPIC} dir="auto" />
                <p className="hint">{t.wizard.descriptionHint}</p>
              </div>
            )}
            <div>
              <label className="label">{t.wizard.termsLabel[type]}</label>
              <ChipInput value={terms} onChange={setTerms} placeholder={t.typeExample[type]} prefix={prefix} />
              <p className="hint">{t.wizard.termsHint}</p>
            </div>
            {type !== "PROFILE" && (
              <div>
                <label className="label">{t.wizard.exclude}</label>
                <ChipInput value={exclude} onChange={setExclude} />
              </div>
            )}
            <div>
              <label className="label">{t.wizard.languages}</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: ["ar", "en"] as ("ar" | "en")[], l: t.wizard.langAll },
                  { v: ["ar"] as ("ar" | "en")[], l: t.wizard.langAr },
                  { v: ["en"] as ("ar" | "en")[], l: t.wizard.langEn },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.l}
                    onClick={() => setLanguages(o.v)}
                    className={cn("rounded-xl border px-4 py-2 text-sm", languages.join() === o.v.join() ? "border-ink bg-ink text-white" : "border-line")}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            {(type === "KEYWORD" || type === "PROFILE") && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
                <input type="checkbox" checked={competitor} onChange={(e) => setCompetitor(e.target.checked)} className="mt-1 h-4 w-4 accent-brand-600" />
                <span>
                  <span className="block text-sm font-medium">{t.wizard.competitor}</span>
                  <span className="text-xs text-muted">{t.wizard.competitorHint}</span>
                </span>
              </label>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">{t.wizard.step3}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {ALL_PLATFORMS.map((p) => {
                const ok = available.includes(p);
                const on = chosen.includes(p);
                return (
                  <button
                    type="button"
                    key={p}
                    disabled={!ok}
                    onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-4 transition",
                      on ? "border-ink bg-surface shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-line-strong",
                      !ok && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <PlatformIcon platform={p} />
                    <span className="flex-1 text-start text-sm font-medium">{platformLabels[p]}</span>
                    {on && <Check className="h-4 w-4 text-brand-600" />}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="label">{t.wizard.frequency}</label>
              <select className="input max-w-xs" value={refresh} onChange={(e) => setRefresh(Number(e.target.value))}>
                {Object.entries(t.wizard.freq).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t.wizard.step4}</h2>
            <dl className="divide-y divide-line rounded-xl border border-line">
              {[
                [t.wizard.name, name],
                [t.type, t.types[type]],
                [t.wizard.termsLabel[type], terms.map((x) => prefix + x).join("، ")],
                ...(type === "TOPIC" ? [[t.wizard.description, description]] : []),
                ...(exclude.length ? [[t.wizard.exclude, exclude.join("، ")]] : []),
                [t.platforms, chosen.map((p) => platformLabels[p]).join("، ")],
                [t.wizard.frequency, t.wizard.freq[String(refresh) as keyof typeof t.wizard.freq]],
                ...(competitor ? [[t.competitor, common.yes]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex gap-4 px-4 py-3 text-sm">
                  <dt className="w-40 shrink-0 text-muted">{k}</dt>
                  <dd dir="auto" className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {error && <p className="rounded-xl bg-neg/[0.06] px-3 py-2 text-sm text-neg">{error}</p>}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
          <button type="button" className="btn-ghost" onClick={() => (step === 0 ? router.back() : setStep(step - 1))}>
            {step === 0 ? common.cancel : common.back}
          </button>
          {step < 3 ? (
            <button type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {common.next}
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={pending} onClick={submit}>
              {pending ? common.loading : t.wizard.create}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
