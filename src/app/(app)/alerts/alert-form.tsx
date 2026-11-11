"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { AlertKind } from "@prisma/client";
import type { Dict } from "@/lib/i18n/en";
import { createAlert } from "@/app/actions";
import { cn } from "@/lib/utils";

const KINDS: AlertKind[] = ["NEGATIVE_SPIKE", "VOLUME_SPIKE", "RISK", "HIGH_REACH", "KEYWORD"];
const DEFAULTS: Record<AlertKind, number> = { NEGATIVE_SPIKE: 35, VOLUME_SPIKE: 100, HIGH_REACH: 50000, KEYWORD: 0, RISK: 0 };

export function AlertForm({ t, monitors, saveLabel }: { t: Dict["alerts"]; monitors: { id: string; name: string }[]; saveLabel: string }) {
  const [kind, setKind] = useState<AlertKind>("NEGATIVE_SPIKE");
  const [state, action, pending] = useActionState(createAlert, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1">
        {KINDS.map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => setKind(k)}
            className={cn("rounded-xl border-2 px-3 py-2.5 text-start", kind === k ? "border-brand-500 bg-brand-50" : "border-line hover:border-slate-300")}
          >
            <div className="text-sm font-medium">{t.kind[k]}</div>
            <div className="mt-0.5 text-xs text-muted">{t.kindHelp[k]}</div>
          </button>
        ))}
      </div>
      <div>
        <label className="label">{t.name}</label>
        <input name="name" required className="input" defaultValue="" placeholder={t.kind[kind]} dir="auto" />
      </div>
      <div>
        <label className="label">{t.monitor}</label>
        <select name="monitorId" className="input">
          <option value="">{t.anyMonitor}</option>
          {monitors.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      {kind === "KEYWORD" && (
        <div>
          <label className="label">{t.keyword}</label>
          <input name="keyword" required className="input" dir="auto" />
        </div>
      )}
      {(kind === "NEGATIVE_SPIKE" || kind === "VOLUME_SPIKE" || kind === "HIGH_REACH") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{t.threshold[kind]}</label>
            <input key={kind} name="threshold" type="number" min={0} defaultValue={DEFAULTS[kind]} className="input" dir="ltr" />
          </div>
          {kind !== "HIGH_REACH" && (
            <div>
              <label className="label">{t.window}</label>
              <select name="windowMinutes" className="input" defaultValue="1440">
                {Object.entries(t.windowOpts).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      <div>
        <label className="label">{t.email}</label>
        <input name="emails" className="input" placeholder={t.emailPlaceholder} dir="ltr" />
      </div>
      <button className="btn-primary w-full" disabled={pending}>{saveLabel}</button>
    </form>
  );
}
