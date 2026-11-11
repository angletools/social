"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

/** Filters inside "More filters". Quick views and the top selects are not counted. */
const DETAIL_PARAMS = ["monitor", "dialect", "intent", "status", "sarcasm", "topic"] as const;

export type QuickTab = { key: string; label: string; count: string };

export type BrowserLabels = {
  quickLabel: string;
  search: string;
  searchLabel: string;
  platform: string;
  allPlatforms: string;
  sentiment: string;
  anySentiment: string;
  period: string;
  more: string;
  monitor: string;
  dialect: string;
  intent: string;
  status: string;
  topic: string;
  any: string;
  all: string;
  only: string;
  sarcastic: string;
  sarcasticOnly: string;
  clear: string;
  clearAll: string;
  removeFilter: string;
  sort: string;
};

/** A native select drawn as a chip: the visible text sits under an invisible, full-size <select>. */
function SelectChip({
  label,
  prefix,
  value,
  placeholder,
  options,
  onChange,
  size = "md",
  className,
}: {
  label: string;
  prefix?: string;
  value: string;
  placeholder?: string;
  options: Opt[];
  onChange: (v: string) => void;
  size?: "md" | "sm" | "bare";
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const on = Boolean(value) && size !== "bare";
  return (
    <label
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-[14px] text-ink transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500",
        size === "md" && "h-10 rounded-[12px] border bg-surface ps-3.5 pe-3",
        size === "sm" && "h-9 gap-1.5 rounded-[10px] border ps-3 pe-2.5",
        size === "bare" && "h-[30px] gap-1.5 ps-2 pe-0.5 text-muted hover:text-ink",
        size !== "bare" && (on ? "border-ink font-semibold" : "border-line hover:border-line-strong"),
        className,
      )}
    >
      {prefix && <span className="font-normal text-faint">{prefix}</span>}
      <span>{current?.label ?? placeholder}</span>
      <ChevronDown className="h-[15px] w-[15px] shrink-0 text-faint" strokeWidth={1.8} aria-hidden />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 text-[16px]"
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MentionsBrowser({
  tabs,
  activeTab,
  total,
  noun,
  monitors,
  platforms,
  sentiments,
  periods,
  dialects,
  intents,
  statuses,
  sorts,
  topicLabel,
  labels,
  children,
}: {
  tabs: QuickTab[];
  activeTab: string;
  total: string;
  noun: string;
  monitors: Opt[];
  platforms: Opt[];
  sentiments: Opt[];
  periods: Opt[];
  dialects: Opt[];
  intents: Opt[];
  statuses: Opt[];
  sorts: Opt[];
  topicLabel?: string;
  labels: BrowserLabels;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const detailCount = DETAIL_PARAMS.filter((k) => sp.get(k)).length;

  const go = (next: URLSearchParams) => {
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `/mentions?${qs}` : "/mentions", { scroll: false }));
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    go(next);
  };
  const clearDetails = () => {
    const next = new URLSearchParams(sp.toString());
    DETAIL_PARAMS.forEach((k) => next.delete(k));
    go(next);
  };
  const tabHref = (key: string) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("page");
    if (key === "all") next.delete("view");
    else next.set("view", key);
    const qs = next.toString();
    return qs ? `/mentions?${qs}` : "/mentions";
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    const id = setTimeout(() => (q.trim() !== (sp.get("q") ?? "") ? set("q", q.trim()) : null), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const valueOf = (opts: Opt[], key: string) => opts.find((o) => o.value === sp.get(key))?.label ?? sp.get(key) ?? "";
  const chips: { key: string; name: string; value: string }[] = [];
  if (sp.get("monitor")) chips.push({ key: "monitor", name: labels.monitor, value: valueOf(monitors, "monitor") });
  if (sp.get("dialect")) chips.push({ key: "dialect", name: labels.dialect, value: valueOf(dialects, "dialect") });
  if (sp.get("intent")) chips.push({ key: "intent", name: labels.intent, value: valueOf(intents, "intent") });
  if (sp.get("status")) chips.push({ key: "status", name: labels.status, value: valueOf(statuses, "status") });
  if (sp.get("topic")) chips.push({ key: "topic", name: labels.topic, value: `#${topicLabel ?? sp.get("topic")}` });
  if (sp.get("sarcasm") === "1") chips.push({ key: "sarcasm", name: labels.only, value: labels.sarcastic });

  const sarcasm = sp.get("sarcasm") === "1";
  const scroller = "flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-md:-mx-4 max-md:px-4";

  return (
    <>
      <div role="tablist" aria-label={labels.quickLabel} className={cn(scroller, "mt-5 gap-6 border-b border-line max-md:gap-5")}>
        {tabs.map((x) => {
          const on = x.key === activeTab;
          return (
            <Link
              key={x.key}
              href={tabHref(x.key)}
              prefetch={false}
              scroll={false}
              role="tab"
              aria-selected={on}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                start(() => router.push(tabHref(x.key), { scroll: false }));
              }}
              className={cn(
                "-mb-px inline-flex h-11 shrink-0 items-center gap-[7px] border-b-2 text-[14px] whitespace-nowrap transition-colors",
                on ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {x.label}
              <span className="text-[12.5px] font-medium text-faint tnum">{x.count}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex h-10 w-full min-w-0 cursor-text items-center gap-2.5 rounded-[12px] border border-line bg-surface px-3.5 transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100 md:w-auto md:flex-1">
          <Search className="h-4 w-4 shrink-0 text-faint" strokeWidth={1.7} aria-hidden />
          <span className="sr-only">{labels.searchLabel}</span>
          <input
            type="search"
            dir="auto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.search}
            style={{ outline: "none" }}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint md:text-[14.5px]"
          />
        </label>
        <div className={cn(scroller, "max-md:w-[calc(100%+2rem)]")}>
          <SelectChip label={labels.platform} value={sp.get("platform") ?? ""} placeholder={labels.allPlatforms} options={platforms} onChange={(v) => set("platform", v)} />
          <SelectChip label={labels.sentiment} value={sp.get("sentiment") ?? ""} placeholder={labels.anySentiment} options={sentiments} onChange={(v) => set("sentiment", v)} />
          <SelectChip label={labels.period} value={sp.get("days") ?? "30"} options={periods} onChange={(v) => set("days", v === "30" ? "" : v)} className={cn(sp.get("days") ? "" : "border-line font-normal")} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="more-filters"
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border ps-3.5 pe-3 text-[14px] font-medium transition-[border-color,transform] duration-150 ease-(--ease-out) active:scale-[0.97]",
              open ? "border-ink" : "border-line hover:border-line-strong",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.6} aria-hidden />
            {labels.more}
            {detailCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-ink px-1.5 text-[12px] font-semibold text-on-ink tnum">{detailCount}</span>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div id="more-filters" className="animate-rise mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2.5">
          <SelectChip size="sm" label={labels.monitor} prefix={labels.monitor} value={sp.get("monitor") ?? ""} placeholder={labels.all} options={monitors} onChange={(v) => set("monitor", v)} />
          <SelectChip size="sm" label={labels.dialect} prefix={labels.dialect} value={sp.get("dialect") ?? ""} placeholder={labels.any} options={dialects} onChange={(v) => set("dialect", v)} />
          <SelectChip size="sm" label={labels.intent} prefix={labels.intent} value={sp.get("intent") ?? ""} placeholder={labels.any} options={intents} onChange={(v) => set("intent", v)} />
          <SelectChip size="sm" label={labels.status} prefix={labels.status} value={sp.get("status") ?? ""} placeholder={labels.all} options={statuses} onChange={(v) => set("status", v)} />
          <button
            type="button"
            role="switch"
            aria-checked={sarcasm}
            onClick={() => set("sarcasm", sarcasm ? "" : "1")}
            className="inline-flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[14px] text-ink hover:bg-sunken"
          >
            <span className={cn("relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-150", sarcasm ? "bg-ink" : "bg-line-strong")}>
              <span
                className={cn(
                  "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[inset-inline-start] duration-150 ease-(--ease-out)",
                  sarcasm ? "start-3.5 bg-on-ink" : "start-0.5 bg-surface",
                )}
              />
            </span>
            {labels.sarcasticOnly}
          </button>
          {detailCount > 0 && (
            <button type="button" onClick={clearDetails} className="ms-auto inline-flex h-9 items-center rounded-[10px] px-3 text-[14px] text-muted hover:bg-sunken hover:text-ink">
              {labels.clear}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 flex min-h-[30px] flex-wrap items-center gap-2">
        <span className="me-1.5 whitespace-nowrap text-[14px] text-muted" aria-live="polite">
          <span className="font-semibold text-ink tnum">{total}</span> {noun}
        </span>
        {chips.map((c) => (
          <span key={c.key} className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-sunken ps-[11px] pe-1 text-[13px]">
            <span className="text-muted">{c.name}</span>
            <span dir="auto" className="max-w-40 truncate font-semibold">{c.value}</span>
            <button
              type="button"
              onClick={() => set(c.key, "")}
              aria-label={labels.removeFilter.replace("{name}", c.name)}
              className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-muted hover:bg-line hover:text-ink max-md:h-8 max-md:w-8"
            >
              <X className="h-[13px] w-[13px]" strokeWidth={2} />
            </button>
          </span>
        ))}
        {chips.length > 0 && (
          <button
            type="button"
            onClick={clearDetails}
            className="h-[30px] px-2 text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-current"
          >
            {labels.clearAll}
          </button>
        )}
        <SelectChip size="bare" className="ms-auto" label={labels.sort} value={sp.get("sort") ?? "new"} options={sorts} onChange={(v) => set("sort", v === "new" ? "" : v)} />
      </div>

      <div className={cn("transition-opacity duration-150", pending && "opacity-60")} aria-busy={pending}>
        {children}
      </div>
    </>
  );
}
