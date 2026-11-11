"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type QueueItem = { id: string; name: string; when: string; text: string; tone: "neg" | "warn" | "info" | "pos" | "faint"; assignee: string | null };

const DOT: Record<QueueItem["tone"], string> = { neg: "bg-neg", warn: "bg-warn", info: "bg-info", pos: "bg-pos", faint: "bg-faint" };

/** The conversation list. J/K (or ↓/↑) moves through it without touching the mouse. */
export function Queue({
  items,
  selectedId,
  base,
  tabs,
  title,
  waiting,
  empty,
  hiddenOnPhone,
}: {
  items: QueueItem[];
  selectedId: string | null;
  base: string;
  tabs: { label: string; href: string; active: boolean }[];
  title: string;
  waiting: string;
  empty: string;
  hiddenOnPhone: boolean;
}) {
  const router = useRouter();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT" || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const step = e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
      if (!step || items.length === 0) return;
      e.preventDefault();
      const i = Math.max(0, items.findIndex((x) => x.id === selectedId));
      const next = items[Math.min(items.length - 1, Math.max(0, i + step))];
      router.push(`${base}m=${next.id}`, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedId, base, router]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <section
      aria-label={title}
      className={cn("min-h-0 w-full shrink-0 flex-col bg-panel md:flex md:w-[360px] md:border-e md:border-line", hiddenOnPhone ? "hidden" : "flex")}
    >
      <div className="flex items-baseline justify-between px-6 pt-7 pb-4">
        <h1 className="text-[24px] font-semibold">{title}</h1>
        <span className="text-sm text-muted">{waiting}</span>
      </div>
      <div role="tablist" className="flex gap-5 border-b border-line px-6">
        {tabs.map((t) => (
          <Link
            key={t.href}
            role="tab"
            aria-selected={t.active}
            prefetch={false}
            href={t.href}
            className={cn("-mb-px border-b-2 py-3 text-sm", t.active ? "border-ink font-semibold text-ink" : "border-transparent text-faint hover:text-ink")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <CheckCircle2 className="h-8 w-8 text-pos" strokeWidth={1.5} />
          <p className="text-sm text-muted">{empty}</p>
        </div>
      ) : (
        <ul ref={listRef} className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {items.map((m) => {
            const active = m.id === selectedId;
            return (
              <li key={m.id}>
                <Link
                  prefetch={false}
                  scroll={false}
                  href={`${base}m=${m.id}`}
                  aria-current={active ? "true" : undefined}
                  className={cn("flex gap-3 rounded-xl px-3 py-3.5 transition-colors", active ? "bg-sunken" : "hover:bg-sunken/60")}
                >
                  <span className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", DOT[m.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14.5px] font-medium">{m.name}</span>
                      <span className="shrink-0 text-xs text-faint">{m.when}</span>
                    </span>
                    <span dir="auto" className="mt-0.5 block truncate text-[13.5px] leading-relaxed text-muted">
                      {m.text}
                    </span>
                  </span>
                  {m.assignee && (
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunken text-[10px] font-semibold text-muted" title={m.assignee}>
                      {m.assignee.slice(0, 1)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
