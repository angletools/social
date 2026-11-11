"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, ChevronDown, ExternalLink, Loader2, Square } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import { cellNumber, parseTable, segmentAnswer, type CitedPost, type ToolStep } from "@/lib/assistant-format";
import { cn, formatDate, formatNumber, guessLang } from "@/lib/utils";
import { fill } from "@/components/client-dict";
import { SolidAvatar } from "@/components/avatar";
import { DotBar } from "@/components/dots";
import { MobileHistory } from "./history";

export type Msg = { role: "user" | "assistant"; text: string; steps?: ToolStep[]; posts?: CitedPost[]; followups?: string[]; error?: boolean };

const PLATFORM: Record<string, string> = { X: "X", INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube", FACEBOOK: "Facebook", LINKEDIN: "LinkedIn" };

/** The "a" mark: angle's assistant. */
function Mark({ size }: { size: 28 | 44 }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center bg-ink font-semibold leading-none text-on-ink", size === 44 ? "h-11 w-11 rounded-[12px] pb-[3px] text-[22px]" : "h-7 w-7 rounded-[8px] pb-0.5 text-[15px]")}
      style={{ fontFamily: "Urbanist, sans-serif" }}
    >
      a
    </span>
  );
}

export function Chat({
  threadId: initialThread,
  initial,
  enabled,
  locale,
  tz,
  t,
  disabledLabel,
  errorLabel,
  history,
}: {
  threadId?: string;
  initial: Msg[];
  enabled: boolean;
  locale: "ar" | "en";
  tz: string;
  t: Dict["assistantPage"];
  disabledLabel: string;
  errorLabel: string;
  history: { threads: { id: string; title: string; when: string }[]; deleteLabels: { confirm: string; delete: string } };
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState(initialThread);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Follow the answer while it streams, unless the person scrolled up to read.
  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    if (end.getBoundingClientRect().top < window.innerHeight + 240) end.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
  }, [input]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (fn: (m: Msg) => Msg) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || busy || !enabled) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "", steps: [], posts: [] }]);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let newThread: string | undefined;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: text }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          if (!ev.startsWith("data: ")) continue;
          const e = JSON.parse(ev.slice(6));
          if (e.type === "text") update((m) => ({ ...m, text: m.text + e.text }));
          else if (e.type === "tool") update((m) => ({ ...m, steps: [...(m.steps ?? []), { name: e.name, days: e.days, n: e.n }] }));
          else if (e.type === "posts") update((m) => ({ ...m, posts: [...(m.posts ?? []), ...e.posts] }));
          else if (e.type === "followups") update((m) => ({ ...m, followups: e.items }));
          else if (e.type === "error") update((m) => ({ ...m, error: true }));
          else if (e.type === "done" && e.threadId !== threadId) newThread = e.threadId;
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") update((m) => ({ ...m, error: true }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      if (newThread) {
        setThreadId(newThread);
        window.history.replaceState(null, "", `/assistant?thread=${newThread}`);
      }
      router.refresh();
    }
  }

  const empty = messages.length === 0;
  const lastAssistant = messages.length - 1;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas md:min-h-0">
      <MobileHistory threads={history.threads} current={threadId} t={t} deleteLabels={history.deleteLabels} />
      <div className="flex min-h-0 flex-1 flex-col md:overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-4 pt-8 pb-6 md:px-12 md:pt-10">
            <Mark size={44} />
            <h2 className="mt-5 text-[24px] leading-[1.4] font-semibold md:text-[28px]">{t.emptyTitle}</h2>
            <p className="mt-2 text-[15px] text-muted">{t.emptyBody}</p>
            {!enabled && <p className="mt-5 rounded-xl bg-sand-50 px-4 py-3 text-sm text-sand-700">{disabledLabel}</p>}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {t.suggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  disabled={!enabled}
                  onClick={() => ask(s)}
                  className="flex min-h-[76px] items-center rounded-[16px] bg-surface px-[18px] py-3.5 text-start text-[15px] leading-[1.7] transition-[background-color,transform] duration-150 ease-(--ease-out) hover:bg-selected active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 pt-6 pb-3 md:px-12 md:pt-8">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p dir="auto" className="max-w-[80%] rounded-[18px] rounded-ee-[6px] bg-ink px-4 py-2.5 text-[15px] leading-[1.75] whitespace-pre-wrap text-on-ink [overflow-wrap:anywhere]">
                    {m.text}
                  </p>
                </div>
              ) : (
                <Answer
                  key={i}
                  m={m}
                  streaming={busy && i === lastAssistant}
                  last={i === lastAssistant}
                  t={t}
                  locale={locale}
                  tz={tz}
                  errorLabel={errorLabel}
                  onAsk={ask}
                />
              ),
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] mx-auto w-full max-w-[760px] shrink-0 bg-canvas px-4 pt-2 pb-4 md:bottom-0 md:px-12 md:pb-7"
      >
        <div className="flex items-end gap-2 rounded-[16px] border border-line bg-surface p-2 transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t.question}</span>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={2}
              maxLength={4000}
              disabled={!enabled}
              placeholder={t.placeholder}
              dir="auto"
              className="block max-h-40 w-full resize-none bg-transparent px-2.5 py-2 text-[16px] leading-[1.75] outline-none placeholder:text-faint md:text-[15px]"
            />
          </label>
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="btn-secondary h-10 w-10 shrink-0 rounded-[11px] p-0" aria-label={t.stop} title={t.stop}>
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button type="submit" disabled={!enabled || !input.trim()} className="btn-primary h-10 w-10 shrink-0 rounded-[11px] p-0" aria-label={t.send}>
              <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function stepSummary(steps: ToolStep[], t: Dict["assistantPage"]) {
  const posts = steps.reduce((a, s) => a + (s.n ?? 0), 0);
  const days = Math.max(0, ...steps.filter((s) => s.name !== "search_mentions").map((s) => s.days ?? 0));
  if (posts && days) return fill(t.stepsRead, { posts, days });
  if (posts) return fill(t.stepsPosts, { posts });
  if (days) return fill(t.stepsDays, { days });
  return fill(t.stepsDone, { n: steps.length });
}

function stepLabel(s: ToolStep, t: Dict["assistantPage"]) {
  const map = t.step as Record<string, string>;
  if (s.name === "search_mentions" && !s.n) return map.search_mentions_none;
  return fill(map[s.name] ?? s.name, { days: s.days ?? 30, n: s.n ?? 0 });
}

function Answer({
  m,
  streaming,
  last,
  t,
  locale,
  tz,
  errorLabel,
  onAsk,
}: {
  m: Msg;
  streaming: boolean;
  last: boolean;
  t: Dict["assistantPage"];
  locale: "ar" | "en";
  tz: string;
  errorLabel: string;
  onAsk: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const steps = m.steps ?? [];
  const segments = useMemo(() => segmentAnswer(m.text), [m.text]);
  const posts = useMemo(() => new Map((m.posts ?? []).map((p) => [p.id, p])), [m.posts]);
  const working = streaming && !m.text;

  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5">
      <Mark size={28} />
      <div className="flex min-w-0 flex-col gap-3.5">
        {(steps.length > 0 || working) && (
          <div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              disabled={!steps.length}
              className="inline-flex h-7 items-center gap-2 text-[13px] text-faint transition-colors hover:text-muted disabled:cursor-default"
            >
              {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-pos" strokeWidth={2.2} />}
              <span aria-live="polite">{working && !steps.length ? t.thinking : streaming ? `${t.working} ${stepSummary(steps, t)}` : stepSummary(steps, t)}</span>
              {steps.length > 0 && <ChevronDown className={cn("h-[13px] w-[13px] transition-transform duration-200 ease-(--ease-out)", open && "rotate-180")} strokeWidth={2} />}
            </button>
            {open && (
              <ol className="animate-rise mt-0.5 flex flex-col ps-[22px] text-[13px] leading-[1.7] text-faint">
                {steps.map((s, i) => (
                  <li key={i}>{stepLabel(s, t)}</li>
                ))}
              </ol>
            )}
          </div>
        )}

        {segments.map((s, i) =>
          s.type === "md" ? (
            <Markdown key={i} text={s.text} />
          ) : (
            <div key={i} className="grid gap-3 sm:grid-cols-2">
              {s.ids.map((id) => {
                const p = posts.get(id);
                if (p) return <PostCard key={id} p={p} t={t} locale={locale} tz={tz} />;
                return streaming ? <div key={id} className="skeleton h-[116px] rounded-[14px]" aria-label={t.loadingPost} /> : null;
              })}
            </div>
          ),
        )}

        {m.error && <p className="text-[14px] text-neg">{errorLabel}</p>}

        {last && !streaming && (m.followups?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2" aria-label={t.followups}>
            {m.followups!.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onAsk(f)}
                dir="auto"
                className="min-h-[34px] rounded-[10px] border border-line px-3 py-1 text-[13.5px] text-muted transition-colors duration-150 hover:border-line-strong hover:bg-sunken hover:text-ink active:scale-[0.98]"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Markdown, with tables that hold counts drawn as the board's dotted-bar table. */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const out: { table: boolean; text: string }[] = [];
    for (const line of text.split("\n")) {
      const isRow = /^\s*\|.*\|\s*$/.test(line);
      const last = out.at(-1);
      if (last && last.table === isRow) last.text += `\n${line}`;
      else out.push({ table: isRow, text: line });
    }
    return out;
  }, [text]);
  return (
    <>
      {blocks.map((b, i) => {
        const table = b.table ? parseTable(b.text) : null;
        if (table) return <BarTable key={i} {...table} />;
        if (!b.text.trim()) return null;
        return (
          <div key={i} dir="auto" className="prose-chat text-[15.5px] leading-[1.85] [&_p]:mb-3.5 [&_strong]:font-semibold">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">{children}</a> }}>
              {b.text}
            </ReactMarkdown>
          </div>
        );
      })}
    </>
  );
}

function BarTable({ head, rows, bar, max }: { head: string[]; rows: string[][]; bar: number; max: number }) {
  const valueCols = head.map((_, i) => i).filter((i) => i > 0);
  const cols = `minmax(0,190px) minmax(32px,1fr) ${valueCols.map(() => "minmax(40px,auto)").join(" ")}`;
  return (
    <figure dir={guessLang(head[0] + (rows[0]?.[0] ?? "")) === "ar" ? "rtl" : "ltr"} className="rounded-[14px] bg-surface px-3.5 py-1.5 sm:px-[18px]">
      <div role="table" aria-label={head[0]} className="text-[14px]">
        <div role="row" className="grid gap-3 pt-2.5 pb-2 text-[12.5px] text-faint sm:gap-4" style={{ gridTemplateColumns: cols }}>
          <span role="columnheader">{head[0]}</span>
          <span />
          {valueCols.map((c) => (
            <span key={c} role="columnheader" className="text-end">{head[c]}</span>
          ))}
        </div>
        {rows.map((r, i) => {
          const v = cellNumber(r[bar]) ?? 0;
          return (
            <div key={i} role="row" className="grid min-h-[42px] items-center gap-3 border-t border-sunken sm:gap-4" style={{ gridTemplateColumns: cols }}>
              <span role="cell" dir="auto" className="min-w-0 truncate" title={r[0]}>{r[0]}</span>
              <DotBar segments={[{ value: v, color: "var(--color-chart)" }]} max={max} />
              {valueCols.map((c) => {
                const signed = /^[+\-−]/.test(r[c]);
                return (
                  <span key={c} role="cell" dir="ltr" className={cn("text-end whitespace-nowrap tnum", signed && "font-semibold")}>
                    <Fragment>{r[c]}</Fragment>
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function PostCard({ p, t, locale, tz }: { p: CitedPost; t: Dict["assistantPage"]; locale: "ar" | "en"; tz: string }) {
  const name = p.authorName || (p.authorHandle ? `@${p.authorHandle}` : PLATFORM[p.platform] ?? p.platform);
  const ar = guessLang(p.text) === "ar";
  const when = formatDate(p.publishedAt, locale, { dateStyle: undefined, weekday: "long", hour: "numeric", minute: "2-digit", hour12: true }, tz);
  const who = [name, PLATFORM[p.platform] ?? p.platform, p.authorFollowers ? formatNumber(p.authorFollowers, locale) : null, when].filter(Boolean).join(" · ");
  const href = p.url ?? `/mentions?q=${encodeURIComponent(p.authorHandle ?? p.text.slice(0, 40))}`;
  return (
    <a
      href={href}
      target={p.url ? "_blank" : undefined}
      rel={p.url ? "noreferrer" : undefined}
      className="group flex min-w-0 flex-col gap-2.5 rounded-[14px] bg-surface px-4 py-3.5 transition-colors duration-150 hover:bg-selected"
    >
      <span dir="auto" className="line-clamp-4 text-[14.5px] leading-[1.8] [overflow-wrap:anywhere]">
        {ar ? `«${p.text}»` : `“${p.text}”`}
      </span>
      <span className="mt-auto flex items-center gap-2 text-[12.5px] text-faint">
        <SolidAvatar name={name} seed={p.authorHandle ?? name} size={20} />
        <span dir="auto" className="min-w-0 flex-1 truncate">{who}</span>
        <ExternalLink aria-label={t.openPost} className="h-[13px] w-[13px] shrink-0 transition-colors group-hover:text-ink" strokeWidth={1.8} />
      </span>
    </a>
  );
}
