"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { AlertKind } from "@prisma/client";
import { Check, ChevronDown, X } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import { createAlert } from "@/app/actions";
import { ALERT_DEFAULTS, ALERT_KINDS, WINDOW_OPTIONS, sentenceParts, splitWords, templateFor, thresholdFromInput, type SentenceToken } from "@/lib/alert-rules";
import { cn } from "@/lib/utils";
import { toast } from "@/components/feedback";
import { fill, useClientDict } from "@/components/client-dict";

type Errors = Partial<Record<"value" | "emails" | "hook", string>>;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const splitEmails = (raw: string) => raw.split(/[,،;\s]+/).map((e) => e.trim()).filter(Boolean);

const chip = (on: boolean) =>
  cn(
    "rounded-[10px] border text-ink transition-[border-color,box-shadow,background-color] duration-150 ease-(--ease-out) active:scale-[0.98]",
    on ? "border-ink bg-surface font-semibold shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-line bg-transparent hover:border-line-strong hover:bg-sunken/50",
  );

/** The "New alert" side sheet: a sentence builder for one rule. */
export function NewAlertSheet({
  open,
  initialKind,
  onClose,
  monitors,
  anyMonitor,
  locale,
  t,
}: {
  open: boolean;
  initialKind: AlertKind;
  onClose: () => void;
  monitors: { id: string; name: string }[];
  anyMonitor: string;
  locale: "ar" | "en";
  t: Dict["alertsPage"];
}) {
  // Mounted while open or animating out.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setSession((n) => n + 1);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(id);
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <SheetBody key={session} shown={shown} initialKind={initialKind} onClose={onClose} monitors={monitors} anyMonitor={anyMonitor} locale={locale} t={t} />,
    document.body,
  );
}

function SheetBody({
  shown,
  initialKind,
  onClose,
  monitors,
  anyMonitor,
  locale,
  t,
}: {
  shown: boolean;
  initialKind: AlertKind;
  onClose: () => void;
  monitors: { id: string; name: string }[];
  anyMonitor: string;
  locale: "ar" | "en";
  t: Dict["alertsPage"];
}) {
  const { toasts, common } = useClientDict();
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<AlertKind>(initialKind);
  const [values, setValues] = useState<Record<AlertKind, string>>(() => Object.fromEntries(ALERT_KINDS.map((k) => [k, ALERT_DEFAULTS[k].value])) as Record<AlertKind, string>);
  const [windows, setWindows] = useState<Record<AlertKind, string>>(() => Object.fromEntries(ALERT_KINDS.map((k) => [k, ALERT_DEFAULTS[k].window])) as Record<AlertKind, string>);
  const [minimumVolume, setMinimumVolume] = useState(20);
  const [words, setWords] = useState("");
  const [monitorId, setMonitorId] = useState(monitors.length === 1 ? monitors[0].id : "");
  const [useEmail, setUseEmail] = useState(false);
  const [emails, setEmails] = useState("");
  const [useHook, setUseHook] = useState(false);
  const [hook, setHook] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, start] = useTransition();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus the chosen trigger on open, trap Tab inside, close on Escape, restore focus after.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  const value = values[kind];
  const parts = sentenceParts(kind === "CHURN_RISK" ? t.sentence.CHURN_RISK : templateFor(kind, t));
  const scopeName = monitors.find((m) => m.id === monitorId)?.name ?? anyMonitor;
  const via = new Intl.ListFormat(locale === "ar" ? "ar" : "en", { type: "conjunction" }).format(
    [t.sheet.viaApp, useEmail && t.sheet.viaEmail, useHook && t.sheet.viaHook].filter(Boolean) as string[],
  );

  function validate(): Errors {
    const e: Errors = {};
    if (kind === "KEYWORD" && splitWords(words).length === 0) e.value = t.errors.keyword;
    if (["NEGATIVE_SPIKE", "VOLUME_SPIKE", "HIGH_REACH", "CHURN_RISK"].includes(kind)) {
      const n = thresholdFromInput(kind, value);
      if (!value.trim() || !Number.isFinite(n) || n < 0) e.value = t.errors.threshold;
      else if (kind === "NEGATIVE_SPIKE" && (n < 1 || n > 100)) e.value = t.errors.pct;
    }
    if (useEmail) {
      const list = splitEmails(emails);
      const bad = list.filter((x) => !EMAIL.test(x));
      if (list.length === 0) e.emails = t.errors.emailsEmpty;
      else if (bad.length) e.emails = fill(t.errors.emails, { bad: bad.join(", ") });
    }
    if (useHook) {
      if (!hook.trim()) e.hook = t.errors.hookEmpty;
      else {
        try {
          if (new URL(hook.trim()).protocol !== "https:") e.hook = t.errors.hook;
        } catch {
          e.hook = t.errors.hook;
        }
      }
    }
    return e;
  }

  function submit() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      panelRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("minimumVolume", String(minimumVolume));
    fd.set("name", name.trim());
    fd.set("defaultName", t.defaultNames[kind]);
    if (monitorId) fd.set("monitorId", monitorId);
    if (kind === "KEYWORD") fd.set("keyword", splitWords(words).join(", "));
    if (["NEGATIVE_SPIKE", "VOLUME_SPIKE", "HIGH_REACH", "CHURN_RISK"].includes(kind)) fd.set("threshold", String(thresholdFromInput(kind, value)));
    if (["NEGATIVE_SPIKE", "VOLUME_SPIKE", "CHURN_RISK"].includes(kind)) fd.set("windowMinutes", windows[kind]);
    if (useEmail) fd.set("emails", splitEmails(emails).join(","));
    if (useHook) fd.set("webhookUrl", hook.trim());
    start(async () => {
      const res = await createAlert(null, fd).catch(() => ({ ok: false as const, error: "failed" }));
      if (res.ok) {
        toast(toasts.created);
        onClose();
      } else if (res.error === "webhook") setErrors({ hook: t.errors.hook });
      else if (res.error === "emails") setErrors({ emails: fill(t.errors.emails, { bad: emails }) });
      else if (res.error === "keyword") setErrors({ value: t.errors.keyword });
      else if (res.error === "threshold" || res.error === "invalid") setErrors({ value: t.errors.threshold });
      else toast(common.failed, "error");
    });
  }

  const tokenField = (token: SentenceToken) => {
    if (token === "window") {
      return (
        <span key="window" className="relative inline-flex">
          <select
            aria-label={t.fieldLabels.window}
            value={windows[kind]}
            onChange={(e) => setWindows((w) => ({ ...w, [kind]: e.target.value }))}
            className="h-[34px] cursor-pointer appearance-none rounded-[9px] border border-line bg-surface ps-2.5 pe-7 text-[15px] font-semibold text-ink outline-none transition-colors hover:border-line-strong focus-visible:border-brand-500"
          >
            {WINDOW_OPTIONS.map((w) => (
              <option key={w} value={w}>{(t.windows as Record<string, string>)[w]}</option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={1.8} />
        </span>
      );
    }
    const isWords = token === "words";
    const raw = isWords ? words : value;
    const unit = token === "pct" ? t.units.pct : token === "count" && kind === "VOLUME_SPIKE" ? t.units.mentions : null;
    const display = !isWords && token === "followers" && raw ? Number(raw.replace(/\D/g, "")).toLocaleString("en-US") : raw;
    const width = isWords ? `max(150px, ${Math.min(30, [...raw].length + 2)}ch)` : `${Math.max(2, [...display].length + 1)}ch`;
    return (
      <label key={token} dir={isWords ? "auto" : "ltr"} className={cn("inline-flex h-[34px] max-w-full items-center gap-1.5 rounded-[9px] border bg-surface px-2.5 transition-colors focus-within:border-brand-500", errors.value ? "border-neg" : "border-line")}>
        <span className="sr-only">{t.fieldLabels[token]}</span>
        <input
          value={display}
          placeholder={isWords ? t.wordsPh : undefined}
          inputMode={isWords ? "text" : "numeric"}
          dir={isWords ? (raw ? "auto" : locale === "ar" ? "rtl" : "ltr") : "ltr"}
          aria-invalid={!!errors.value}
          aria-describedby={errors.value ? "alert-value-err" : undefined}
          onChange={(e) => {
            setErrors((x) => ({ ...x, value: undefined }));
            if (isWords) setWords(e.target.value);
            else setValues((v) => ({ ...v, [kind]: e.target.value.replace(/[^\d.]/g, "").slice(0, 12) }));
          }}
          style={{ width }}
          className="min-w-0 border-0 bg-transparent p-0 text-center text-[16px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint md:text-[15px] tnum"
        />
        {unit && <span className="text-[14px] text-muted">{unit}</span>}
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={onClose}
        className={cn("absolute inset-0 bg-[rgba(22,22,22,0.22)] transition-opacity duration-200 ease-(--ease-out) dark:bg-black/50", shown ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={cn(
          "absolute inset-y-0 end-0 flex w-full max-w-[520px] flex-col bg-surface shadow-[0_0_0_1px_var(--color-line),0_24px_64px_rgba(0,0,0,0.18)] transition-transform duration-[220ms] ease-(--ease-out) motion-reduce:transition-none",
          shown ? "translate-x-0" : "ltr:translate-x-full rtl:-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-6 sm:px-8 sm:pt-7">
          <h2 id={headingId} className="text-[20px] font-semibold">{t.newAlert}</h2>
          <button type="button" onClick={onClose} aria-label={t.sheet.close} className="btn-ghost -me-2 h-9 w-9 rounded-[10px] px-0">
            <X className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>
        </div>

        <form
          id="new-alert"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8"
        >
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-[14px] font-semibold">{t.sheet.when}</legend>
            <div role="radiogroup" aria-label={t.sheet.kindGroup} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALERT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  tabIndex={kind === k ? 0 : -1}
                  onClick={() => {
                    setKind(k);
                    setErrors((x) => ({ ...x, value: undefined }));
                  }}
                  onKeyDown={(e) => {
                    const dirKeys = document.dir === "rtl" ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowLeft: -1, ArrowRight: 1 };
                    const step = { ...dirKeys, ArrowDown: 1, ArrowUp: -1 }[e.key as "ArrowDown"];
                    if (!step) return;
                    e.preventDefault();
                    const next = ALERT_KINDS[(ALERT_KINDS.indexOf(k) + step + ALERT_KINDS.length) % ALERT_KINDS.length];
                    setKind(next);
                    (e.currentTarget.parentElement?.querySelector(`[data-kind="${next}"]`) as HTMLElement | null)?.focus();
                  }}
                  data-kind={k}
                  className={cn(chip(kind === k), "h-11 rounded-[11px] px-2 text-[13.5px] whitespace-nowrap")}
                >
                  {t.tiles[k]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-canvas px-[18px] py-4 text-[15px] leading-[34px]" aria-live="polite">
              {parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : tokenField(p.token)))}
            </div>
            {errors.value && (
              <p id="alert-value-err" className="text-[13px] text-neg">{errors.value}</p>
            )}
            {!errors.value && (kind === "KEYWORD" || kind === "CHURN_RISK") && (
              <p className="text-[13px] leading-[1.75] text-faint">{t.hints[kind]}</p>
            )}
          </fieldset>

          {kind === "NEGATIVE_SPIKE" && <label className="grid gap-2 text-sm text-muted">{locale === "ar" ? "الحد الأدنى للمنشورات المصنفة" : "Minimum classified posts"}<input className="input" type="number" min={5} max={10000} required value={minimumVolume} onChange={e => setMinimumVolume(Number(e.target.value))} /></label>}
          <fieldset>
            <legend className="mb-2.5 text-[14px] font-semibold">{t.sheet.in}</legend>
            <div role="radiogroup" aria-label={t.sheet.monitorGroup} className="flex flex-wrap gap-2">
              {[{ id: "", name: anyMonitor }, ...monitors].map((m) => (
                <button
                  key={m.id || "all"}
                  type="button"
                  role="radio"
                  aria-checked={monitorId === m.id}
                  onClick={() => setMonitorId(m.id)}
                  className={cn(chip(monitorId === m.id), "h-9 max-w-full truncate px-3.5 text-[14px]")}
                  dir="auto"
                >
                  {m.name}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-[14px] font-semibold">{t.sheet.via}</legend>
            <Channel label={t.channels.inApp} note={t.channels.always} checked locked />
            <Channel label={t.channels.email} checked={useEmail} onToggle={() => setUseEmail((v) => !v)} border>
              <ChannelInput
                label={t.channels.email}
                value={emails}
                onChange={(v) => {
                  setEmails(v);
                  setErrors((x) => ({ ...x, emails: undefined }));
                }}
                placeholder={t.emailsPh}
                error={errors.emails}
                type="email"
              />
            </Channel>
            <Channel label={t.channels.hook} checked={useHook} onToggle={() => setUseHook((v) => !v)} border>
              <ChannelInput
                label={t.channels.hook}
                value={hook}
                onChange={(v) => {
                  setHook(v);
                  setErrors((x) => ({ ...x, hook: undefined }));
                }}
                placeholder={t.hookPh}
                error={errors.hook}
                hint={t.hookHint}
                type="url"
              />
            </Channel>
          </fieldset>

          <label className="flex flex-col gap-2.5">
            <span className="text-[14px] font-semibold">{t.sheet.name}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t.defaultNames[kind]} dir="auto" className="input h-[42px] px-3.5 md:text-[14.5px]" />
          </label>
        </form>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-sunken px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-8">
          <span className="min-w-0 flex-1 basis-full text-[13px] leading-[1.6] text-faint sm:basis-40" dir="auto">{fill(t.sheet.summary, { scope: scopeName, via })}</span>
          <button type="button" onClick={onClose} className="btn-ghost ms-auto h-10 rounded-[11px] px-4 text-[14px] sm:ms-0">{t.sheet.cancel}</button>
          <button type="submit" form="new-alert" disabled={pending} className="btn-primary h-10 rounded-[11px] px-[18px] text-[14px] font-semibold">{t.sheet.create}</button>
        </div>
      </div>
    </div>
  );
}

function Channel({
  label,
  note,
  checked,
  locked,
  onToggle,
  border,
  children,
}: {
  label: string;
  note?: string;
  checked: boolean;
  locked?: boolean;
  onToggle?: () => void;
  border?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(border && "border-t border-sunken")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-disabled={locked || undefined}
        onClick={locked ? undefined : onToggle}
        className={cn("flex min-h-11 w-full items-center gap-3 text-start text-ink", locked ? "cursor-default" : "cursor-pointer")}
      >
        <span
          className={cn(
            "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] transition-colors duration-150",
            checked ? (locked ? "bg-faint" : "bg-ink") : "border-[1.5px] border-faint",
          )}
        >
          {checked && <Check className="h-3 w-3 text-on-ink" strokeWidth={3} />}
        </span>
        <span className="flex-1 text-[14.5px]">{label}</span>
        {note && <span className="text-[12.5px] text-faint">{note}</span>}
      </button>
      {checked && children && <div className="ps-[30px] pb-3.5">{children}</div>}
    </div>
  );
}

function ChannelInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  hint?: string;
  type: "email" | "url";
}) {
  const id = useId();
  return (
    <>
      <label>
        <span className="sr-only">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir="ltr"
          type={type === "email" ? "text" : "url"}
          inputMode={type}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error || hint ? id : undefined}
          className={cn("input h-[42px] px-3.5 text-left md:text-[14px]", error && "border-neg focus:border-neg focus:ring-neg/15")}
        />
      </label>
      {(error || hint) && (
        <p id={id} className={cn("mt-2 text-[12.5px] leading-[1.7] [overflow-wrap:anywhere]", error ? "text-neg" : "text-faint")}>
          {error ?? hint}
        </p>
      )}
    </>
  );
}
