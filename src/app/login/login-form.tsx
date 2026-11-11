"use client";

import { useActionState, useState, useTransition } from "react";
import { CircleAlert, Globe, Loader2 } from "lucide-react";
import { login, setLocale } from "@/app/actions";
import { cn } from "@/lib/utils";

type Labels = {
  email: string;
  password: string;
  submit: string;
  invalid: string;
  locked: string;
  show: string;
  hide: string;
  showShort: string;
  hideShort: string;
  forgot: string;
};

/**
 * 48px field: surface fill, a 1px inset line, an ink line plus a soft 4px ring on
 * focus, a tinted red line on error. The input inside has no border of its own.
 */
const field = (error: boolean) =>
  cn(
    "relative flex h-12 items-center rounded-[12px] bg-surface shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-150 ease-(--ease-out)",
    "focus-within:shadow-[inset_0_0_0_1px_var(--color-ink),0_0_0_4px_color-mix(in_srgb,var(--color-ink)_8%,transparent)]",
    error && "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-neg)_55%,var(--color-line))]",
  );
// LTR values (email, password) still line up with the labels: right-aligned in Arabic.
const input = "h-full min-w-0 flex-1 bg-transparent px-4 text-start text-[16px] text-ink outline-none rtl:text-right md:text-[15px]";

// The field draws its own focus ring; skip the global outline on the bare input.
const NO_OUTLINE = { outline: "none" } as const;

export function LoginForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(login, null);
  const [shown, setShown] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);
  const error = state && !state.ok ? state.error : null;
  const showError = Boolean(error) && !pending;
  // After a lockout the button stays off for that address; another address can still try.
  const locked = error === "locked" && (lockedEmail ?? email) === email;

  return (
    <form
      action={(fd) => {
        setLockedEmail(String(fd.get("email") ?? ""));
        return action(fd);
      }}
      className="mt-8 flex flex-col gap-4"
    >
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium">{labels.email}</span>
        <span className={field(showError)}>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            className={input}
            style={NO_OUTLINE}
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={showError || undefined}
          />
        </span>
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium">{labels.password}</span>
        <span className={field(showError)}>
          <input
            name="password"
            type={shown ? "text" : "password"}
            required
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(input, !shown && password && "text-transparent caret-ink selection:bg-transparent")}
            style={NO_OUTLINE}
            aria-invalid={showError || undefined}
          />
          {/* A quieter mask than the browser's heavy bullets: small even dots. */}
          {!shown && password && (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-4 end-[72px] flex items-center gap-1.5 overflow-hidden">
              {Array.from({ length: Math.min(password.length, 40) }, (_, i) => (
                <span key={i} className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? labels.hide : labels.show}
            aria-pressed={shown}
            className="me-2 h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink max-md:h-10"
          >
            {shown ? labels.hideShort : labels.showShort}
          </button>
        </span>
      </label>

      {showError && (
        <p role="alert" className="animate-rise flex items-start gap-2.5 rounded-[12px] bg-neg/[0.09] px-3.5 py-3 text-[14px] leading-relaxed text-neg">
          <CircleAlert aria-hidden className="mt-[3px] h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>{error === "locked" ? labels.locked : labels.invalid}</span>
        </p>
      )}

      <button type="submit" className="btn-primary mt-2 h-[46px] w-full text-[15px] font-semibold" disabled={pending || locked}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {labels.submit}
      </button>
      <p className="mt-1 text-center text-[13.5px] leading-[1.75] text-faint">{labels.forgot}</p>
    </form>
  );
}

/** Switches the interface language from the sign-in page (no account needed). */
export function LoginLanguage({ locale }: { locale: "ar" | "en" }) {
  const [pending, start] = useTransition();
  const other = locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      lang={other}
      disabled={pending}
      onClick={() => start(() => setLocale(other))}
      className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line px-3 text-[14px] font-medium transition-colors hover:bg-sunken disabled:opacity-60 max-md:h-11"
    >
      <Globe aria-hidden className="h-4 w-4" strokeWidth={1.6} />
      {other === "ar" ? "العربية" : "English"}
    </button>
  );
}
