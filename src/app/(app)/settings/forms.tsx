"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import type { Role } from "@prisma/client";
import { addMember, updateMember, updateOrganization } from "@/app/actions";

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
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">{labels.name}</label>
        <input name="name" defaultValue={name} className="input" disabled={disabled} dir="auto" />
      </div>
      <div>
        <label className="label">{labels.context}</label>
        <textarea name="brandContext" defaultValue={brandContext} className="input min-h-28" placeholder={labels.placeholder} disabled={disabled} dir="auto" />
      </div>
      <div>
        <label className="label">{labels.compliance}</label>
        <textarea name="complianceRules" defaultValue={complianceRules} className="input min-h-28" placeholder={labels.compliancePlaceholder} disabled={disabled} dir="auto" />
      </div>
      {!disabled && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={pending}>{labels.save}</button>
          {state?.ok && <span className="text-sm text-green-700">{labels.saved}</span>}
        </div>
      )}
    </form>
  );
}

export function AddMemberForm({ labels, roles }: { labels: { name: string; email: string; role: string; password: string; add: string; error: string }; roles: Record<string, string> }) {
  const [state, action, pending] = useActionState(addMember, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3 border-t border-line p-5 sm:grid-cols-2 lg:grid-cols-5">
      <input name="name" required placeholder={labels.name} className="input" dir="auto" />
      <input name="email" type="email" required placeholder={labels.email} className="input" dir="ltr" />
      <select name="role" className="input" defaultValue="ANALYST">
        {(["ADMIN", "ANALYST", "VIEWER"] as const).map((r) => (
          <option key={r} value={r}>{roles[r]}</option>
        ))}
      </select>
      <input name="password" type="text" required minLength={10} placeholder={labels.password} className="input" dir="ltr" autoComplete="off" />
      <button className="btn-primary" disabled={pending}>{labels.add}</button>
      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-5">{labels.error} ({state.error})</p>}
    </form>
  );
}

export function MemberControls({ id, role, roles, deactivateLabel }: { id: string; role: Role; roles: Record<string, string>; deactivateLabel: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <select className="input w-auto py-1.5" value={role} disabled={pending} onChange={(e) => start(() => updateMember(id, { role: e.target.value as Role }))}>
        {(["ADMIN", "ANALYST", "VIEWER"] as const).map((r) => (
          <option key={r} value={r}>{roles[r]}</option>
        ))}
      </select>
      <button type="button" className="btn-ghost px-2 py-1.5 text-xs text-red-600" disabled={pending} onClick={() => start(() => updateMember(id, { active: false }))}>
        {deactivateLabel}
      </button>
    </div>
  );
}
