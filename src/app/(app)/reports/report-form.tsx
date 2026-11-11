"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { createReport } from "@/app/actions";

export function ReportForm({
  monitors,
  locale,
  labels,
  ranges,
}: {
  monitors: { id: string; name: string }[];
  locale: string;
  labels: { period: string; scope: string; all: string; language: string; submit: string };
  ranges: Record<string, string>;
}) {
  const [, action, pending] = useActionState(createReport, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">{labels.period}</label>
        <select name="days" className="input" defaultValue="7">
          {Object.entries(ranges).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{labels.scope}</label>
        <select name="monitorId" className="input">
          <option value="">{labels.all}</option>
          {monitors.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{labels.language}</label>
        <select name="locale" className="input" defaultValue={locale}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>
      <button className="btn-primary w-full" disabled={pending}>
        <Sparkles className="h-4 w-4" /> {labels.submit}
      </button>
    </form>
  );
}
