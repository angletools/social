"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { addMember, changePassword, saveWeeklyReport, updateMember, updateOrganization, updateProfile } from "@/app/actions";
import { addComplianceRule, removeComplianceRule, saveChannel, testChannel } from "./actions";
import { confirmDialog, toast } from "@/components/feedback";
import { fill, useClientDict } from "@/components/client-dict";
import { SolidAvatar } from "@/components/avatar";
import { applyTheme, type Theme } from "@/lib/theme";
import type { Dict } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";
import { Segmented, Switch } from "./controls";
import { S } from "./styles";

type P = Dict["settingsPage"];
type Result = { ok: true } | { ok: false; error: string } | null;

/** Shows one toast per action result; errors offer Retry, which resubmits the form. */
function useResultToast(state: Result, success: string, errors: Record<string, string> = {}, form?: React.RefObject<HTMLFormElement | null>) {
  const { common } = useClientDict();
  const last = useRef<unknown>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) toast(success);
    else toast(errors[state.error] ?? common.failed, "error", form?.current ? { retry: () => form.current?.requestSubmit() } : {});
  }, [state, success, errors, common.failed, form]);
}

// ---------- General ----------

export function ProfileForm({
  name,
  email,
  locale,
  theme,
  heading,
  labels,
}: {
  name: string;
  email: string;
  locale: "ar" | "en";
  theme: Theme;
  heading: string;
  labels: P["general"] & { save: string };
}) {
  const [state, action, pending] = useActionState(updateProfile, null);
  const { toasts } = useClientDict();
  const ref = useRef<HTMLFormElement>(null);
  const [lang, setLang] = useState(locale);
  const [look, setLook] = useState<Theme>(theme);
  useResultToast(state, toasts.profileSaved, {}, ref);
  return (
    <form ref={ref} action={action} className={S.panel}>
      <div className="flex items-center gap-3.5">
        <SolidAvatar name={name} seed={email} size={44} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={S.title}>{labels.profile}</span>
          <span className="truncate text-[13px] text-muted">{heading}</span>
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={S.field}>
          <span className={S.label}>{labels.name}</span>
          <input name="name" required maxLength={80} defaultValue={name} className={S.input} dir="auto" autoComplete="name" />
        </label>
        <label className={S.field}>
          <span className={S.label}>{labels.email}</span>
          <input value={email} disabled readOnly dir="ltr" className={cn(S.input, "truncate disabled:bg-transparent disabled:text-muted")} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={S.field}>
          <span className={S.label} id="lang-l">{labels.language}</span>
          <Segmented
            name="locale"
            label={labels.language}
            value={lang}
            onChange={setLang}
            options={[
              { value: "ar", label: "العربية", lang: "ar" },
              { value: "en", label: "English", lang: "en" },
            ]}
          />
        </div>
        <div className={S.field}>
          <span className={S.label}>{labels.appearance}</span>
          <Segmented<Theme>
            label={labels.appearance}
            value={look}
            onChange={(v) => {
              setLook(v);
              applyTheme(v);
            }}
            options={(["light", "dark", "system"] as const).map((v) => ({ value: v, label: labels.themes[v] }))}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button className={S.main} disabled={pending}>{labels.save}</button>
      </div>
    </form>
  );
}

export function PasswordForm({ labels }: { labels: P["general"] & { wrong: string; short: string } }) {
  const [state, action, pending] = useActionState(changePassword, null);
  const { toasts } = useClientDict();
  const ref = useRef<HTMLFormElement>(null);
  useResultToast(state, toasts.passwordChanged, { wrong: labels.wrong, short: labels.short });
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className={S.panel}>
      <span className={S.title}>{labels.password}</span>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={S.field}>
          <span className={S.label}>{labels.current}</span>
          <input name="current" type="password" required autoComplete="current-password" className={S.input} dir="ltr" />
        </label>
        <label className={S.field}>
          <span className={S.label}>{labels.next}</span>
          <input name="next" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className={S.input} dir="ltr" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <span className="text-[13px] text-faint">{labels.passwordHint}</span>
        <button className={S.line} disabled={pending}>{labels.changePassword}</button>
      </div>
    </form>
  );
}

export function OrgForm({
  name,
  timezone,
  zones,
  disabled,
  labels,
}: {
  name: string;
  timezone: string;
  zones: { id: string; label: string; offset: string }[];
  disabled: boolean;
  labels: P["general"] & { save: string; saved: string; adminOnly: string };
}) {
  const [state, action, pending] = useActionState(updateOrganization, null);
  const ref = useRef<HTMLFormElement>(null);
  const [tz, setTz] = useState(timezone);
  useResultToast(state, labels.saved, {}, ref);
  const offset = zones.find((z) => z.id === tz)?.offset;
  return (
    <form ref={ref} action={action} className={S.panel}>
      <span className={S.title}>{labels.organization}</span>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={S.field}>
          <span className={S.label}>{labels.orgName}</span>
          <input name="name" required maxLength={100} defaultValue={name} className={S.input} disabled={disabled} dir="auto" />
        </label>
        <label className={S.field}>
          <span className={S.label}>{labels.timezone}</span>
          <span className="relative block">
            <select name="timezone" value={tz} onChange={(e) => setTz(e.target.value)} disabled={disabled} className={cn(S.input, "cursor-pointer appearance-none pe-24")}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center gap-2.5 text-[14px] text-faint">
              {offset && <span dir="ltr">{offset}</span>}
              <ChevronDown className="h-4 w-4 text-muted" strokeWidth={1.8} />
            </span>
          </span>
        </label>
      </div>
      {disabled ? (
        <p className="text-[13px] text-faint">{labels.adminOnly}</p>
      ) : (
        <div className="flex justify-end">
          <button className={S.main} disabled={pending}>{labels.save}</button>
        </div>
      )}
    </form>
  );
}

// ---------- Team ----------

export type MemberRow = { id: string; name: string; email: string; role: Role; active: boolean; you: boolean; editable: boolean; seen: string };



export function TeamPanel({
  members,
  seats,
  canManage,
  labels,
  roles,
}: {
  members: MemberRow[];
  seats: string;
  canManage: boolean;
  labels: P["team"] & { title: string; you: string };
  roles: Record<Role, string>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[20px] font-semibold">{labels.title}</h2>
        <span className="text-[13.5px] text-faint">{seats}</span>
        {canManage && (
          <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} className={cn(S.main, "ms-auto ps-3.5 pe-4")}>
            <Plus className="h-4 w-4" strokeWidth={1.8} /> {labels.add}
          </button>
        )}
      </div>
      {canManage && adding && <AddMemberForm labels={labels} roles={roles} onDone={() => setAdding(false)} />}
      <section className="card overflow-visible">
        <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 text-[12.5px] text-faint sm:grid-cols-[minmax(0,1fr)_160px_140px] sm:px-6">
          <span>{labels.member}</span>
          <span>{labels.role}</span>
          <span className="hidden text-end sm:block">{labels.lastActive}</span>
        </div>
        <ul>
          {members.map((m) => (
            <li
              key={m.id}
              className={cn(
                "grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-sunken px-5 py-3 sm:grid-cols-[minmax(0,1fr)_160px_140px] sm:px-6 sm:py-0",
                !m.active && "opacity-50",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <SolidAvatar name={m.name} seed={m.email} size={34} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-1.5 text-[14.5px] font-medium">
                    <span dir="auto" className="truncate">{m.name}</span>
                    {m.you && <span className="shrink-0 text-[12.5px] font-normal text-faint">{labels.you}</span>}
                  </span>
                  <span dir="ltr" className="truncate text-start text-[13px] text-muted rtl:text-end">{m.email}</span>
                  <span className="text-[12.5px] text-faint sm:hidden">{m.seen}</span>
                </span>
              </span>
              <span className="relative">
                {canManage && m.editable ? (
                  <RoleMenu member={m} labels={labels} roles={roles} />
                ) : (
                  <span className="inline-flex h-[30px] items-center text-[13.5px] text-muted">{roles[m.role]}</span>
                )}
              </span>
              <span className="hidden text-end text-[13.5px] text-muted sm:block">{m.seen}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function AddMemberForm({ labels, roles, onDone }: { labels: P["team"]; roles: Record<Role, string>; onDone: () => void }) {
  const [state, action, pending] = useActionState(addMember, null);
  const { toasts, common } = useClientDict();
  const ref = useRef<HTMLFormElement>(null);
  useResultToast(state, toasts.memberAdded, labels.errors);
  if (state?.ok && state.inviteUrl) return <section className={S.panel}><h3 className={S.title}>{labels.inviteReady}</h3><p className="text-sm text-muted">{labels.inviteHelp}</p><input className={S.input} aria-label={labels.inviteReady} value={state.inviteUrl} readOnly dir="ltr" onFocus={e => e.target.select()} /><div className="flex flex-wrap gap-2"><button type="button" className={S.main} onClick={async () => { try { await navigator.clipboard.writeText(state.inviteUrl!); toast(common.copied); } catch { toast(common.failed, "error"); } }}>{labels.inviteCopy}</button><button type="button" onClick={onDone} className={S.ghost}>{common.close}</button></div></section>;
  return (
    <form ref={ref} action={action} className={cn(S.panel, "animate-rise")}>
      <span className={S.title}>{labels.addTitle}</span>
      <div className="grid gap-4 sm:grid-cols-[1fr_1.25fr_150px]">
        <label className={S.field}>
          <span className={S.label}>{labels.name}</span>
          <input name="name" required maxLength={80} className={S.input} dir="auto" autoComplete="off" autoFocus />
        </label>
        <label className={S.field}>
          <span className={S.label}>{labels.email}</span>
          <input name="email" type="email" required maxLength={200} className={S.input} dir="ltr" autoComplete="off" />
        </label>
        <label className={S.field}>
          <span className={S.label}>{labels.role}</span>
          <span className="relative block">
            <select name="role" defaultValue="ANALYST" className={cn(S.input, "cursor-pointer appearance-none pe-10")}>
              {(["ADMIN", "ANALYST", "VIEWER"] as const).map((r) => (
                <option key={r} value={r}>{roles[r]}</option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.8} />
          </span>
        </label>
      </div>
      <p className="text-[13px] text-muted">{labels.inviteHelp}</p>
      <div className="flex justify-end gap-2"><button type="button" onClick={onDone} className={S.ghost}>{common.cancel}</button><button className={S.main} disabled={pending}>{labels.add}</button></div>
    </form>
  );
}

function RoleMenu({ member, labels, roles }: { member: MemberRow; labels: P["team"]; roles: Record<Role, string> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toasts, common } = useClientDict();
  const router = useRouter();
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const run = (change: { role?: Role; active?: boolean }, done: string) =>
    start(async () => {
      setOpen(false);
      try {
        await updateMember(member.id, change);
        toast(done);
        router.refresh();
      } catch {
        toast(common.failed, "error", { retry: () => run(change, done) });
      }
    });
  const deactivate = async () => {
    setOpen(false);
    if (await confirmDialog(fill(labels.deactivateConfirm, { name: member.name }), { detail: labels.deactivateDetail, danger: true, confirmLabel: labels.deactivate })) {
      run({ active: false }, toasts.memberUpdated);
    }
  };

  if (!member.active) {
    return (
      <button type="button" disabled={pending} onClick={() => run({ active: true }, toasts.memberUpdated)} className="-ms-3 inline-flex h-8 items-center rounded-[9px] border border-line px-3 text-[13.5px] hover:bg-sunken">
        {labels.reactivate}
      </button>
    );
  }
  return (
    <span ref={wrap} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={fill(labels.changeRole, { name: member.name })}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[9px] border bg-transparent ps-3 pe-2 text-[13.5px] transition-colors sm:-ms-[13px] max-md:h-10",
          open ? "border-ink" : "border-line hover:border-line-strong",
        )}
      >
        {roles[member.role]}
        <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
      </button>
      {open && (
        <span
          role="menu"
          className="animate-pop absolute top-[38px] end-0 z-20 flex w-[min(300px,calc(100vw-32px))] origin-top flex-col gap-0.5 rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.14)] sm:end-auto sm:-start-1 sm:origin-top-left rtl:sm:origin-top-right"
        >
          {(["ADMIN", "ANALYST", "VIEWER"] as const).map((r) => {
            const on = member.role === r;
            return (
              <button
                key={r}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => (on ? setOpen(false) : run({ role: r }, fill(labels.roleChanged, { name: member.name, role: roles[r] })))}
                className={cn("flex items-start gap-2.5 rounded-[9px] px-2.5 py-[9px] text-start transition-colors", on ? "bg-canvas" : "hover:bg-canvas")}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold">{roles[r]}</span>
                  <span className="text-[12.5px] leading-[1.45] text-muted">{labels.roleDesc[r]}</span>
                </span>
                <span className="w-4 shrink-0 pt-0.5">{on && <Check className="h-4 w-4" strokeWidth={2} />}</span>
              </button>
            );
          })}
          <span aria-hidden className="mx-2 my-1 h-px bg-line" />
          <button type="button" role="menuitem" onClick={deactivate} className="h-[38px] rounded-[9px] px-2.5 text-start text-[14px] text-neg transition-colors hover:bg-neg/[0.06]">
            {labels.deactivate}
          </button>
        </span>
      )}
    </span>
  );
}

// ---------- Brand voice ----------

export function BrandContextForm({ value, disabled, labels }: { value: string; disabled: boolean; labels: P["voice"] & { save: string; saved: string; adminOnly: string } }) {
  const [state, action, pending] = useActionState(updateOrganization, null);
  const ref = useRef<HTMLFormElement>(null);
  useResultToast(state, labels.saved, {}, ref);
  return (
    <form ref={ref} action={action} className={cn(S.panel, "gap-4")}>
      <div className="flex flex-col gap-1">
        <span className={S.title}>{labels.about}</span>
        <span className={S.sub}>{labels.aboutHint}</span>
      </div>
      <textarea
        name="brandContext"
        defaultValue={value}
        maxLength={1500}
        rows={4}
        disabled={disabled}
        placeholder={labels.aboutPh}
        dir="auto"
        className="input min-h-[120px] resize-y px-3.5 py-3 leading-[1.65] [field-sizing:content] md:text-[14.5px]"
      />
      {disabled ? (
        <p className="text-[13px] text-faint">{labels.adminOnly}</p>
      ) : (
        <div className="flex justify-end">
          <button className={S.main} disabled={pending}>{labels.save}</button>
        </div>
      )}
    </form>
  );
}

// ---------- Integrations ----------

type IntegrationLabels = P["integrations"];

function StatusLine({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn("flex items-center gap-[7px] whitespace-nowrap text-[13px]", on ? "text-pos" : "text-faint")}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function IntegrationHead({ icon, name, on, labels }: { icon: React.ReactNode; name: string; on: boolean; labels: { connected: string; notConnected: string } }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-sunken text-ink">{icon}</span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="truncate text-[15.5px] font-semibold">{name}</span>
        <StatusLine on={on} label={on ? labels.connected : labels.notConnected} />
      </span>
    </div>
  );
}

const masked = "flex h-10 items-center overflow-hidden rounded-[10px] bg-canvas px-3 font-mono text-[12.5px] whitespace-nowrap text-muted";

/** Slack / Teams webhook or the email sender: connect, test, change, remove. */
export function ChannelCard({
  kind,
  icon,
  name,
  value,
  display,
  canManage,
  ready = true,
  readyNote,
  selfEmail,
  labels,
}: {
  kind: "slack" | "teams" | "email";
  icon: React.ReactNode;
  name: string;
  value: string | null;
  display: string;
  canManage: boolean;
  /** Email can only send once SMTP is configured on the server. */
  ready?: boolean;
  readyNote?: string;
  /** Where a test email goes: the admin who presses the button. */
  selfEmail?: string;
  labels: IntegrationLabels;
}) {
  const [editing, setEditing] = useState(!value && kind !== "email");
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { common } = useClientDict();
  const isEmail = kind === "email";
  const on = isEmail ? ready : Boolean(value);
  const errorFor = (e: string) =>
    e === "webhook" ? fill(labels.webhookInvalid, { tool: kind === "slack" ? "Slack" : "Microsoft Teams" }) : e === "email" ? labels.emailInvalid : e === "not_configured" ? labels.notConfigured : e === "failed" ? labels.testFailed : common.failed;

  const save = (v: string) =>
    start(async () => {
      const r = await saveChannel(kind, v);
      if (!r.ok) return toast(errorFor(r.error), "error");
      toast(v ? labels.saved : labels.removed);
      setDraft("");
      setEditing(!v);
      router.refresh();
    });
  const test = () =>
    start(async () => {
      const r = await testChannel(kind, { subject: labels.testSubject, body: isEmail ? labels.testBody : labels.testMessage });
      if (r.ok) toast(isEmail && selfEmail ? fill(labels.testEmail, { email: selfEmail }) : labels.testSent);
      else toast(errorFor(r.error), "error", { retry: test });
    });
  const remove = async () => {
    if (await confirmDialog(`${labels.remove} ${name}?`, { danger: true, confirmLabel: labels.remove })) save("");
  };

  return (
    <section className="card flex min-w-0 flex-col gap-[18px] p-5 sm:p-6">
      <IntegrationHead icon={icon} name={name} on={on} labels={labels} />
      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] text-faint">{isEmail ? labels.sendsFrom : labels.webhook}</span>
        {editing && canManage ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), draft.trim() && save(draft))}
            placeholder={isEmail ? (value ?? labels.senderPh) : kind === "slack" ? labels.slackPh : labels.teamsPh}
            type={isEmail ? "email" : "url"}
            dir="ltr"
            aria-label={isEmail ? labels.sendsFrom : `${name} ${labels.webhook}`}
            className="input h-10 px-3 md:text-[13.5px]"
          />
        ) : (
          <span dir="ltr" className={masked} title={isEmail ? (value ?? undefined) : undefined}>
            <span className="truncate">{display || "—"}</span>
          </span>
        )}
      </div>
      <span className="text-[13px] leading-normal text-muted">
        {isEmail && !ready ? readyNote : isEmail ? labels.emailMeta : kind === "slack" ? labels.slackMeta : labels.teamsMeta}
      </span>
      {canManage && (
        <div className="mt-auto flex flex-wrap gap-2">
          {editing ? (
            <>
              <button type="button" className={S.mainSm} disabled={pending || !draft.trim()} onClick={() => save(draft)}>
                {isEmail && value ? common.save : labels.connect}
              </button>
              {value && (
                <button type="button" className={S.ghostSm} onClick={() => (setEditing(false), setDraft(""))}>
                  {common.cancel}
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className={S.lineSm} disabled={pending || !ready} onClick={test}>
                {labels.sendTest}
              </button>
              <button type="button" className={S.ghostSm} disabled={pending} onClick={() => (isEmail ? (setDraft(value ?? ""), setEditing(true)) : remove())}>
                {isEmail ? labels.change : labels.remove}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Weekly report ----------

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function WeeklyForm({
  enabled,
  day,
  locale,
  recipients,
  lastSent,
  labels,
}: {
  enabled: boolean;
  day: number;
  locale: "ar" | "en";
  recipients: string[];
  lastSent: string;
  labels: P["weekly"] & { save: string };
}) {
  const [state, action, pending] = useActionState(saveWeeklyReport, null);
  const ref = useRef<HTMLFormElement>(null);
  const [on, setOn] = useState(enabled);
  const [list, setList] = useState(recipients);
  const [text, setText] = useState("");
  const [d, setD] = useState(day);
  const [lang, setLang] = useState(locale);
  useResultToast(state, labels.saved, { recipients: labels.needRecipient }, ref);

  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const good = parts.filter((p) => EMAIL.test(p) && !list.includes(p));
    if (good.length) setList((l) => [...l, ...good].slice(0, 20));
    setText(parts.filter((p) => !EMAIL.test(p)).join(" "));
  };
  // Saudi work week first; keep Fri / Sat visible if one is already chosen.
  const days = [0, 1, 2, 3, 4, ...(day > 4 ? [day] : [])];

  return (
    <form
      ref={ref}
      action={(fd) => {
        if (text.trim()) {
          // Don't lose an address that was typed but not yet turned into a chip.
          const extra = text.split(/[\s,;]+/).filter((p) => EMAIL.test(p));
          fd.set("recipients", [...list, ...extra].join(","));
        }
        return action(fd);
      }}
      className={cn(S.panel, "gap-6")}
    >
      <div className="flex items-start gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={S.title}>{labels.send}</span>
          <span className="text-[14px] leading-relaxed text-muted">{labels.desc}</span>
        </span>
        <Switch checked={on} onChange={setOn} label={labels.send} name="enabled" />
      </div>
      <div className={cn("flex flex-col gap-5 transition-opacity duration-150", !on && "pointer-events-none opacity-45")} aria-disabled={!on || undefined}>
        <input type="hidden" name="recipients" value={list.join(",")} />
        <div className={S.field}>
          <span className={S.label} id="rcpt-l">{labels.recipients}</span>
          <div
            className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-[12px] border border-line p-1.5 transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100"
            onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
          >
            {list.map((r) => (
              <span key={r} dir="ltr" className="inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-lg bg-sunken ps-2.5 pe-1 text-[13.5px]">
                <span className="truncate">{r}</span>
                <button
                  type="button"
                  onClick={() => setList((l) => l.filter((x) => x !== r))}
                  aria-label={fill(labels.remove, { email: r })}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-line hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </span>
            ))}
            <input
              value={text}
              onChange={(e) => (/[\s,;]$/.test(e.target.value) ? commit(e.target.value) : setText(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commit(text); }
                if (e.key === "Backspace" && !text && list.length) setList((l) => l.slice(0, -1));
              }}
              onBlur={() => text && commit(text)}
              onPaste={(e) => {
                e.preventDefault();
                commit(text + " " + e.clipboardData.getData("text"));
              }}
              aria-labelledby="rcpt-l"
              type="email"
              dir="ltr"
              placeholder={labels.addEmail}
              className="h-[30px] min-w-[140px] flex-1 bg-transparent px-2 text-[16px] outline-none placeholder:text-faint md:text-[14px]"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={S.field}>
            <span className={S.label}>{labels.sendOn}</span>
            <Segmented name="day" label={labels.sendOn} value={d} onChange={setD} options={days.map((i) => ({ value: i, label: labels.days[i] }))} />
          </div>
          <div className={S.field}>
            <span className={S.label}>{labels.language}</span>
            <Segmented
              name="locale"
              label={labels.language}
              value={lang}
              onChange={setLang}
              options={[
                { value: "ar", label: "العربية", lang: "ar" },
                { value: "en", label: "English", lang: "en" },
              ]}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-sunken pt-5">
        <span className="text-[13px] text-faint">{lastSent}</span>
        <button className={S.main} disabled={pending}>{labels.save}</button>
      </div>
    </form>
  );
}

// ---------- Compliance ----------

export function ComplianceRules({ rules, canManage, labels }: { rules: string[]; canManage: boolean; labels: P["compliance"] & { adminOnly: string } }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { common } = useClientDict();
  const add = () =>
    text.trim() &&
    start(async () => {
      const r = await addComplianceRule(text);
      if (!r.ok) return toast(common.failed, "error", { retry: add });
      setText("");
      toast(labels.added);
      router.refresh();
    });
  const remove = (i: number, rule: string) =>
    start(async () => {
      const r = await removeComplianceRule(i, rule);
      if (!r.ok) return toast(common.failed, "error");
      toast(labels.removed);
      router.refresh();
    });
  return (
    <section className={cn(S.panel, "gap-4")}>
      <div className="flex flex-col gap-1">
        <span className={S.title}>{labels.title}</span>
        <span className={S.sub}>{labels.desc}</span>
      </div>
      {rules.length === 0 ? (
        <p className="py-3 text-[14px] text-muted">{labels.empty}</p>
      ) : (
        <ol className="flex flex-col">
          {rules.map((r, i) => (
            <li key={`${i}-${r}`} className="flex min-h-[52px] items-center gap-3.5 border-t border-sunken py-2 first:border-0">
              <span className="w-6 shrink-0 text-[13px] text-faint tnum">{i + 1}</span>
              <span dir="auto" className="min-w-0 flex-1 text-[14.5px] leading-[1.55] [overflow-wrap:anywhere]">{r}</span>
              {canManage && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(i, r)}
                  aria-label={fill(labels.remove, { n: i + 1 })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-faint transition-colors hover:bg-sunken hover:text-ink max-md:h-11 max-md:w-11"
                >
                  <X className="h-[15px] w-[15px]" strokeWidth={1.8} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {canManage ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={labels.addPh} dir="auto" className={cn(S.input, "flex-1")} aria-label={labels.add} />
          <button className={S.line} disabled={pending || !text.trim()}>{labels.add}</button>
        </form>
      ) : (
        <p className="text-[13px] text-faint">{labels.adminOnly}</p>
      )}
    </section>
  );
}
