"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Search, X } from "lucide-react";

type Opt = { value: string; label: string };

export function FilterBar({
  monitors,
  platforms,
  sentiments,
  statuses,
  ranges,
  dialects,
  intents,
  labels,
  topicLabel,
}: {
  monitors: Opt[];
  platforms: Opt[];
  sentiments: Opt[];
  statuses: Opt[];
  ranges: Opt[];
  dialects: Opt[];
  intents: Opt[];
  labels: {
    search: string; allMonitors: string; allPlatforms: string; allSentiment: string; onlyRisks: string; export: string; all: string;
    allDialects: string; allIntents: string; onlySarcasm: string;
  };
  topicLabel?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`/mentions?${next}`);
  };

  useEffect(() => {
    const id = setTimeout(() => (q !== (sp.get("q") ?? "") ? set("q", q) : null), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select = (key: string, opts: Opt[], placeholder: string) => (
    <select className="input w-auto min-w-36 py-2" value={sp.get(key) ?? ""} onChange={(e) => set(key, e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );

  return (
    <div className="card mb-5 flex flex-wrap items-center gap-2 p-3">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input py-2 ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} dir="auto" />
      </div>
      {select("monitor", monitors, labels.allMonitors)}
      {select("platform", platforms, labels.allPlatforms)}
      {select("sentiment", sentiments, labels.allSentiment)}
      {select("dialect", dialects, labels.allDialects)}
      {select("intent", intents, labels.allIntents)}
      {select("status", statuses, labels.all)}
      <select className="input w-auto py-2" value={sp.get("days") ?? "30"} onChange={(e) => set("days", e.target.value)}>
        {ranges.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
        <input type="checkbox" className="accent-red-600" checked={sp.get("risk") === "1"} onChange={(e) => set("risk", e.target.checked ? "1" : "")} />
        {labels.onlyRisks}
      </label>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
        <input type="checkbox" className="accent-fuchsia-600" checked={sp.get("sarcasm") === "1"} onChange={(e) => set("sarcasm", e.target.checked ? "1" : "")} />
        🙃 {labels.onlySarcasm}
      </label>
      {topicLabel && (
        <button type="button" onClick={() => set("topic", "")} className="flex items-center gap-1 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
          {topicLabel} <X className="h-3.5 w-3.5" />
        </button>
      )}
      <a href={`/api/export?${sp.toString()}`} className="btn-secondary py-2">
        <Download className="h-4 w-4" /> {labels.export}
      </a>
    </div>
  );
}
