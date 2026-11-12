"use client";

import Link from "next/link";
import { useState } from "react";
import type { AlertKind, Severity } from "@prisma/client";
import { Activity, Bell, LogOut, Mail, Plus, ShieldAlert, Star, TrendingDown, Type } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";
import { fill } from "@/components/client-dict";
import { PageHeader } from "@/components/ui";
import { NewAlertSheet } from "./alert-form";
import { RuleControls } from "./rule-row";

export type RuleView = {
  id: string;
  kind: AlertKind;
  name: string;
  sentence: string;
  scope: string;
  last: string;
  enabled: boolean;
  emails: number;
  hook: string | null;
};
export type NoteDay = {
  key: string;
  label: string;
  items: { id: string; severity: Severity; title: string; body: string; rule: string | null; time: string; link: string | null }[];
};

export const KIND_ICON: Record<AlertKind, React.ElementType> = {
  NEGATIVE_SPIKE: TrendingDown,
  VOLUME_SPIKE: Activity,
  KEYWORD: Type,
  HIGH_REACH: Star,
  CHURN_RISK: LogOut,
  RISK: ShieldAlert,
};

/** Chat bubble with a hash: Slack or Teams. */
export function HookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM9 8l-1 6M14 8l-1 6M7.5 10h8M7 12.5h8" />
    </svg>
  );
}

const SEV: Record<Severity, string> = { CRITICAL: "bg-neg", WARNING: "bg-warn", INFO: "bg-info" };

export function AlertsView({
  title,
  rules,
  days,
  monitors,
  canEdit,
  locale,
  t,
  labels,
}: {
  title: string;
  rules: RuleView[];
  days: NoteDay[];
  monitors: { id: string; name: string }[];
  canEdit: boolean;
  locale: "ar" | "en";
  t: Dict["alertsPage"];
  labels: { anyMonitor: string; confirmDelete: string; delete: string; recent: string };
}) {
  const [sheet, setSheet] = useState<{ open: boolean; kind: AlertKind }>({ open: false, kind: "NEGATIVE_SPIKE" });
  const open = (kind: AlertKind = "NEGATIVE_SPIKE") => setSheet({ open: true, kind });
  const onCount = rules.filter((r) => r.enabled).length;
  const empty = rules.length === 0;

  return (
    <>
      <PageHeader
        title={title}
        actions={
          canEdit && (
            <button type="button" className="btn-primary h-10 gap-2 rounded-[12px] ps-4 pe-[18px] text-[14px] font-semibold" aria-haspopup="dialog" onClick={() => open()}>
              <Plus className="h-4 w-4" strokeWidth={1.8} />
              {t.newAlert}
            </button>
          )
        }
      />

      <section className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card px-5 pt-6 pb-2 sm:px-6">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h2 className="text-[16px] font-semibold">{t.rules}</h2>
            {!empty && <span className="text-[13.5px] text-faint">{fill(t.onCount, { on: onCount, total: rules.length })}</span>}
          </div>
          {empty ? (
            <div className="flex flex-col items-center gap-4 px-2 pt-12 pb-14 text-center sm:px-6">
              <p className="max-w-[420px] text-[15px] text-muted">{t.empty}</p>
              {canEdit ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {(t.starters as readonly AlertKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => open(k)}
                      className="btn-secondary h-[38px] rounded-[11px] px-3.5 text-[14px]"
                    >
                      <Plus className="h-3.5 w-3.5 text-muted" strokeWidth={1.8} />
                      {t.defaultNames[k]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-faint">{t.viewOnly}</p>
              )}
            </div>
          ) : (
            <ul>
              {rules.map((r, i) => (
                <RuleRow locale={locale} key={r.id} r={r} first={i === 0} canEdit={canEdit} t={t} labels={labels} />
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 sm:p-6">
          <h2 className="mb-1 text-[16px] font-semibold">{labels.recent}</h2>
          {days.length === 0 ? (
            <p className="pt-10 pb-8 text-center text-[14px] text-faint">{t.noNotes}</p>
          ) : (
            days.map((d) => (
              <div key={d.key}>
                <div className="mt-[18px] mb-1.5 text-[12.5px] text-faint">{d.label}</div>
                <ol>
                  {d.items.map((n, k) => {
                    const last = k === d.items.length - 1;
                    return (
                      <li key={n.id} className={cn("relative grid grid-cols-[12px_minmax(0,1fr)] gap-3.5", !last && "pb-[18px]")}>
                        {!last && <span aria-hidden className="absolute start-[5.5px] top-5 -bottom-1 w-px bg-sunken" />}
                        <span aria-hidden className="flex justify-center">
                          <span className={cn("mt-2 h-2 w-2 rounded-full", SEV[n.severity])} />
                        </span>
                        <Link href={n.link ?? "/mentions"} prefetch={false} className="group flex min-w-0 flex-col gap-[3px] rounded-md">
                          <span className="flex justify-between gap-3 text-[14.5px] font-medium leading-[1.55]">
                            <span className="min-w-0 [overflow-wrap:anywhere] group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4" dir="auto">{n.title}</span>
                            <span className="shrink-0 text-[12.5px] font-normal text-faint tnum">{n.time}</span>
                          </span>
                          <span dir="auto" className="line-clamp-2 text-[13.5px] leading-[1.7] text-muted [overflow-wrap:anywhere]">{n.body}</span>
                          {n.rule && <span className="truncate text-[12.5px] text-faint" dir="auto">{n.rule}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))
          )}
        </div>
      </section>

      {canEdit && (
        <NewAlertSheet
          open={sheet.open}
          initialKind={sheet.kind}
          onClose={() => setSheet((s) => ({ ...s, open: false }))}
          monitors={monitors}
          anyMonitor={labels.anyMonitor}
          locale={locale}
          t={t}
        />
      )}
    </>
  );
}


function RuleRow({ r, first, canEdit, t, labels, locale }: { locale: string; r: RuleView; first: boolean; canEdit: boolean; t: Dict["alertsPage"]; labels: { confirmDelete: string; delete: string } }) {
  const [on, setOn] = useState(r.enabled);
  const Icon = KIND_ICON[r.kind];
  const dim = on ? "" : "opacity-45";
  const ch = [
    { key: "app", Icon: Bell, label: t.channels.inApp, active: true, n: 0 },
    { key: "mail", Icon: Mail, label: r.emails ? fill(t.channels.emailN, { n: r.emails }) : t.channels.noEmail, active: r.emails > 0, n: r.emails },
    { key: "hook", Icon: HookIcon, label: r.hook ?? t.channels.noHook, active: !!r.hook, n: 0 },
  ];
  return (
    <li
      className={cn(
        "group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-4 sm:grid-cols-[40px_minmax(0,1fr)_96px_auto]",
        !first && "border-t border-sunken",
      )}
    >
      <span className={cn("flex h-10 w-10 items-center justify-center self-start rounded-[11px] bg-sunken sm:self-center transition-opacity", dim)}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
      </span>
      <span className={cn("flex min-w-0 flex-col gap-[3px] transition-opacity", dim)}>
        <span className="text-[15px] font-semibold leading-normal [overflow-wrap:anywhere]" dir="auto">{r.name}</span>
        <span className="text-[14px] leading-[1.6] text-muted">{r.sentence}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-[12.5px] leading-[1.6] text-faint">
          <span className="min-w-0 truncate" dir="auto">{r.scope}</span>
          <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-faint" />
          <span>{r.last}</span>
        </span>
      </span>
      <span
        aria-label={ch.filter((c) => c.active).map((c) => c.label).join(", ")}
        className={cn("col-start-2 row-start-2 grid grid-cols-[repeat(3,24px)] items-center gap-3 transition-opacity sm:col-start-auto sm:row-start-auto", dim)}
      >
        {ch.map(({ key, Icon: I, label, active, n }) => (
          <span key={key} title={label} className={cn("relative flex h-6 w-6 items-center justify-center text-muted", !active && "opacity-25")}>
            <I className="h-[17px] w-[17px]" strokeWidth={1.6} />
            {n > 0 && (
              <span dir="ltr" className="absolute -top-[5px] start-[15px] h-[15px] min-w-[15px] rounded-full bg-ink px-[3px] text-center text-[10px] font-semibold leading-[15px] text-surface tnum">
                {n > 9 ? "9+" : n}
              </span>
            )}
          </span>
        ))}
      </span>
      <span className="col-start-3 row-span-2 row-start-1 flex items-center gap-1 self-start sm:col-start-auto sm:row-span-1 sm:row-start-auto sm:self-center">
        <RuleControls locale={locale} id={r.id} name={r.name} enabled={on} onChange={setOn} canEdit={canEdit} labels={{ delete: t.deleteRule, confirm: labels.confirmDelete, confirmLabel: labels.delete }} />
      </span>
    </li>
  );
}
