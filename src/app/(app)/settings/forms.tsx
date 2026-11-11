"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import type { Role } from "@prisma/client";
import { addMember, changePassword, saveWeeklyReport, updateMember, updateOrganization, updateProfile } from "@/app/actions";
import { toast } from "@/components/feedback";
import { useClientDict } from "@/components/client-dict";

type Result = { ok: true } | { ok: false; error: string } | null;

/** Shows a toast once per action result. */
function useResultToast(state: Result | { ok: boolean } | null, success: string, errors: Record<string, string> = {}) {
  const { common } = useClientDict();
  const last = useRef<unknown>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) toast(success);
    else toast(errors[(state as { error: string }).error] ?? common.failed, "error");
  }, [state, success, errors, common.failed]);
}

export function ProfileForm({ name, locale, labels }: { name: string; locale: string; labels: { name: string; language: string; save: string } }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  const { toasts } = useClientDict();
  useResultToast(state, toasts.profileSaved);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <div>
        <label className="label">{labels.name}</label>
        <input name="name" required defaultValue={name} className="input" dir="auto" />
      </div>
      <div>
        <label className="label">{labels.language}</label>
        <select name="locale" defaultValue={locale} className="input">
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>
      <button className="btn-primary" disabled={pending}>{labels.save}</button>
    </form>
  );
}

export function PasswordForm({ labels }: { labels: { current: string; next: string; nextHint: string; wrong: string; short: string; save: string } }) {
  const [state, action, pending] = useActionState(changePassword, null);
  const { toasts } = useClientDict();
  const ref = useRef<HTMLFormElement>(null);
  useResultToast(state, toasts.passwordChanged, { wrong: labels.wrong, short: labels.short });
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
      <div>
        <label className="label">{labels.current}</label>
        <input name="current" type="password" required autoComplete="current-password" className="input" dir="ltr" />
      </div>
      <div>
        <label className="label">{labels.next}</label>
        <input name="next" type="password" required minLength={10} autoComplete="new-password" className="input" dir="ltr" />
        <p className="hint">{labels.nextHint}</p>
      </div>
      <button className="btn-secondary sm:mt-[26px]" disabled={pending}>{labels.save}</button>
    </form>
  );
}

export function OrgForm({
  name,
  brandContext,
  complianceRules,
  labels,
  disabled,
}: {
  name: string;
  brandContext: string;
  complianceRules: string;
  disabled: boolean;
  labels: { name: string; context: string; placeholder: string; compliance: string; compliancePlaceholder: string; save: string; saved: string };
}) {
  const [state, action, pending] = useActionState(updateOrganization, null);
  useResultToast(state, labels.saved);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">{labels.name}</label>
        <input name="name" defaultValue={name} className="input max-w-md" disabled={disabled} dir="auto" />
      </div>
      <div>
        <label className="label">{labels.context}</label>
        <textarea name="brandContext" defaultValue={brandContext} className="input min-h-24 [field-sizing:content]" placeholder={labels.placeholder} disabled={disabled} dir="auto" />
      </div>
      <div>
        <label className="label">{labels.compliance}</label>
        <textarea name="complianceRules" defaultValue={complianceRules} className="input min-h-24 [field-sizing:content]" placeholder={labels.compliancePlaceholder} disabled={disabled} dir="auto" />
      </div>
      {!disabled && (
        <button className="btn-primary" disabled={pending}>
          {labels.save}
        </button>
      )}
    </form>
  );
}

export function WeeklyReportForm({
  enabled,
  day,
  locale,
  recipients,
  labels,
}: {
  enabled: boolean;
  day: number;
  locale: string;
  recipients: string[];
  labels: { enabled: string; day: string; recipients: string; recipientsPh: string; language: string; days: readonly string[]; save: string; saved: string };
}) {
  const [state, action, pending] = useActionState(saveWeeklyReport, null);
  useResultToast(state, labels.saved);
  return (
    <form action={action} className="space-y-4">
      <label className="flex cursor-pointer items-center gap-3">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="peer sr-only" />
        <span className="relative h-5 w-9 rounded-full bg-line-strong transition peer-checked:bg-brand-600 after:absolute after:start-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:start-[18px]" />
        <span className="text-[13.5px] font-medium">{labels.enabled}</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
        <div>
          <label className="label">{labels.recipients}</label>
          <input name="recipients" defaultValue={recipients.join(", ")} placeholder={labels.recipientsPh} className="input" dir="ltr" />
        </div>
        <div>
          <label className="label">{labels.day}</label>
          <select name="day" defaultValue={day} className="input">
            {labels.days.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{labels.language}</label>
          <select name="locale" defaultValue={locale} className="input">
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <button className="btn-primary" disabled={pending}>{labels.save}</button>
    </form>
  );
}

export function AddMemberForm({ labels, roles }: { labels: { name: string; email: string; role: string; password: string; add: string; error: string }; roles: Record<string, string> }) {
  const [state, action, pending] = useActionState(addMember, null);
  const { toasts } = useClientDict();
  const ref = useRef<HTMLFormElement>(null);
  useResultToast(state, toasts.memberAdded);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2 border-t border-line bg-canvas/50 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_9rem_1fr_auto]">
      <input name="name" required placeholder={labels.name} className="input" dir="auto" />
      <input name="email" type="email" required placeholder={labels.email} className="input" dir="ltr" />
      <select name="role" className="input" defaultValue="ANALYST">
        {(["ADMIN", "ANALYST", "VIEWER"] as const).map((r) => (
          <option key={r} value={r}>{roles[r]}</option>
        ))}
      </select>
      <input name="password" type="text" required minLength={10} placeholder={labels.password} className="input" dir="ltr" autoComplete="off" />
      <button className="btn-primary" disabled={pending}>{labels.add}</button>
    </form>
  );
}

export function MemberControls({ id, role, roles, deactivateLabel }: { id: string; role: Role; roles: Record<string, string>; deactivateLabel: string }) {
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();
  return (
    <div className="flex items-center gap-1">
      <select
        className="input h-8 w-auto py-0 text-[13px]"
        value={role}
        disabled={pending}
        onChange={(e) => start(async () => { await updateMember(id, { role: e.target.value as Role }); toast(toasts.memberUpdated); })}
      >
        {(["ADMIN", "ANALYST", "VIEWER"] as const).map((r) => (
          <option key={r} value={r}>{roles[r]}</option>
        ))}
      </select>
      <button type="button" className="btn-ghost btn-sm text-neg" disabled={pending} onClick={() => start(async () => { await updateMember(id, { active: false }); toast(toasts.memberUpdated); })}>
        {deactivateLabel}
      </button>
    </div>
  );
}
