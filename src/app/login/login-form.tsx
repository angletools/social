"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login } from "@/app/actions";

export function LoginForm({ labels }: { labels: { email: string; password: string; submit: string; invalid: string; locked: string } }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label className="label" htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" required autoComplete="email" dir="ltr" className="input h-10" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" dir="ltr" className="input h-10" />
      </div>
      {state && !state.ok && (
        <p role="alert" className="rounded-lg border-s-2 border-neg bg-neg/[0.05] px-3 py-2 text-[13px] text-neg">
          {state.error === "locked" ? labels.locked : labels.invalid}
        </p>
      )}
      <button type="submit" className="btn-primary h-10 w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {labels.submit}
      </button>
    </form>
  );
}
