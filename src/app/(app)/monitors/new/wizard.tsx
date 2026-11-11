"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, X } from "lucide-react";
import type { MonitorType, Platform } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import { createMonitor } from "@/app/actions";
import { previewMonitor, updateMonitor, type MonitorPreview } from "../actions";
import { PlatformIcon } from "@/components/platform";
import { SolidAvatar } from "@/components/avatar";
import { MonitorGlyph } from "@/components/monitor-ui";
import { toast } from "@/components/feedback";
import { everyLabel, highlight, needleFor } from "@/lib/monitor-stats";
import { cn, timeShort } from "@/lib/utils";

const TYPES: MonitorType[] = ["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"];
const ALL_PLATFORMS: Platform[] = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"];
const FREQS = [30, 60, 180, 720, 1440] as const;
type Lang = "ar" | "en";
const LANGS: Lang[][] = [["ar", "en"], ["ar"], ["en"]];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export type MonitorDraft = {
  id?: string;
  name: string;
  type: MonitorType;
  terms: string[];
  excludeTerms: string[];
  description: string;
  languages: Lang[];
  platforms: Platform[];
  isCompetitor: boolean;
  refreshMinutes: number;
};

/** Terms typed one at a time; Enter or a comma (Latin or Arabic) commits one. */
function ChipInput({
  value,
  onChange,
  placeholder,
  prefix,
  label,
  removeLabel,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  prefix?: string;
  label: string;
  removeLabel: string;
  id: string;
}) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const add = () => {
    const parts = draft
      .split(/[,،\n]/)
      .map((s) => s.trim().replace(/^[#@]/, ""))
      .filter(Boolean)
      .map((s) => s.slice(0, 100));
    if (parts.length) onChange([...new Set([...value, ...parts])].slice(0, 20));
    setDraft("");
  };
  return (
    <div
      onClick={() => input.current?.focus()}
      className="flex min-h-12 cursor-text flex-wrap items-center gap-1.5 rounded-[12px] border border-line bg-canvas p-2 transition-[border-color,box-shadow] focus-within:border-ink"
    >
      {value.map((v) => (
        <span key={v} className="inline-flex h-[30px] max-w-full items-center gap-1 rounded-lg bg-surface ps-2.5 pe-1 text-[14px] font-medium">
          <bdi className="truncate">
            {prefix}
            {v}
          </bdi>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((x) => x !== v));
            }}
            aria-label={fill(removeLabel, { term: `${prefix ?? ""}${v}` })}
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink max-md:h-8 max-md:w-8"
          >
            <X className="h-3 w-3" strokeWidth={2.2} />
          </button>
        </span>
      ))}
      <input
        id={id}
        ref={input}
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === "،") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        style={{ outline: "none" }}
        className="h-[30px] min-w-[8rem] flex-1 bg-transparent px-1.5 text-[16px] outline-none placeholder:text-faint md:text-[14px]"
        dir="auto"
      />
    </div>
  );
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-sunken p-[3px] [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={o.v === value}
          onClick={() => onChange(o.v)}
          className={cn(
            "h-8 shrink-0 whitespace-nowrap rounded-[9px] px-3.5 text-[13.5px] transition-colors",
            o.v === value ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

const Box = ({ on }: { on: boolean }) => (
  <span aria-hidden className={cn("flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]", on ? "bg-ink" : "border-[1.5px] border-faint")}>
    {on && <Check className="h-3 w-3 text-on-ink" strokeWidth={3} />}
  </span>
);

export function MonitorWizard({
  t,
  v2,
  platforms: platformLabels,
  common,
  support,
  initial,
  title,
  locale,
}: {
  t: Dict["monitors"];
  v2: Dict["monitorsV2"];
  platforms: Dict["platforms"];
  common: Dict["common"];
  support: Record<MonitorType, Platform[]>;
  /** Editing an existing monitor: its current settings. */
  initial?: MonitorDraft;
  title: string;
  locale: "ar" | "en";
}) {
  const W = v2.wizard;
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [step, setStep] = useState(editing ? 3 : 0);
  const [type, setType] = useState<MonitorType>(initial?.type ?? "KEYWORD");
  const [name, setName] = useState(initial?.name ?? "");
  const [terms, setTerms] = useState<string[]>(initial?.terms ?? []);
  const [exclude, setExclude] = useState<string[]>(initial?.excludeTerms ?? []);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [languages, setLanguages] = useState<Lang[]>(initial?.languages.length ? initial.languages : ["ar", "en"]);
  const [platforms, setPlatforms] = useState<Platform[]>(initial?.platforms ?? ["X", "INSTAGRAM", "TIKTOK"]);
  const [competitor, setCompetitor] = useState(initial?.isCompetitor ?? false);
  const [refresh, setRefresh] = useState(initial?.refreshMinutes ?? 60);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<MonitorPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const available = support[type];
  const chosen = platforms.filter((p) => available.includes(p));
  const prefix = type === "HASHTAG" ? "#" : type === "PROFILE" ? "@" : "";
  const stepLabels = [W.steps.s1, W.steps.s2, W.steps.s3, W.steps.s4];
  const headings = [t.wizard.step1, t.wizard.step2, t.wizard.step3, t.wizard.step4];
  const freqLabel = (m: number) => t.wizard.freq[String(m) as keyof typeof t.wizard.freq] ?? `${m}`;
  const langLabel = (l: Lang[]) => (l.length === 2 ? t.wizard.langAll : l[0] === "ar" ? t.wizard.langAr : t.wizard.langEn);

  const valid = [
    true,
    terms.length > 0 && name.trim().length > 0 && (type !== "TOPIC" || description.trim().length > 0),
    chosen.length > 0,
    true,
  ];
  const reachable = (i: number) => valid.slice(0, i).every(Boolean);

  // Move focus to the new step's heading so keyboard and screen-reader users land on it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  // Example posts and the posts-a-day estimate, refreshed shortly after the inputs settle.
  const previewPlatforms = step < 2 ? available : chosen;
  const key = JSON.stringify([type, terms, exclude, previewPlatforms, languages]);
  useEffect(() => {
    if (!terms.length) {
      setPreview(null);
      return;
    }
    let live = true;
    setLooking(true);
    const id = setTimeout(async () => {
      const res = await previewMonitor({ type, terms, excludeTerms: exclude, platforms: previewPlatforms, languages }).catch(() => null);
      if (live) {
        setPreview(res);
        setLooking(false);
      }
    }, 450);
    return () => {
      live = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const needles = useMemo(() => terms.map((x) => needleFor(type, x)), [terms, type]);

  const submit = () =>
    start(async () => {
      setError(null);
      const input = {
        name: name.trim(),
        type,
        platforms: chosen,
        terms,
        excludeTerms: type === "PROFILE" ? [] : exclude,
        languages,
        description: description.trim() || undefined,
        isCompetitor: (type === "KEYWORD" || type === "PROFILE") && competitor,
        refreshMinutes: refresh,
      };
      const res = initial?.id ? await updateMonitor(initial.id, input).catch(() => ({ ok: false as const, error: "failed" })) : await createMonitor(input).catch(() => ({ ok: false as const, error: "failed" }));
      if (res.ok) {
        if (initial?.id) {
          toast(v2.detail.saved);
          router.push(`/monitors/${initial.id}`);
        } else router.push(`/monitors/${res.id}?created=1`);
      } else setError(res.error === "limit" ? t.wizard.limitReached : res.error === "failed" ? common.failed : common.forbidden);
    });

  const review: { k: string; v: string[]; step: number }[] = [
    { k: W.review.name, v: [name.trim()], step: 1 },
    { k: W.review.type, v: [t.types[type]], step: 0 },
    ...(type === "TOPIC" ? [{ k: W.review.description, v: [description.trim()], step: 1 }] : []),
    { k: t.wizard.termsLabel[type], v: terms.map((x) => prefix + x), step: 1 },
    ...(type !== "PROFILE" && exclude.length ? [{ k: W.ignore, v: exclude, step: 1 }] : []),
    { k: W.review.languages, v: [langLabel(languages)], step: 1 },
    { k: W.review.platforms, v: chosen.length ? chosen.map((p) => platformLabels[p]) : [W.none], step: 2 },
    { k: W.review.frequency, v: [everyLabel(refresh, v2.detail.every)], step: 2 },
    ...((type === "KEYWORD" || type === "PROFILE") && competitor ? [{ k: W.review.competitor, v: [common.yes], step: 1 }] : []),
  ];

  const pickType = (ty: MonitorType) => setType(ty);
  const onTypeKey = (e: React.KeyboardEvent, i: number) => {
    const rtl = locale === "ar";
    const delta = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + TYPES.length) % TYPES.length;
    pickType(TYPES[next]);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col">
      <Link href={initial?.id ? `/monitors/${initial.id}` : "/monitors"} className="-ms-1 inline-flex items-center gap-1 self-start text-[14px] text-faint transition-colors hover:text-ink">
        <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" strokeWidth={1.8} /> {initial?.id ? initial.name : v2.detail.back}
      </Link>
      <h1 className="mt-1.5 text-[24px] font-semibold leading-tight md:text-[28px]">{title}</h1>

      <ol aria-label={W.stepsLabel} className="mt-7 grid grid-cols-4 gap-3">
        {stepLabels.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => reachable(i) && setStep(i)}
              disabled={!reachable(i)}
              aria-current={i === step ? "step" : undefined}
              className="flex w-full flex-col gap-2.5 text-start disabled:cursor-default"
            >
              <span className={cn("block h-1 rounded-sm transition-colors duration-200", i <= step ? "bg-ink" : "bg-line")} />
              <span className={cn("flex items-center gap-2 text-[14px] max-sm:text-[12.5px]", i === step ? "font-semibold text-ink" : i < step ? "text-muted" : "text-faint")}>
                <span className="font-normal text-faint tnum">{i + 1}</span>
                <span className={cn("truncate", i !== step && "max-sm:hidden")}>{label}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="step-h" className="flex flex-col rounded-[20px] bg-surface px-5 pb-6 pt-7 sm:px-8 sm:pt-8">
          <h2 id="step-h" ref={heading} tabIndex={-1} className="text-[20px] font-semibold outline-none">
            {headings[step]}
          </h2>

          {step === 0 && (
            <div role="radiogroup" aria-labelledby="step-h" className="mt-6 grid gap-3 sm:grid-cols-2">
              {TYPES.map((ty, i) => {
                const on = type === ty;
                return (
                  <button
                    type="button"
                    key={ty}
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => pickType(ty)}
                    onKeyDown={(e) => onTypeKey(e, i)}
                    className={cn(
                      "block rounded-2xl border p-[18px] text-start transition-[border-color,background-color] duration-150",
                      on ? "border-ink bg-canvas shadow-[inset_0_0_0_0.5px_var(--color-ink)]" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span aria-hidden className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] transition-colors", on ? "bg-ink text-on-ink" : "bg-sunken text-ink")}>
                        <MonitorGlyph type={ty} className="h-[19px] w-[19px]" />
                      </span>
                      <span className="flex-1 text-[15.5px] font-semibold">{t.types[ty]}</span>
                      <span aria-hidden className={cn("h-[18px] w-[18px] shrink-0 rounded-full transition-[border-width] duration-150", on ? "border-[5px] border-ink" : "border-[1.5px] border-faint")} />
                    </span>
                    <span className="mt-3 block text-[14px] leading-[1.55] text-muted">{t.typeHelp[ty]}</span>
                    <span dir="auto" className="mt-2 block text-[13px] text-faint">{t.typeExample[ty]}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <div className="mt-[22px] flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-[14px] font-medium">{t.wizard.name}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.wizard.namePlaceholder}
                  maxLength={80}
                  dir="auto"
                  className="h-11 rounded-[12px] border border-line bg-canvas px-3.5 text-[16px] outline-none transition-[border-color] placeholder:text-faint focus:border-ink md:text-[15px]"
                />
              </label>
              {type === "TOPIC" && (
                <label className="flex flex-col gap-2">
                  <span className="text-[14px] font-medium">{t.wizard.description}</span>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t.typeExample.TOPIC}
                    maxLength={500}
                    dir="auto"
                    className="resize-none rounded-[12px] border border-line bg-canvas px-3.5 py-[11px] text-[16px] leading-relaxed outline-none placeholder:text-faint focus:border-ink md:text-[15px]"
                  />
                  <span className="text-[13px] leading-normal text-faint">{t.wizard.descriptionHint}</span>
                </label>
              )}
              <div className="flex flex-col gap-2">
                <label htmlFor="terms" className="text-[14px] font-medium">
                  {t.wizard.termsLabel[type]}
                </label>
                <ChipInput id="terms" label={t.wizard.termsLabel[type]} removeLabel={W.removeTerm} value={terms} onChange={setTerms} placeholder={t.typeExample[type]} prefix={prefix} />
                <span className="text-[13px] leading-normal text-faint">{t.wizard.termsHint}</span>
              </div>
              {type !== "PROFILE" && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="exclude" className="text-[14px] font-medium">
                    {W.ignore} <span className="font-normal text-faint">{W.optional}</span>
                  </label>
                  <ChipInput id="exclude" label={W.ignore} removeLabel={W.removeTerm} value={exclude} onChange={setExclude} />
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="text-[14px] font-medium" id="langs">
                  {t.wizard.languages}
                </span>
                <Segmented
                  label={t.wizard.languages}
                  value={languages.join(",")}
                  options={LANGS.map((l) => ({ v: l.join(","), l: langLabel(l) }))}
                  onChange={(v) => setLanguages(v.split(",") as Lang[])}
                />
              </div>
              {(type === "KEYWORD" || type === "PROFILE") && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={competitor}
                  onClick={() => setCompetitor((c) => !c)}
                  className="flex items-start gap-3 rounded-[14px] border border-line px-4 py-3.5 text-start transition-colors hover:border-line-strong"
                >
                  <span className="mt-0.5">
                    <Box on={competitor} />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[14.5px] font-medium">{t.wizard.competitor}</span>
                    <span className="text-[13px] text-muted">{t.wizard.competitorHint}</span>
                  </span>
                </button>
              )}
            </div>
          )}

          {step === 2 && (
            <>
              <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {ALL_PLATFORMS.map((p) => {
                  const ok = available.includes(p);
                  const on = chosen.includes(p);
                  return (
                    <button
                      type="button"
                      key={p}
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={!ok}
                      onClick={() => ok && setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])}
                      className={cn(
                        "flex min-h-[60px] items-center gap-3 rounded-[14px] border px-4 py-3 text-start transition-[border-color,background-color] duration-150",
                        on ? "border-ink bg-canvas" : ok ? "border-line hover:border-line-strong" : "cursor-not-allowed border-dashed border-line opacity-55",
                      )}
                    >
                      <PlatformIcon platform={p} size="md" className="[&_svg]:fill-ink" />
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[14.5px] font-medium">{platformLabels[p]}</span>
                        {!ok && <span className="text-[12.5px] text-faint">{W.notAvailable}</span>}
                      </span>
                      <Box on={on} />
                    </button>
                  );
                })}
              </div>
              <div className="mt-8 flex flex-col gap-2.5">
                <span className="text-[14px] font-medium">{t.wizard.frequency}</span>
                <div className="self-start">
                  <Segmented label={t.wizard.frequency} value={refresh} options={[...new Set<number>([...FREQS, refresh])].sort((x, y) => x - y).map((m) => ({ v: m, l: (FREQS as readonly number[]).includes(m) ? freqLabel(m) : everyLabel(m, v2.detail.every) }))} onChange={setRefresh} />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <dl className="mt-5 flex flex-col">
                {review.map((r, i) => (
                  <div key={r.k} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)_auto]", i > 0 && "border-t border-line")}>
                    <dt className="text-[14px] text-muted max-sm:col-span-2">{r.k}</dt>
                    <dd className="text-[14.5px] font-medium leading-relaxed [overflow-wrap:anywhere]">
                      {r.v.map((x, j) => (
                        <span key={j}>
                          <bdi>{x}</bdi>
                          {j < r.v.length - 1 ? (locale === "ar" ? "، " : ", ") : ""}
                        </span>
                      ))}
                    </dd>
                    <button
                      type="button"
                      onClick={() => setStep(r.step)}
                      aria-label={`${common.edit}: ${r.k}`}
                      className="text-[13.5px] text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-current"
                    >
                      {common.edit}
                    </button>
                  </div>
                ))}
              </dl>
              {!editing && <p className="mt-2 text-[13.5px] leading-relaxed text-faint">{W.firstResults}</p>}
              {error && (
                <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-[13.5px] text-neg" style={{ background: "color-mix(in srgb, var(--color-neg) 8%, transparent)" }}>
                  {error}
                </p>
              )}
            </>
          )}

          <div className="mt-auto pt-7">
            <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
              <button
                type="button"
                className="-ms-3.5 h-10 rounded-[12px] px-3.5 text-[14px] text-muted transition-colors hover:bg-sunken hover:text-ink"
                onClick={() => (step === 0 || (editing && step === 3) ? router.push(initial?.id ? `/monitors/${initial.id}` : "/monitors") : setStep(step - 1))}
              >
                {step === 0 || (editing && step === 3) ? common.cancel : common.back}
              </button>
              <div className="flex items-center gap-3.5">
                <span className="text-[13px] text-faint tnum max-sm:hidden">{fill(W.stepOf, { n: step + 1, total: 4 })}</span>
                {step < 3 ? (
                  <button type="button" className="btn-primary h-10 px-[18px] text-[14px] font-semibold" disabled={!valid[step]} onClick={() => setStep(step + 1)}>
                    {common.next}
                  </button>
                ) : (
                  <button type="button" className="btn-primary h-10 px-[18px] text-[14px] font-semibold" disabled={pending || !valid.every(Boolean)} onClick={submit}>
                    {pending ? common.loading : editing ? v2.detail.saveChanges : t.wizard.create}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside aria-labelledby="ex-h" className="flex flex-col rounded-[20px] bg-surface p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="ex-h" className="text-[16px] font-semibold">
              {W.examples}
            </h2>
            <span className="text-[13px] text-faint">{W.last7}</span>
          </div>
          <div aria-live="polite" className={cn("flex flex-1 flex-col transition-opacity duration-150", looking && "opacity-60")}>
            {preview && preview.examples.length > 0 ? (
              <ul className="mt-2 flex flex-col">
                {preview.examples.map((e, i) => (
                  <li key={e.id} className={cn("py-4", i > 0 && "border-t border-line")}>
                    <div className="flex items-center gap-2.5">
                      <SolidAvatar name={e.name || "?"} seed={e.seed} size={30} />
                      <span dir="auto" className="min-w-0 flex-1 truncate text-[14px] font-semibold">{e.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-faint">
                        <PlatformIcon platform={e.platform} size="xs" title={platformLabels[e.platform]} className="[&_svg]:fill-muted" />
                        {timeShort(e.publishedAt, locale)}
                      </span>
                    </div>
                    <p dir="auto" className="mt-2.5 text-[14.5px] leading-[1.75] [overflow-wrap:anywhere]">
                      {highlight(e.text, needles).map((s, j) =>
                        s.hit ? (
                          <mark key={j} className="rounded px-0.5 py-px font-semibold text-ink" style={{ background: "color-mix(in srgb, var(--color-sand-500) 26%, transparent)" }}>
                            {s.t}
                          </mark>
                        ) : (
                          <span key={j}>{s.t}</span>
                        ),
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-[14px] leading-relaxed text-muted">
                {!terms.length ? W.addTerms : !previewPlatforms.length ? W.pickPlatform : looking && !preview ? W.looking : W.noExamples}
              </p>
            )}
          </div>
          <div className="mt-auto border-t border-line pt-4">
            {preview && preview.perDay > 0 ? (
              <>
                <p className="flex items-baseline gap-2 text-[13.5px] text-muted">
                  {W.about}
                  <span className="text-[20px] font-semibold text-ink tnum">
                    <span className="ltr-nums">{preview.basis === "rough" ? "~" : ""}{preview.perDay}</span>
                  </span>
                  {W.perDay}
                </p>
                <p className="mt-1 text-[12.5px] text-faint">{preview.basis === "rough" ? W.rough : W.measured}</p>
              </>
            ) : (
              <p className="text-[13.5px] text-faint">{looking ? W.looking : "\u00a0"}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
