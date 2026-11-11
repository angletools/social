"use client";

import { useActionState, useState, useTransition } from "react";
import { CircleAlert, Eye, EyeOff, Globe, Loader2 } from "lucide-react";
import { login, setLocale } from "@/app/actions";
import { cn } from "@/lib/utils";

type Labels = { email: string; password: string; submit: string; invalid: string; locked: string; show: string; hide: string; forgot: string };

export function LoginForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(login, null);
  const [shown, setShown] = useState(false);
  const [email, setEmail] = useState("");
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);
  const error = state && !state.ok ? state.error : null;
  // After a lockout the button stays off for that address; another address can still try.
  const locked = error === "locked" && (lockedEmail ?? email) === email;
  const input = cn(
    "input h-[46px] px-3.5 text-[16px] md:text-[15px]",
    error && !pending && "border-[color-mix(in_srgb,var(--color-neg)_45%,var(--color-line))]",
  );

  return (
    <form
      action={(fd) => {
        setLockedEmail(String(fd.get("email") ?? ""));
        return action(fd);
      }}
      className="mt-8 flex flex-col gap-4"
      noValidate={false}
    >
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium">{labels.email}</span>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          className={input}
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium">{labels.password}</span>
        <span className="relative block" dir="ltr">
          <input
            id="password"
            name="password"
            type={shown ? "text" : "password"}
            required
            autoComplete="current-password"
            dir="ltr"
            className={cn(input, "pr-12")}
            aria-invalid={Boolean(error) || undefined}
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? labels.hide : labels.show}
            aria-pressed={shown}
            title={shown ? labels.hide : labels.show}
            className="absolute top-1 right-1 flex h-[38px] w-[38px] items-center justify-center rounded-[9px] text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            {shown ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />}
          </button>
        </span>
      </label>

      {error && !pending && (
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
