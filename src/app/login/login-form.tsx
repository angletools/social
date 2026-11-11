"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ labels }: { labels: { email: string; password: string; submit: string; invalid: string } }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label className="label" htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" required autoComplete="email" dir="ltr" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" dir="ltr" className="input" />
      </div>
      {state && !state.ok && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{labels.invalid}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  );
}
