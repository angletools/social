"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

/** Quick views are single URL params; picking one replaces the others. */
const QUICK: { key: string; param?: [string, string] }[] = [
  { key: "all" },
  { key: "needsReply", param: ["reply", "1"] },
  { key: "negative", param: ["sentiment", "NEGATIVE"] },
  { key: "risks", param: ["risk", "1"] },
  { key: "sarcasm", param: ["sarcasm", "1"] },
  { key: "mine", param: ["mine", "1"] },
];
const QUICK_PARAMS = ["reply", "sentiment", "risk", "sarcasm", "mine"];
const DETAIL_PARAMS = ["monitor", "platform", "dialect", "intent", "status", "topic"];

export function FilterBar({
  monitors,
  platforms,
  statuses,
  ranges,
  dialects,
  intents,
  labels,
  quick,
  topicLabel,
}: {
  monitors: Opt[];
  platforms: Opt[];
  statuses: Opt[];
  ranges: Opt[];
  dialects: Opt[];
  intents: Opt[];
  labels: {
    search: string; allMonitors: string; allPlatforms: string; allSentiment: string; onlyRisks: string; export: string; all: string;
    allDialects: string; allIntents: string; onlySarcasm: string;
  };
  quick: Record<string, string>;
  topicLabel?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const detailCount = DETAIL_PARAMS.filter((k) => sp.get(k)).length;
  const [open, setOpen] = useState(detailCount > 0);

  const push = (next: URLSearchParams) => {
    next.delete("page");
    router.push(`/mentions?${next}`);
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };
  const quickHref = (param?: [string, string]) => {
    const next = new URLSearchParams(sp.toString());
    QUICK_PARAMS.forEach((k) => next.delete(k));
    next.delete("page");
    if (param) next.set(param[0], param[1]);
    const qs = next.toString();
    return qs ? `/mentions?${qs}` : "/mentions";
  };
  const activeQuick = QUICK.find((x) => x.param && sp.get(x.param[0]) === x.param[1])?.key ?? (QUICK_PARAMS.some((k) => sp.get(k)) ? null : "all");

  useEffect(() => {
    const id = setTimeout(() => (q !== (sp.get("q") ?? "") ? set("q", q) : null), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select = (key: string, opts: Opt[], placeholder: string) => (
    <select className={cn("input h-9 w-auto min-w-36 py-0", sp.get(key) && "border-ink")} value={sp.get(key) ?? ""} onChange={(e) => set(key, e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className="input h-9 ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} dir="auto" type="search" />
        </div>
        <select className="input h-9 w-auto py-0" value={sp.get("days") ?? "30"} onChange={(e) => set("days", e.target.value)} aria-label="period">
          {ranges.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button type="button" onClick={() => setOpen((v) => !v)} className={cn("btn-secondary", (open || detailCount > 0) && "border-ink")} aria-expanded={open}>
          <SlidersHorizontal className="h-4 w-4" /> {quick.more}
          {detailCount > 0 && <span className="rounded bg-ink px-1.5 text-[11px] text-white tnum">{detailCount}</span>}
        </button>
        <a href={`/api/export?${sp.toString()}`} className="btn-ghost" title={labels.export}>
          <Download className="h-4 w-4" /> <span className="hidden sm:inline">{labels.export}</span>
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist">
        {QUICK.map((x) => (
          <Link
            key={x.key}
            href={quickHref(x.param)}
            prefetch={false}
            scroll={false}
            role="tab"
            aria-selected={activeQuick === x.key}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3.5 text-[13px] transition-colors",
              activeQuick === x.key ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-muted hover:border-ink hover:text-ink",
            )}
          >
            {quick[x.key]}
          </Link>
        ))}
        {topicLabel && (
          <button type="button" onClick={() => set("topic", "")} className="flex h-8 items-center gap-1 rounded-full bg-brand-50 px-3 text-[13px] text-brand-700">
            #{topicLabel} <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="animate-rise card flex flex-wrap items-center gap-2 p-3">
          {select("monitor", monitors, labels.allMonitors)}
          {select("platform", platforms, labels.allPlatforms)}
          {select("dialect", dialects, labels.allDialects)}
          {select("intent", intents, labels.allIntents)}
          {select("status", statuses, labels.all)}
          {detailCount > 0 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const next = new URLSearchParams(sp.toString());
                DETAIL_PARAMS.forEach((k) => next.delete(k));
                push(next);
              }}
            >
              <X className="h-4 w-4" /> {quick.clear}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
