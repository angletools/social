"use client";

import { useClientDict } from "@/components/client-dict";
import { confirmDialog, toast } from "@/components/feedback";
import { useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, Clapperboard, Download, FileText, ListChecks, Loader2, Music, PenLine, Trash2, XCircle } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import type { DraftContent } from "@/lib/ai/studio";
import { reflowBeats, toSrt } from "@/lib/trends/score";
import { deleteDraft, refineDraft, saveDraftContent, setDraftStatus } from "@/app/actions";
import { cn } from "@/lib/utils";
import { RoughCut, fileSlug } from "./rough-cut";

type S = Dict["studio"];

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

function Editable({ value, onChange, disabled, className, multiline }: { value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; multiline?: boolean }) {
  return multiline ? (
    <textarea
      dir="auto"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className={cn("w-full resize-none rounded-lg [field-sizing:content] border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-line focus:border-brand-500 focus:bg-white", className)}
    />
  ) : (
    <input
      dir="auto"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-line focus:border-brand-500 focus:bg-white", className)}
    />
  );
}

export function DraftEditor({
  id,
  status,
  error,
  content: initial,
  title,
  canEdit,
  canApprove,
  versions,
  t,
  roughT,
  common,
}: {
  id: string;
  status: string;
  error: string | null;
  content: DraftContent;
  title: string;
  canEdit: boolean;
  canApprove: boolean;
  versions: { when: string; instruction: string | null }[];
  t: S;
  roughT: S["rough"];
  common: { delete: string; confirm: string };
}) {
  const [c, setC] = useState<DraftContent>(initial);
  const [dirty, setDirty] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [tab, setTab] = useState<"script" | "shots" | "edit" | "rough">("script");
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();
  const d = t.draft;
  const generating = status === "GENERATING";
  const locked = !canEdit || generating;

  const update = (fn: (x: DraftContent) => DraftContent) => {
    setC((x) => fn(structuredClone(x)));
    setDirty(true);
  };
  const save = () =>
    start(async () => {
      const res = await saveDraftContent(id, c);
      if (res.ok) {
        setDirty(false);
        toast(d.editsSaved);
        setC((x) => ({ ...x, beats: reflowBeats(x.beats) }));
      }
    });
  const refine = (text: string) =>
    text.trim() &&
    start(async () => {
      await refineDraft(id, text.trim());
      setInstruction("");
      toast(toasts.refining, "info");
    });
  const status_ = (s: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED") =>
    start(async () => {
      await setDraftStatus(id, s);
      toast(toasts.statusUpdated);
    });

  const compliance = c.compliance;
  const ComplianceIcon = compliance.status === "PASS" ? CheckCircle2 : compliance.status === "FAIL" ? XCircle : CircleAlert;
  const beats = reflowBeats(c.beats);

  return (
    <div className="space-y-6">
      {/* Workflow bar */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            generating && "animate-pulse bg-sand-50 text-sand-700",
            status === "DRAFT" && "bg-sunken",
            status === "IN_REVIEW" && "bg-info/[0.07] text-info",
            status === "APPROVED" && "bg-pos/[0.07] text-pos",
            status === "PUBLISHED" && "bg-brand-600 text-white",
          )}
        >
          {d.status[status as keyof typeof d.status] ?? status}
        </span>
        {error && !generating && <span className="text-xs text-neg" dir="ltr">{error}</span>}
        <div className="ms-auto flex flex-wrap gap-2">
          {canEdit && status === "DRAFT" && (
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => status_("IN_REVIEW")}>{d.submit}</button>
          )}
          {canApprove && status === "IN_REVIEW" && (
            <button type="button" className="btn-primary" disabled={pending} onClick={() => status_("APPROVED")}>{d.approve}</button>
          )}
          {canEdit && status === "APPROVED" && (
            <button type="button" className="btn-primary" disabled={pending} onClick={() => status_("PUBLISHED")}>{d.publish}</button>
          )}
          {canEdit && ["IN_REVIEW", "APPROVED"].includes(status) && (
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => status_("DRAFT")}>{d.reopen}</button>
          )}
          <button type="button" className="btn-secondary" onClick={() => download(`${fileSlug(title)}.srt`, toSrt(beats), "application/x-subrip")}>
            <Download className="h-4 w-4" /> {d.srt}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              download(
                `${fileSlug(title)}-shots.csv`,
                "﻿" + [["#", "type", "description", "location", "props", "talent", "seconds", "notes"].join(","), ...c.shots.map((s) => [s.n, s.type, s.description, s.location, s.props, s.talent, s.duration, s.notes].map(csvCell).join(","))].join("\r\n"),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download className="h-4 w-4" /> {d.csv}
          </button>
          {canEdit && (
            <button type="button" className="btn-danger px-3" disabled={pending} onClick={async () => (await confirmDialog(common.confirm, { danger: true, confirmLabel: common.delete })) && start(() => deleteDraft(id))} aria-label={common.delete}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Refine */}
      {canEdit && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1"
              placeholder={d.refinePh}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refine(instruction)}
              disabled={generating}
              dir="auto"
            />
            <button type="button" className="btn-primary" disabled={generating || pending || !instruction.trim()} onClick={() => refine(instruction)}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} {d.refine}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.quick.map((q) => (
              <button type="button" key={q} disabled={generating} onClick={() => refine(q)} className="rounded-full bg-canvas px-3 py-1 text-xs hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
          {generating && <p className="mt-3 animate-pulse text-sm text-muted">{d.generating}</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 text-xs font-medium text-muted">{d.concept}</h2>
            <Editable multiline value={c.concept} disabled={locked} onChange={(v) => update((x) => ({ ...x, concept: v }))} className="text-[15px]" />
            <h2 className="mb-2 mt-5 text-xs font-medium text-muted">{d.hooks}</h2>
            <div className="grid gap-2 md:grid-cols-3">
              {c.hooks.map((h, i) => (
                <div key={i} className={cn("rounded-xl border p-3", i === 0 ? "border-ink bg-surface shadow-[0_0_0_1px_var(--color-ink)]" : "border-line")}>
                  <Editable multiline value={h.text} disabled={locked} onChange={(v) => update((x) => { x.hooks[i].text = v; return x; })} className="text-sm font-medium" />
                  <p dir="auto" className="mt-1 px-1.5 text-xs text-brand-700">▣ {h.on_screen}</p>
                  <p className="mt-1 px-1.5 text-[11px] text-muted" dir="ltr">{h.why}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-1 border-b border-line">
            {([
              ["script", d.script, FileText],
              ["shots", d.shotList, ListChecks],
              ["edit", d.edit, Music],
              ["rough", d.roughCut, Clapperboard],
            ] as const).map(([k, label, Icon]) => (
              <button
                type="button"
                key={k}
                onClick={() => setTab(k)}
                className={cn("flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm", tab === k ? "border-ink font-medium text-ink" : "border-transparent text-muted")}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {tab === "script" && (
            <section className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="w-16 px-3 py-2.5 text-start font-medium">⏱</th>
                    <th className="px-3 py-2.5 text-start font-medium">{d.onScreen}</th>
                    <th className="px-3 py-2.5 text-start font-medium">{d.vo}</th>
                    <th className="px-3 py-2.5 text-start font-medium">{d.visual}</th>
                    <th className="w-12 px-3 py-2.5 text-start font-medium">{d.shotType}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  {beats.map((b, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs text-muted ltr-nums">
                        {b.start.toFixed(1)}s
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={c.beats[i]?.duration ?? b.duration}
                          disabled={locked}
                          onChange={(e) => update((x) => { x.beats[i].duration = Number(e.target.value); return x; })}
                          className="mt-1 w-14 rounded border border-line px-1 py-0.5 text-xs"
                          dir="ltr"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-semibold"><Editable multiline value={c.beats[i].onScreen} disabled={locked} onChange={(v) => update((x) => { x.beats[i].onScreen = v; return x; })} /></td>
                      <td className="px-2 py-1.5"><Editable multiline value={c.beats[i].vo} disabled={locked} onChange={(v) => update((x) => { x.beats[i].vo = v; return x; })} /></td>
                      <td className="px-2 py-1.5 text-muted"><Editable multiline value={c.beats[i].visual} disabled={locked} onChange={(v) => update((x) => { x.beats[i].visual = v; return x; })} /></td>
                      <td className="px-3 py-2 text-center"><span className="rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold">{b.shot}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tab === "shots" && (
            <section className="grid gap-3 md:grid-cols-2">
              {c.shots.map((s, i) => (
                <div key={i} className="card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">{s.n}</span>
                    <span className="text-xs font-semibold tracking-wide text-muted">{s.type.replace(/_/g, " ")}</span>
                    <span className="ms-auto text-xs text-muted ltr-nums">{s.duration}s</span>
                  </div>
                  <Editable multiline value={s.description} disabled={locked} onChange={(v) => update((x) => { x.shots[i].description = v; return x; })} className="text-sm" />
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted">{d.location}</dt><dd dir="auto">{s.location}</dd>
                    <dt className="text-muted">{d.props}</dt><dd dir="auto">{s.props}</dd>
                    <dt className="text-muted">{d.talent}</dt><dd dir="auto">{s.talent}</dd>
                  </dl>
                  {s.notes && <p className="mt-2 rounded-lg bg-canvas px-2 py-1 text-xs text-muted" dir="auto">{s.notes}</p>}
                </div>
              ))}
            </section>
          )}

          {tab === "edit" && (
            <section className="card space-y-4 p-5 text-sm">
              {([
                [d.music, c.edit.music],
                [d.pacing, c.edit.pacing],
                [d.captionsStyle, c.edit.captions_style],
              ] as const).map(([k, v]) => (
                <div key={k}>
                  <h3 className="text-xs font-medium text-muted">{k}</h3>
                  <p className="mt-0.5" dir="auto">{v}</p>
                </div>
              ))}
              <div>
                <h3 className="text-xs font-medium text-muted">{d.transitions}</h3>
                <ul className="mt-1 list-disc ps-5" dir="auto">{c.edit.transitions.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              <div>
                <h3 className="text-xs font-medium text-muted">{d.sfx}</h3>
                <div className="mt-1 flex flex-wrap gap-1.5">{c.edit.sfx.map((x) => <span key={x} className="rounded-full bg-canvas px-2.5 py-1 text-xs">{x}</span>)}</div>
              </div>
            </section>
          )}

          {tab === "rough" && (
            <section className="card p-5">
              <RoughCut beats={beats} shots={c.shots} title={title} t={roughT} />
            </section>
          )}

          {canEdit && dirty && (
            <div className="sticky bottom-4 z-20 flex justify-end">
              <button type="button" className="btn-primary shadow-lg" disabled={pending} onClick={save}>{d.saveEdits}</button>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section
            className={cn(
              "card p-4",
              compliance.status === "PASS" && "border-pos/25 bg-pos/[0.04]",
              compliance.status === "REVIEW" && "border-sand-100 bg-sand-50",
              compliance.status === "FAIL" && "border-neg/25 bg-neg/[0.04]",
            )}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ComplianceIcon className={cn("h-4 w-4", compliance.status === "PASS" ? "text-pos" : compliance.status === "FAIL" ? "text-neg" : "text-sand-700")} />
              {d.compliance}: {d.complianceStatus[compliance.status]}
            </h3>
            {compliance.notes.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-ink/80" dir="auto">
                {compliance.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
          </section>
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{d.voiceMatch}</h3>
              <span className={cn("text-xl font-semibold ltr-nums", c.voice_match.score >= 80 ? "text-pos" : c.voice_match.score >= 60 ? "text-sand-700" : "text-neg")}>
                {c.voice_match.score}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-sunken">
              <div className="h-2 rounded-full bg-brand-600" style={{ width: `${c.voice_match.score}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted" dir="auto">{c.voice_match.notes}</p>
          </section>
          <section className="card space-y-3 p-4">
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted">{d.caption}</h3>
              <Editable multiline value={c.caption} disabled={locked} onChange={(v) => update((x) => ({ ...x, caption: v }))} className="text-sm" />
            </div>
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted">{d.hashtags}</h3>
              <p dir="auto" className="text-sm text-brand-700">{c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted">{d.cta}</h3>
              <Editable value={c.cta} disabled={locked} onChange={(v) => update((x) => ({ ...x, cta: v }))} className="text-sm" />
            </div>
          </section>
          {versions.length > 0 && (
            <section className="card p-4 text-xs">
              <ul className="space-y-1.5 text-muted">
                {versions.map((v, i) => (
                  <li key={i} dir="auto">
                    v{versions.length - i} · {v.when}
                    {v.instruction && <> · “{v.instruction}”</>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
