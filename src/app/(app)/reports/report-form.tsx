"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronDown, X } from "lucide-react";
import { createReport, retryReport, saveWeeklyReport } from "@/app/actions";
import { cn } from "@/lib/utils";
import { toast } from "@/components/feedback";
import { fill, useClientDict } from "@/components/client-dict";
import { Switch } from "../alerts/rule-row";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

const seg = (on: boolean) =>
  cn(
    "h-8 rounded-[9px] text-[13.5px] whitespace-nowrap transition-colors duration-150",
    on ? "bg-surface font-semibold text-ink" : "text-muted hover:text-ink",
  );

/** A native select dressed like the board's field (keeps the platform picker on phones). */
function Select({ name, defaultValue, value, onChange, children, label }: { name?: string; defaultValue?: string | number; value?: string; onChange?: (v: string) => void; children: React.ReactNode; label: string }) {
  return (
    <span className="relative flex">
      <select
        name={name}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange && ((e) => onChange(e.target.value))}
        aria-label={label}
        className="h-[42px] w-full min-w-0 cursor-pointer appearance-none truncate rounded-[12px] border border-line bg-surface ps-3.5 pe-9 text-[16px] text-ink outline-none transition-colors hover:border-line-strong focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-100 md:text-[14.5px]"
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={1.8} />
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[13.5px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export function ReportForm({
  monitors,
  locale,
  aiOff,
  labels,
  ranges,
}: {
  monitors: { id: string; name: string }[];
  locale: string;
  aiOff: string | null;
  labels: { title: string; period: string; covering: string; all: string; language: string; submit: string };
  ranges: Record<string, string>;
}) {
  const [, action, pending] = useActionState(createReport, null);
  const [days, setDays] = useState("7");
  const group = useId();
  return (
    <form action={action} className="card flex flex-col gap-[18px] p-5 sm:p-6">
      <h2 className="mb-0.5 text-[16px] font-semibold">{labels.title}</h2>
      {aiOff && <p className="rounded-xl bg-sand-50 px-3 py-2 text-xs leading-relaxed text-sand-700">{locale === "ar" ? "سيُنشأ تقرير بالأرقام والأدلة دون تفسير مولد بالذكاء الاصطناعي." : "A statistics and evidence report will be created without AI interpretation."}</p>}
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="statisticsOnly" defaultChecked={Boolean(aiOff)} />{locale === "ar" ? "أرقام وأدلة فقط" : "Statistics and evidence only"}</label>
      <input type="hidden" name="days" value={days} />
      <div className="flex flex-col gap-2">
        <span id={group} className="text-[13.5px] text-muted">{labels.period}</span>
        <div role="radiogroup" aria-labelledby={group} className="grid grid-cols-4 gap-0.5 rounded-[12px] bg-sunken p-[3px]">
          {Object.entries(ranges).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={days === v} onClick={() => setDays(v)} className={cn(seg(days === v), "px-1")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_124px] gap-3">
        <Field label={labels.covering}>
          <Select name="monitorId" label={labels.covering}>
            <option value="">{labels.all}</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={labels.language}>
          <Select name="locale" defaultValue={locale} label={labels.language}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </Select>
        </Field>
      </div>
      <button className="btn-primary mt-1 h-11 rounded-[12px] text-[14.5px] font-semibold" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  );
}

/** Re-queues a failed report from the list. Sits above the row's full-size link. */
export function RetryButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const { common } = useClientDict();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await retryReport(id).catch(() => null);
          if (!r?.ok) toast(common.failed, "error");
        })
      }
      className="relative z-10 ps-0.5 text-[12.5px] whitespace-nowrap text-faint underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function WeeklyCard({
  enabled,
  day,
  locale,
  recipients,
  lastSent,
  days,
  labels,
}: {
  enabled: boolean;
  day: number;
  locale: string;
  recipients: string[];
  lastSent: string;
  days: readonly string[];
  labels: {
    title: string;
    toggle: string;
    sendOn: string;
    recipients: string;
    addEmail: string;
    remove: string;
    save: string;
    invalid: string;
    needRecipient: string;
    language: string;
    saved: string;
  };
}) {
  const [state, action, pending] = useActionState(saveWeeklyReport, null);
  const [on, setOn] = useState(enabled);
  const [to, setTo] = useState(recipients);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errId = useId();
  const { common } = useClientDict();

  useEffect(() => {
    if (!state) return;
    if (state.ok) toast(labels.saved);
    else toast(state.error === "recipients" ? labels.needRecipient : common.failed, "error");
  }, [state, labels.saved, labels.needRecipient, common.failed]);

  /** Adds every complete address in the draft; keeps what isn't an email so it can be fixed. */
  function commit(raw = draft) {
    const parts = raw.split(/[,،;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return true;
    const bad = parts.find((x) => !EMAIL.test(x));
    const good = parts.filter((x) => EMAIL.test(x));
    if (good.length) setTo((list) => [...new Set([...list, ...good])].slice(0, 20));
    setDraft(bad ?? "");
    setError(bad ? fill(labels.invalid, { email: bad }) : null);
    return !bad;
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!commit()) {
          e.preventDefault();
          inputRef.current?.focus();
          return;
        }
        if (on && to.length === 0 && !draft) {
          e.preventDefault();
          setError(labels.needRecipient);
          inputRef.current?.focus();
        }
      }}
      className="card flex flex-1 flex-col gap-[18px] p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold">{labels.title}</h2>
        <Switch on={on} onToggle={() => setOn((v) => !v)} label={labels.toggle} />
        {on && <input type="hidden" name="enabled" value="on" />}
      </div>
      <input type="hidden" name="recipients" value={[...to, ...(EMAIL.test(draft.trim()) ? [draft.trim().toLowerCase()] : [])].join(",")} />
      <div className={cn("flex flex-col gap-[18px] transition-opacity duration-150", !on && "opacity-45")}>
        <div className="grid grid-cols-[minmax(0,1fr)_124px] gap-3">
          <Field label={labels.sendOn}>
            <Select name="day" defaultValue={String(day)} label={labels.sendOn}>
              {days.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field label={labels.language}>
            <Select name="locale" defaultValue={locale} label={labels.language}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13.5px] text-muted">{labels.recipients}</span>
          <div
            onClick={() => inputRef.current?.focus()}
            className={cn(
              "flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-[12px] border bg-surface p-1.5 transition-[border-color,box-shadow] focus-within:ring-[3px] focus-within:ring-brand-100",
              error ? "border-neg" : "border-line focus-within:border-brand-500",
            )}
          >
            {to.map((email) => (
              <span key={email} dir="ltr" className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-[8px] bg-sunken ps-2.5 pe-1.5 text-[13px]">
                <span className="truncate">{email}</span>
                <button
                  type="button"
                  aria-label={fill(labels.remove, { email })}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTo((list) => list.filter((x) => x !== email));
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-line hover:text-ink"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              value={draft}
              dir="ltr"
              type="text"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              aria-label={labels.addEmail}
              aria-invalid={!!error}
              aria-describedby={error ? errId : undefined}
              placeholder={to.length ? labels.addEmail : "ceo@company.com"}
              onChange={(e) => {
                setError(null);
                const v = e.target.value;
                if (/[,،;\s]$/.test(v)) commit(v);
                else setDraft(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Backspace" && !draft && to.length) setTo((list) => list.slice(0, -1));
              }}
              onBlur={() => commit()}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (/[,،;\s]/.test(text.trim())) {
                  e.preventDefault();
                  commit(draft + text);
                }
              }}
              className="h-7 min-w-[80px] flex-1 bg-transparent px-1.5 text-start text-[16px] outline-none placeholder:text-faint md:text-[13.5px]"
            />
          </div>
          {error && <p id={errId} className="text-[12.5px] text-neg [overflow-wrap:anywhere]">{error}</p>}
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="text-[13px] text-faint">{lastSent}</span>
        <button className="btn-secondary h-9 rounded-[10px] px-3.5 text-[14px]" disabled={pending}>
          {labels.save}
        </button>
      </div>
    </form>
  );
}
