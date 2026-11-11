"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, Plus, Sparkle, Trash2, Video, X } from "lucide-react";
import { useClientDict, fill } from "@/components/client-dict";
import { confirmDialog, toast } from "@/components/feedback";
import type { Dict } from "@/lib/i18n/en";
import type { DraftContent } from "@/lib/ai/studio";
import { reflowBeats, toSrt } from "@/lib/trends/score";
import { beatForNote } from "@/lib/draft-notes";
import { deleteDraft, refineDraft, saveDraftContent, setDraftStatus } from "@/app/actions";
import { cn, guessLang } from "@/lib/utils";
import { restoreDraftVersion } from "./actions";
import { RoughCut, fileSlug, shotColor, useClips, type RoughCutHandle } from "./rough-cut";

type P = Dict["draftPage"];
type SD = Dict["studio"]["draft"];
type Content = DraftContent & { selected_hook?: number };
type Status = "GENERATING" | "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "FAILED";
type Tab = "script" | "shots" | "captions" | "edit";
export type VersionRow = { n: number; when: string; what: string; quoted: boolean };

const NO_OUTLINE = { outline: "none" } as const;

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const srtStamp = (sec: number) => {
  const ms = Math.round(sec * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** A line of the script the team can click into and edit in place. */
function Cell({
  value,
  onChange,
  onFocus,
  disabled,
  className,
  label,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
} & Record<`data-${string}`, string | number>) {
  return (
    <textarea
      {...rest}
      dir="auto"
      rows={1}
      value={value}
      disabled={disabled}
      aria-label={label}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
      style={NO_OUTLINE}
      className={cn(
        "block min-h-9 w-full resize-none rounded-[10px] bg-transparent px-[9px] py-1.5 text-[14.5px] leading-[1.75] [field-sizing:content] transition-[box-shadow,background-color] duration-150",
        "enabled:hover:bg-canvas/70 focus:bg-surface focus:shadow-[0_0_0_1.5px_var(--color-ink)] disabled:cursor-default",
        className,
      )}
    />
  );
}

function Dot({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", tone)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function DraftEditor({
  id,
  versionKey,
  status: rawStatus,
  error,
  content: initial,
  title,
  meta,
  back,
  canEdit,
  canApprove,
  versions,
  P,
  S,
  unsupported,
}: {
  id: string;
  versionKey: string;
  status: string;
  error: string | null;
  content: DraftContent;
  title: string;
  meta: { format: string | null; platform: string; dialect: string; seconds: string; edited: string };
  back: React.ReactNode;
  canEdit: boolean;
  canApprove: boolean;
  versions: VersionRow[];
  locale: "ar" | "en";
  P: P;
  S: SD;
  unsupported: string;
}) {
  const status = rawStatus as Status;
  const [c, setC] = useState<Content>(initial);
  const [dirty, setDirty] = useState(false);
  const [seenKey, setSeenKey] = useState(versionKey);
  // New content from the server (a rewrite finished, a restore, a save) replaces the local copy unless it has unsaved edits.
  if (seenKey !== versionKey) {
    setSeenKey(versionKey);
    if (!dirty) setC(initial);
  }
  const [instruction, setInstruction] = useState("");
  const [tab, setTab] = useState<Tab>("script");
  const [beatFocus, setBeatFocus] = useState(0);
  const [flash, setFlash] = useState(-1);
  const [pending, start] = useTransition();
  const { common } = useClientDict();
  const { media, add, remove } = useClips();
  const rough = useRef<RoughCutHandle>(null);
  const generating = status === "GENERATING";
  const locked = !canEdit || generating;

  const update = (fn: (x: Content) => Content | void) => {
    setC((x) => {
      const copy = structuredClone(x);
      return fn(copy) ?? copy;
    });
    setDirty(true);
  };
  const beats = useMemo(() => reflowBeats(c.beats), [c.beats]);
  const total = beats.reduce((a, b) => Math.max(a, b.start + b.duration), 0);
  const selectedHook = c.selected_hook ?? Math.max(0, c.hooks.findIndex((h) => h.text === c.beats[0]?.vo));

  const persist = async () => {
    const res = await saveDraftContent(id, c);
    if (!res.ok) throw new Error("save");
    setDirty(false);
    setC((x) => ({ ...x, beats: reflowBeats(x.beats) }));
  };
  const save = () =>
    start(async () => {
      try {
        await persist();
        toast(P.saved);
      } catch {
        toast(common.failed, "error", { retry: save });
      }
    });
  const discard = () => {
    setC(initial);
    setDirty(false);
  };
  const refine = (text: string) =>
    text.trim() &&
    !generating &&
    start(async () => {
      try {
        if (dirty) await persist();
        await refineDraft(id, text.trim());
        setInstruction("");
        toast(P.rewriting, "info", { busy: true });
      } catch {
        toast(common.failed, "error", { retry: () => refine(text) });
      }
    });
  const moveTo = (s: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED") =>
    start(async () => {
      try {
        if (dirty) await persist();
        await setDraftStatus(id, s);
        toast(`${P.stepsLabel}: ${S.status[s]}`);
      } catch {
        toast(common.failed, "error", { retry: () => moveTo(s) });
      }
    });
  const remove_ = async () => {
    const detail = versions.length > 1 ? fill(P.deleteDetail, { title, n: versions.length }) : fill(P.deleteDetailOne, { title });
    if (await confirmDialog(P.deleteConfirm, { detail, danger: true, confirmLabel: common.delete })) start(() => deleteDraft(id));
  };
  const restore = async (n: number) => {
    if (!(await confirmDialog(fill(P.restoreConfirm, { n }), { detail: P.restoreDetail, confirmLabel: P.restore }))) return;
    start(async () => {
      const r = await restoreDraftVersion(id, n);
      if (!r.ok) return toast(common.failed, "error");
      setDirty(false);
      toast(fill(P.restoredToast, { n }));
    });
  };

  const exportSrt = () => download(`${fileSlug(title)}.srt`, toSrt(beats), "application/x-subrip");
  const exportCsv = () =>
    download(
      `${fileSlug(title)}-shots.csv`,
      "﻿" +
        [["#", "type", "description", "location", "props", "talent", "seconds", "notes"].join(","), ...c.shots.map((s) => [s.n, s.type, s.description, s.location, s.props, s.talent, s.duration, s.notes].map(csvCell).join(","))].join("\r\n"),
      "text/csv;charset=utf-8",
    );

  // Compliance notes that point at a script line can jump there.
  const compliance = c.compliance;
  const notes = compliance.notes.map((n) => ({ text: n, beat: compliance.status === "PASS" ? -1 : beatForNote(n, beats) }));
  const flagged = new Set(notes.map((n) => n.beat).filter((b) => b >= 0));
  const goToLine = (i: number) => {
    setTab("script");
    setBeatFocus(i);
    setFlash(i);
    setTimeout(() => setFlash(-1), 1200);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`[data-beat-vo="${i}"]`);
      el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
    });
  };

  const next: Record<string, { to: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED"; label: string; allowed: boolean } | undefined> = {
    DRAFT: { to: "IN_REVIEW", label: P.next.DRAFT, allowed: canEdit },
    IN_REVIEW: { to: "APPROVED", label: canApprove ? P.next.IN_REVIEW : P.waiting, allowed: canApprove },
    APPROVED: { to: "PUBLISHED", label: P.next.APPROVED, allowed: canEdit },
    PUBLISHED: { to: "DRAFT", label: P.next.PUBLISHED, allowed: canEdit },
  };
  const step = next[status];
  const pill: Record<Status, string> = {
    GENERATING: "bg-sand-50 text-sand-700",
    DRAFT: "bg-sunken text-muted",
    IN_REVIEW: "bg-info/[0.12] text-info",
    APPROVED: "bg-pos/[0.12] text-pos",
    PUBLISHED: "bg-ink text-on-ink",
    FAILED: "bg-neg/[0.1] text-neg",
  };

  const usedShots = [...new Set(c.shots.map((s) => s.n))];
  const withClip = usedShots.filter((n) => media[n]).length;
  const tabMeta = {
    script: fill(P.meta.script, { n: beats.length, s: total.toFixed(1) }),
    shots: fill(P.meta.shots, { n: c.shots.length, c: withClip }),
    captions: fill(P.meta.captions, { lang: P.langs[guessLang(c.caption || c.beats.map((b) => b.vo).join(" "))] }),
    edit: fill(P.meta.edit, { n: c.edit.transitions.length }),
  }[tab];
  const role = (i: number) => (i === 0 ? "hook" : i === beats.length - 1 && beats.length > 1 ? "cta" : "body");
  const roleTone = { hook: "bg-chart/[0.13] text-chart", body: "bg-sunken text-muted", cta: "bg-pos/[0.13] text-pos" };
  const dirtyBar = canEdit && dirty && (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-sunken bg-surface px-5 py-3 max-md:bottom-[calc(4.25rem+env(safe-area-inset-bottom))]">
      <span className="min-w-0 flex-1 text-[13.5px] text-muted">{P.unsaved}</span>
      <button type="button" onClick={discard} disabled={pending} className="btn-ghost h-9 rounded-[10px] px-3 text-[13.5px]">{P.discard}</button>
      <button type="button" onClick={save} disabled={pending} className="btn-primary h-9 rounded-[10px] px-3.5 text-[13.5px] font-semibold">{P.save}</button>
    </div>
  );

  return (
    <div className="full-bleed flex min-h-0 min-w-0 flex-1 flex-col md:overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_384px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <section className="min-w-0 px-4 pt-6 pb-10 md:px-10 md:pt-8 md:pb-14 lg:overflow-y-auto">
        <div className="mx-auto flex max-w-[960px] flex-col gap-5">
          {/* Header: back, delete, export and the next step in the review flow */}
          <div className="flex h-10 items-center gap-2">
            {back}
            <span className="flex-1" />
            {canEdit && (
              <button type="button" onClick={remove_} disabled={pending} aria-label={P.delete} title={P.delete} className="flex h-10 w-10 items-center justify-center rounded-[12px] text-muted transition-colors hover:bg-sunken hover:text-neg max-md:h-11 max-md:w-11">
                <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
              </button>
            )}
            <ExportMenu P={P} onSrt={exportSrt} onCsv={exportCsv} onWebm={() => rough.current?.exportVideo()} />
            {canEdit && ["IN_REVIEW", "APPROVED"].includes(status) && (
              <button type="button" onClick={() => moveTo("DRAFT")} disabled={pending} className="btn-ghost hidden h-10 px-3 text-[14px] sm:inline-flex">
                {P.reopen}
              </button>
            )}
            {step && (
              <button type="button" onClick={() => moveTo(step.to)} disabled={pending || generating || !step.allowed} className="btn-primary h-10 px-[18px] text-[14px] font-semibold">
                {step.label}
              </button>
            )}
          </div>

          <header className="-mt-2 flex flex-col gap-2.5">
            <h1 dir="auto" className="text-[24px] leading-[1.3] font-semibold md:text-[28px]">{title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] leading-5 text-muted" aria-label={P.stepsLabel}>
              <span className={cn("inline-flex h-[26px] items-center gap-1.5 rounded-lg px-[9px] text-[12.5px] font-semibold", pill[status])}>
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full bg-current", generating && "animate-pulse")} />
                {S.status[status] ?? status}
              </span>
              {[meta.format && (
                <span key="f">
                  {S.basedOn}{" "}
                  <a href="/studio?tab=formats" className="text-ink underline decoration-faint underline-offset-4 hover:decoration-ink">{meta.format}</a>
                </span>
              ), meta.platform, meta.dialect, meta.seconds, meta.edited]
                .filter(Boolean)
                .map((m, i) => (
                  <span key={i} className="inline-flex items-center gap-3">
                    {i > 0 && <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-faint" />}
                    {m}
                  </span>
                ))}
            </div>
            {error && !generating && <p className="text-[12.5px] text-neg" dir="ltr">{error}</p>}
          </header>

          {/* Rewrite bar */}
          {canEdit && (
            <div className="card flex flex-col gap-3 p-3 sm:p-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  refine(instruction);
                }}
              >
                <label className="flex h-[42px] min-w-0 flex-1 items-center gap-2.5 rounded-[12px] border border-line px-3.5 transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100">
                  {generating ? <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted" /> : <Sparkle aria-hidden className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.6} />}
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder={generating ? P.rewriting : P.rewritePh}
                    disabled={generating}
                    maxLength={500}
                    dir="auto"
                    style={NO_OUTLINE}
                    aria-label={P.rewrite}
                    className="h-full min-w-0 flex-1 truncate bg-transparent text-[16px] placeholder:text-faint md:text-[14.5px]"
                  />
                </label>
                <button className="btn-primary h-[42px] px-4 text-[14px] font-semibold" disabled={generating || pending || !instruction.trim()}>{P.rewrite}</button>
              </form>
              <div className="flex flex-wrap gap-1.5">
                {S.quick.map((q) => (
                  <button type="button" key={q} disabled={generating || pending} onClick={() => refine(q)} className="h-[30px] rounded-[9px] bg-sunken px-3 text-[13px] transition-colors hover:bg-line disabled:opacity-50 max-md:h-9">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hook options */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[16px] font-semibold">{P.hooks}</span>
              <span className="text-[13px] text-faint">{P.hooksHint}</span>
            </div>
            <div role="radiogroup" aria-label={P.hooks} className={cn("grid gap-3 md:grid-cols-3", generating && "opacity-60")}>
              {c.hooks.map((h, i) => {
                const on = i === selectedHook;
                const pick = () =>
                  !locked &&
                  !on &&
                  update((x) => {
                    x.selected_hook = i;
                    if (x.beats[0]) {
                      x.beats[0].vo = x.hooks[i].text;
                      x.beats[0].onScreen = x.hooks[i].on_screen;
                    }
                  });
                return (
                  <div
                    key={i}
                    role="radio"
                    aria-checked={on}
                    tabIndex={0}
                    onClick={pick}
                    onKeyDown={(e) => e.target === e.currentTarget && (e.key === " " || e.key === "Enter") && (e.preventDefault(), pick())}
                    className={cn(
                      "flex cursor-pointer flex-col gap-2.5 rounded-[16px] bg-surface p-4 text-start transition-shadow duration-150",
                      on ? "shadow-[0_0_0_1.5px_var(--color-ink)]" : "hover:shadow-[0_0_0_1px_var(--color-line-strong)]",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 text-[12.5px] text-faint">
                      <span className="truncate" dir="auto">{h.why}</span>
                      <span aria-hidden className={cn("h-4 w-4 shrink-0 rounded-full", on ? "border-[5px] border-ink" : "border-[1.5px] border-faint")} />
                    </span>
                    <Cell
                      value={h.text}
                      disabled={locked}
                      label={`${P.hooks} ${i + 1}`}
                      onFocus={pick}
                      onChange={(v) =>
                        update((x) => {
                          x.hooks[i].text = v;
                          if (on && x.beats[0]) x.beats[0].vo = v;
                        })
                      }
                      className="-mx-[9px] w-[calc(100%+18px)] text-[15px] font-semibold"
                    />
                    <span className="mt-auto flex items-baseline gap-2 border-t border-sunken pt-2.5 text-[12.5px] text-faint">
                      <span className="shrink-0">{P.onScreen}</span>
                      <input
                        value={h.on_screen}
                        disabled={locked}
                        dir="auto"
                        style={NO_OUTLINE}
                        aria-label={`${P.onScreen} ${i + 1}`}
                        onFocus={pick}
                        onChange={(e) =>
                          update((x) => {
                            x.hooks[i].on_screen = e.target.value;
                            if (on && x.beats[0]) x.beats[0].onScreen = e.target.value;
                          })
                        }
                        className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 text-[13.5px] text-ink focus:bg-canvas"
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div role="tablist" aria-label={P.tabsLabel} className="flex max-w-full gap-0.5 overflow-x-auto rounded-[12px] bg-sunken p-[3px] [scrollbar-width:none]">
              {(["script", "shots", "captions", "edit"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`tab-${k}`}
                  aria-selected={tab === k}
                  aria-controls={`pane-${k}`}
                  onClick={() => setTab(k)}
                  className={cn("h-8 shrink-0 rounded-[9px] px-3.5 text-[13.5px] whitespace-nowrap transition-colors max-md:h-10", tab === k ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink")}
                >
                  {P.tabs[k]}
                </button>
              ))}
            </div>
            <span className="text-[13.5px] text-faint tnum">{tabMeta}</span>
          </div>

          <div id={`pane-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={cn(generating && "pointer-events-none opacity-60")}>
            {tab === "script" && (
              <section className="card overflow-clip">
                <div className="hidden h-11 grid-cols-[64px_150px_minmax(0,1fr)_26px] items-center gap-3.5 px-4 text-[12.5px] text-faint md:grid">
                  <span>{P.time}</span>
                  <span>{P.screen}</span>
                  <span>{P.voVisual}</span>
                  <span className="text-end">{P.shot}</span>
                </div>
                {beats.map((b, i) => {
                  const r = role(i);
                  return (
                    <div
                      key={i}
                      id={`beat-${i}`}
                      onFocus={() => setBeatFocus(i)}
                      className={cn(
                        "group grid grid-cols-[64px_minmax(0,1fr)_26px] items-start gap-x-3.5 gap-y-1 border-t border-sunken px-4 py-3 transition-colors duration-300 md:grid-cols-[64px_150px_minmax(0,1fr)_26px] md:border-t",
                        flash === i && "bg-warn/[0.08]",
                      )}
                    >
                      <span className="row-span-2 flex flex-col gap-1.5 pt-1.5 md:row-span-1">
                        <span className={cn("inline-flex h-[22px] items-center self-start rounded-[7px] px-[7px] text-[11.5px] font-semibold", roleTone[r])}>{P.roles[r]}</span>
                        <span dir="ltr" className="text-start text-[13px] text-muted tnum rtl:text-end">
                          {b.start.toFixed(1)}–{(b.start + b.duration).toFixed(1)}s
                        </span>
                        {canEdit && (
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="30"
                            value={c.beats[i]?.duration ?? b.duration}
                            disabled={locked}
                            aria-label={`${P.seconds} ${i + 1}`}
                            onChange={(e) => update((x) => void (x.beats[i].duration = Number(e.target.value)))}
                            className="hidden h-7 w-14 rounded-md border border-line bg-surface px-1.5 text-[12.5px] group-focus-within:block"
                            dir="ltr"
                          />
                        )}
                        {flagged.has(i) && <span className="text-[12.5px] text-warn"><Dot tone="">{P.review}</Dot></span>}
                      </span>
                      <Cell value={c.beats[i].onScreen} disabled={locked} label={`${P.screen} ${i + 1}`} onChange={(v) => update((x) => void (x.beats[i].onScreen = v))} className="font-semibold md:order-none" />
                      <span className="col-start-2 flex min-w-0 flex-col gap-0.5 md:col-start-auto">
                        <Cell value={c.beats[i].vo} disabled={locked} label={`${P.voVisual} ${i + 1}`} data-beat-vo={i} onChange={(v) => update((x) => void (x.beats[i].vo = v))} />
                        <span className="flex items-start gap-[7px] ps-[9px]">
                          <Video aria-hidden className="mt-[9px] h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.7} />
                          <Cell value={c.beats[i].visual} disabled={locked} label={`${P.voVisual} ${i + 1}`} onChange={(v) => update((x) => void (x.beats[i].visual = v))} className="-ms-[9px] min-h-0 py-1 text-[13px] leading-[1.55] text-muted" />
                        </span>
                      </span>
                      <span
                        className="col-start-3 row-start-1 mt-1 flex h-[26px] w-[26px] items-center justify-center justify-self-end rounded-lg text-[12.5px] font-semibold text-white md:col-start-auto md:row-start-auto"
                        style={{ background: shotColor(b.shot) }}
                      >
                        {b.shot}
                      </span>
                    </div>
                  );
                })}
                {dirtyBar}
              </section>
            )}

            {tab === "shots" && (
              <section className="card overflow-clip">
                {c.shots.map((s, i) => {
                  const m = media[s.n];
                  return (
                    <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3.5 border-t border-sunken px-5 py-4 first:border-0 md:grid-cols-[28px_minmax(0,1fr)_196px]">
                      <span className="mt-px flex h-7 w-7 items-center justify-center self-start rounded-lg text-[13px] font-semibold text-white" style={{ background: shotColor(s.n) }}>{s.n}</span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-[14.5px] font-semibold">
                          {s.type.replace(/_/g, " ").toLowerCase().replace(/^./, (x) => x.toUpperCase())}
                          <span className="font-normal text-faint"> · <span className="tnum">{s.duration}s</span></span>
                        </span>
                        <Cell value={s.description} disabled={locked} label={`${P.shot} ${s.n}`} onChange={(v) => update((x) => void (x.shots[i].description = v))} className="-ms-[9px] min-h-0 py-0.5 text-[14px] leading-[1.55]" />
                        <span dir="auto" className="text-[12.5px] leading-normal text-faint">{[s.location, s.props, s.talent].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="col-start-2 md:col-start-auto">
                        {m ? (
                          <span className="flex h-10 items-center gap-2 rounded-[10px] bg-canvas ps-3 pe-1 text-[13px]">
                            <Video aria-hidden className="h-[15px] w-[15px] shrink-0 text-muted" strokeWidth={1.7} />
                            <span dir="ltr" className="min-w-0 flex-1 truncate">{m.name}</span>
                            <button type="button" onClick={() => remove(s.n)} aria-label={P.removeClip} className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-faint hover:bg-sunken hover:text-ink">
                              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                            </button>
                          </span>
                        ) : (
                          <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-line text-[13.5px] text-muted transition-colors hover:border-line-strong hover:text-ink focus-within:border-ink">
                            <Plus aria-hidden className="h-[15px] w-[15px]" strokeWidth={1.8} />
                            {P.addClip}
                            <input type="file" accept="video/*,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && add(s.n, e.target.files[0])} />
                          </label>
                        )}
                      </span>
                    </div>
                  );
                })}
                {dirtyBar}
              </section>
            )}

            {tab === "captions" && (
              <>
                <section className="grid gap-3 md:grid-cols-2">
                  <div className="card flex flex-col gap-4 p-5">
                    <label className="flex flex-col gap-2">
                      <span className="text-[13px] text-faint">{P.caption}</span>
                      <Cell value={c.caption} disabled={locked} onChange={(v) => update((x) => void (x.caption = v))} className="min-h-24 rounded-[12px] px-3 py-2.5 leading-[1.8] shadow-[inset_0_0_0_1px_var(--color-line)]" />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-[13px] text-faint">{P.hashtags}</span>
                      <input
                        dir="auto"
                        value={c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                        disabled={locked}
                        style={NO_OUTLINE}
                        onChange={(e) => update((x) => void (x.hashtags = e.target.value.split(/\s+/).map((h) => h.replace(/^#+/, "")).filter(Boolean)))}
                        className="h-9 rounded-[10px] bg-transparent px-1 text-[14px] leading-[1.8] text-info focus:bg-canvas"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-[13px] text-faint">{P.cta}</span>
                      <input
                        dir="auto"
                        value={c.cta}
                        disabled={locked}
                        onChange={(e) => update((x) => void (x.cta = e.target.value))}
                        className="input h-10 rounded-[12px] px-3 md:text-[14.5px]"
                      />
                    </label>
                  </div>
                  <div className="card flex flex-col gap-3 p-5">
                    <span className="flex items-baseline justify-between text-[13px] text-faint">
                      <span>{P.subtitles}</span>
                      <span>{fill(P.cues, { n: beats.filter((b) => (b.vo || b.onScreen).trim()).length })}</span>
                    </span>
                    <div className="flex max-h-[340px] flex-1 flex-col gap-3 overflow-y-auto rounded-[12px] bg-canvas px-4 py-3.5">
                      {beats
                        .filter((b) => (b.vo || b.onScreen).trim())
                        .map((b, i) => (
                          <span key={i} className="flex flex-col gap-0.5">
                            <span dir="ltr" className="text-start font-mono text-[11.5px] text-faint">
                              {i + 1}  {srtStamp(b.start)} → {srtStamp(b.start + b.duration)}
                            </span>
                            <span dir="auto" className="text-[13.5px] leading-[1.75]">{b.vo || b.onScreen}</span>
                          </span>
                        ))}
                    </div>
                    <button type="button" onClick={exportSrt} className="btn-secondary h-[38px] rounded-[11px] text-[13.5px]">{P.downloadSrt}</button>
                  </div>
                </section>
                {dirtyBar && <div className="card mt-3 overflow-clip">{dirtyBar}</div>}
              </>
            )}

            {tab === "edit" && (
              <section className="card px-5 py-2 sm:px-6">
                {([
                  [S.music, c.edit.music],
                  [S.pacing, c.edit.pacing],
                  [S.captionsStyle, c.edit.captions_style],
                  [S.transitions, c.edit.transitions.join(", ")],
                  [S.sfx, c.edit.sfx.join(", ")],
                ] as const).map(([k, v]) => (
                  <div key={k} className="grid gap-1 border-t border-sunken py-4 first:border-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                    <span className="text-[13.5px] text-faint">{k}</span>
                    <span dir="auto" className="text-[14.5px] leading-relaxed">{v}</span>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </section>

      <aside aria-label={P.rough} className="flex flex-col gap-7 border-line bg-surface px-5 pt-8 pb-28 md:px-7 md:pb-12 lg:overflow-y-auto lg:border-s">
        <RoughCut ref={rough} beats={beats} shots={c.shots} title={title} seek={beatFocus} t={{ ...P, unsupported }} />

        <div className="flex flex-col gap-3 rounded-[16px] bg-canvas p-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-[14.5px] font-semibold">{P.compliance}</span>
            <span
              className={cn(
                "inline-flex h-[26px] items-center gap-1.5 rounded-lg px-[9px] text-[12.5px] font-semibold",
                compliance.status === "PASS" ? "bg-pos/[0.13] text-pos" : compliance.status === "FAIL" ? "bg-neg/[0.12] text-neg" : "bg-warn/[0.14] text-warn",
              )}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              {S.complianceStatus[compliance.status]}
            </span>
          </div>
          {notes.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {notes.map((n) => (
                <li key={n.text} className={cn("flex gap-2.5 text-[13.5px] leading-[1.6]", compliance.status === "PASS" && "text-muted")}>
                  <span aria-hidden className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", compliance.status === "PASS" ? "bg-pos" : compliance.status === "FAIL" ? "bg-neg" : "bg-warn")} />
                  <span dir="auto" className="min-w-0 [overflow-wrap:anywhere]">
                    {n.text}{" "}
                    {n.beat >= 0 && (
                      <button type="button" onClick={() => goToLine(n.beat)} className="whitespace-nowrap text-ink underline decoration-faint underline-offset-4 hover:decoration-ink">
                        {P.goToLine}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <VoiceGauge score={c.voice_match.score} notes={c.voice_match.notes} label={P.voice} />

        {versions.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="mb-1.5 text-[14.5px] font-semibold">{P.history}</span>
            {versions.map((v, i) => (
              <div key={v.n} className="group grid min-h-8 grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-2.5 text-[13.5px]">
                <span className="text-faint tnum">v{v.n}</span>
                <span dir="auto" className="truncate" title={v.what}>{v.what}</span>
                {i > 0 && canEdit && !generating ? (
                  <span className="relative text-end">
                    <span className="text-[12.5px] text-faint transition-opacity group-focus-within:opacity-0 group-hover:opacity-0 [@media(hover:none)]:hidden">{v.when}</span>
                    <button
                      type="button"
                      onClick={() => restore(v.n)}
                      disabled={pending}
                      className="absolute end-0 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium whitespace-nowrap text-ink opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
                    >
                      {P.restore}
                    </button>
                  </span>
                ) : (
                  <span className="text-[12.5px] text-faint">{i === 0 ? `${P.current} · ${v.when}` : v.when}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function ExportMenu({ P, onSrt, onCsv, onWebm }: { P: P; onSrt: () => void; onCsv: () => void; onWebm: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const items = [
    { label: P.exports.srt, ext: ".srt", run: onSrt },
    { label: P.exports.csv, ext: ".csv", run: onCsv },
    { label: P.exports.webm, ext: ".webm", run: onWebm },
  ];
  return (
    <div ref={wrap} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="btn-secondary h-10 gap-2 ps-4 pe-3 text-[14px]">
        {P.export}
        <ChevronDown aria-hidden className="h-[15px] w-[15px] text-muted" strokeWidth={1.8} />
      </button>
      {open && (
        <div role="menu" className="animate-pop absolute top-[46px] end-0 z-30 flex w-[220px] origin-top-right flex-col gap-0.5 rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.14)] rtl:origin-top-left">
          {items.map((x) => (
            <button
              key={x.ext}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                x.run();
              }}
              className="flex h-10 items-center justify-between rounded-[9px] px-2.5 text-[14px] transition-colors hover:bg-canvas"
            >
              <span>{x.label}</span>
              <span className="text-[12.5px] text-faint" dir="ltr">{x.ext}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 42 ticks, filled up to the score: a quiet gauge for how on-brand the script sounds. */
function VoiceGauge({ score, notes, label }: { score: number; notes: string; label: string }) {
  const tone = score >= 80 ? "var(--color-pos)" : score >= 60 ? "var(--color-warn)" : "var(--color-neg)";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[14.5px] font-semibold">{label}</span>
        <span className="text-[22px] font-semibold tnum" style={{ color: tone }}>{score}</span>
      </div>
      <svg viewBox="0 0 336 18" className="block h-auto w-full" role="img" aria-label={`${label}: ${score}/100`} style={{ direction: "ltr" }}>
        {Array.from({ length: 42 }, (_, i) => {
          const x = 1.5 + i * (333 / 41);
          return <line key={i} x1={x} x2={x} y1={2} y2={16} strokeWidth={3} strokeLinecap="round" style={{ stroke: i / 41 <= score / 100 ? tone : "var(--color-line)" }} />;
        })}
      </svg>
      <span dir="auto" className="text-[13.5px] leading-[1.6] text-muted">{notes}</span>
    </div>
  );
}
