"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import type { Dialect, Platform } from "@prisma/client";
import { createDraft } from "@/app/actions";
import { DotSpark } from "@/components/insight-ui";
import { PlatformIcon } from "@/components/platform";
import { cn } from "@/lib/utils";
import { FormatActions } from "./studio-client";

export type FormatItem = {
  id: string;
  name: string;
  momentum: string;
  momentumLabel: string;
  surfaces: string;
  views: string;
  summary: string;
  why: string;
  hook: string;
  spark: number[];
  saved: boolean;
  platforms: Platform[];
  structure: { label: string; description: string }[];
  posts: { id: string; platform: Platform; text: string; meta: string; url: string | null }[];
};

const COLOR: Record<string, string> = { RISING: "var(--color-pos)", NEW: "var(--color-info)", PEAKING: "var(--color-warn)", FADING: "var(--color-faint)" };
const TEXT: Record<string, string> = { RISING: "text-pos", NEW: "text-info", PEAKING: "text-warn", FADING: "text-faint" };
const WRITE_DIALECTS: Dialect[] = ["SAUDI", "KHALEEJI", "EGYPTIAN", "ENGLISH"];
const LENGTHS = [15, 30, 45, 60];

type Labels = {
  makePost: string;
  about: string;
  aboutPh: string;
  dialect: string;
  length: string;
  write: string;
  writing: string;
  moreOptions: string;
  aiOff: string;
  readOnly: string;
  structure: string;
  examples: string;
  pickFormat: string;
  save: string;
  saved: string;
  hide: string;
  failed: string;
};

/**
 * Studio formats: the trending list on one side, and a panel that turns the
 * selected format into a post (about, dialect, length, write) on the other.
 */
export function FormatStudio({
  formats,
  initialId,
  header,
  labels,
  dialects,
  voice,
  canEdit,
  aiOn,
}: {
  formats: FormatItem[];
  initialId?: string;
  header: React.ReactNode;
  labels: Labels;
  dialects: Record<string, string>;
  voice: { id: string; dialect: Dialect } | null;
  canEdit: boolean;
  aiOn: boolean;
}) {
  const [picked, setPicked] = useState(() => (formats.some((f) => f.id === initialId) ? initialId! : formats[0]?.id));
  const f = formats.find((x) => x.id === picked) ?? formats[0];
  const panel = useRef<HTMLElement>(null);

  const pick = (id: string) => {
    setPicked(id);
    const url = new URL(window.location.href);
    url.searchParams.set("f", id);
    window.history.replaceState(window.history.state, "", url);
    // Stacked layout (phones, tablets): the panel sits under the list, so bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
    }
  };

  return (
    <div className="full-bleed flex min-w-0 flex-1 flex-col md:overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="flex flex-col gap-7 px-4 pb-8 pt-6 md:px-10 md:pt-9 lg:overflow-y-auto lg:px-12 lg:pb-14 lg:pt-10">
        {header}
        <ul className="flex flex-col gap-2">
          {formats.map((x) => {
            const on = x.id === f?.id;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => pick(x.id)}
                  aria-pressed={on}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 rounded-[18px] bg-surface px-5 py-[18px] text-start transition-shadow duration-150 sm:grid-cols-[minmax(0,1fr)_160px_64px] sm:gap-6 sm:px-6 sm:py-[22px]",
                    on ? "shadow-[0_0_0_1.5px_var(--color-ink)]" : "hover:shadow-[0_0_0_1px_var(--color-line-strong)]",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span dir="auto" className="flex items-center gap-2 text-[16px] font-semibold sm:text-[17px]">
                      <span className="truncate">{x.name}</span>
                      {x.saved && <Bookmark className="h-3.5 w-3.5 shrink-0 fill-ink text-ink" aria-label={labels.saved} />}
                    </span>
                    <span className="truncate text-[13.5px] text-muted sm:text-[14px]">
                      {x.surfaces} · <span className="ltr-nums">{x.views}</span>
                    </span>
                  </span>
                  <span className="hidden w-40 sm:block">
                    <DotSpark id={`f-${x.id}`} values={x.spark} width={160} height={44} dot={4} color={COLOR[x.momentum]} />
                  </span>
                  <span className={cn("text-end text-[13.5px] font-semibold sm:w-16", TEXT[x.momentum])}>{x.momentumLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <aside ref={panel} aria-label={labels.makePost} className="scroll-mt-4 flex flex-col gap-[26px] border-t border-line bg-surface px-5 py-8 md:px-10 lg:overflow-y-auto lg:border-s lg:border-t-0 lg:px-9 lg:py-10">
        {f ? <MakePost key={f.id} f={f} labels={labels} dialects={dialects} voice={voice} canEdit={canEdit} aiOn={aiOn} /> : <p className="text-[14px] text-muted">{labels.pickFormat}</p>}
      </aside>
    </div>
  );
}

function MakePost({
  f,
  labels,
  dialects,
  voice,
  canEdit,
  aiOn,
}: {
  f: FormatItem;
  labels: Labels;
  dialects: Record<string, string>;
  voice: { id: string; dialect: Dialect } | null;
  canEdit: boolean;
  aiOn: boolean;
}) {
  const [state, action, pending] = useActionState(createDraft, null);
  const [dialect, setDialect] = useState<Dialect>(voice && WRITE_DIALECTS.includes(voice.dialect) ? voice.dialect : "SAUDI");
  const [length, setLength] = useState(30);
  const platform = useMemo(() => f.platforms[0] ?? "TIKTOK", [f.platforms]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (state && !state.ok) setError(state.error === "invalid" ? labels.failed : state.error);
  }, [state, labels.failed]);

  return (
    <>
      <div>
        <div className="text-[13px] text-faint">
          {f.momentumLabel} · <span className="ltr-nums">{f.views}</span>
        </div>
        <h2 dir="auto" className="mt-1.5 text-[22px] font-semibold leading-[1.3]">
          {f.name}
        </h2>
        <p dir="auto" className="mt-3 text-[15px] leading-[1.65] text-muted">
          {f.why || f.summary}
        </p>
      </div>

      {f.hook && (
        <div dir="auto" className="rounded-2xl bg-canvas px-5 py-[18px] text-[18px] leading-[1.7]">
          {f.hook}
        </div>
      )}

      {(f.structure.length > 0 || f.posts.length > 0) && (
        <details className="group -mt-2 text-[14px]">
          <summary className="cursor-pointer list-none text-[13.5px] text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="me-1.5 inline-block transition-transform duration-150 group-open:rotate-90 rtl:-scale-x-100" aria-hidden>
              ›
            </span>
            {labels.structure} · {labels.examples}
          </summary>
          <ol className="mt-3 space-y-2">
            {f.structure.map((b, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunken text-[11px] font-semibold ltr-nums">{i + 1}</span>
                <span dir="auto" className="leading-relaxed">
                  <b className="font-semibold">{b.label}</b>: {b.description}
                </span>
              </li>
            ))}
          </ol>
          <ul className="mt-3 space-y-2">
            {f.posts.map((p) => (
              <li key={p.id} className="flex items-start gap-2.5 rounded-xl bg-canvas p-3">
                <PlatformIcon platform={p.platform} size="sm" />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="line-clamp-2 text-[13px]">
                    {p.text}
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted ltr-nums">{p.meta}</p>
                </div>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted hover:text-ink" aria-label={p.url}>
                    ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {canEdit ? (
        <form action={action} className="flex flex-1 flex-col gap-[26px]" onSubmit={() => setError(null)}>
          <input type="hidden" name="formatId" value={f.id} />
          <input type="hidden" name="goal" value="awareness" />
          <input type="hidden" name="platform" value={platform} />
          <input type="hidden" name="dialect" value={dialect} />
          <input type="hidden" name="durationSec" value={length} />
          {voice && <input type="hidden" name="voiceId" value={voice.id} />}

          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-medium">{labels.about}</span>
            <textarea
              name="brief"
              required
              minLength={3}
              rows={2}
              dir="auto"
              placeholder={labels.aboutPh}
              className="w-full resize-none rounded-[14px] border border-line bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-ink/40 max-sm:text-[16px]"
            />
          </label>

          <Choice label={labels.dialect} options={WRITE_DIALECTS.map((d) => ({ value: d, label: dialects[d] }))} value={dialect} onChange={(v) => setDialect(v as Dialect)} />
          <Choice label={labels.length} options={LENGTHS.map((n) => ({ value: String(n), label: `${n}s` }))} value={String(length)} onChange={(v) => setLength(Number(v))} ltr />

          <div className="mt-auto flex flex-col gap-3 pt-2">
            {!aiOn && <p className="rounded-xl bg-sand-50 px-3 py-2 text-[12.5px] text-sand-700">{labels.aiOff}</p>}
            {error && (
              <p role="alert" className="text-[13px] text-neg">
                {error}
              </p>
            )}
            <button
              disabled={pending || !aiOn}
              className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-ink text-[16px] font-semibold text-on-ink transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? labels.writing : labels.write}
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[13px]">
              <FormatActions id={f.id} saved={f.saved} labels={{ save: labels.save, saved: labels.saved, hide: labels.hide }} />
              <Link prefetch={false} href={`/studio/new?format=${f.id}`} className="ms-auto text-[13.5px] text-muted transition-colors hover:text-ink">
                {labels.moreOptions}
              </Link>
            </div>
          </div>
        </form>
      ) : (
        <p className="mt-auto text-[13.5px] text-muted">{labels.readOnly}</p>
      )}
    </>
  );
}

/** Segmented single choice with radio semantics. */
function Choice({ label, options, value, onChange, ltr }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; ltr?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2.5">
      <span className="text-[14px] font-medium" aria-hidden>
        {label}
      </span>
      <div className="flex gap-0.5 rounded-[12px] bg-sunken p-[3px]">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cn("h-[34px] flex-1 truncate rounded-[9px] px-2 text-[14px] transition-colors duration-150", ltr && "ltr-nums", on ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
