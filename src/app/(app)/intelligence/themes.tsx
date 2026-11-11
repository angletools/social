"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DotBar } from "@/components/dots";
import { cn } from "@/lib/utils";

export type ThemeRow = {
  title: string;
  summary: string;
  color: string;
  share: number;
  delta: string | null;
  deltaTone: "neg" | "muted";
  quote: string | null;
  who: string | null;
  rec: string | null;
  href: string | null;
};

/**
 * "What customers are saying": one row per theme; opening a row shows the
 * post that sums it up and what to do about it. The first theme starts open.
 */
export function ThemeList({ themes, labels }: { themes: ThemeRow[]; labels: { suggested: string; seePosts: string } }) {
  const [open, setOpen] = useState<number>(0);
  const max = Math.max(1, ...themes.map((t) => t.share));
  return (
    <ul className="flex flex-col gap-2">
      {themes.map((th, i) => {
        const isOpen = open === i;
        const id = `theme-${i}`;
        return (
          <li key={i} className="rounded-[18px] bg-surface">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={id}
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="grid w-full grid-cols-[10px_minmax(0,1fr)_20px] items-center gap-x-4 gap-y-2 px-5 py-5 text-start sm:grid-cols-[10px_minmax(0,1fr)_140px_64px_20px] sm:gap-x-[18px] sm:px-6"
            >
              <span className="col-start-1 row-start-1 h-2.5 w-2.5 rounded-full" style={{ background: th.color }} aria-hidden />
              <span className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1">
                <span className="text-[16px] font-semibold">{th.title}</span>
                <span dir="auto" className="text-[14px] leading-relaxed text-muted">
                  {th.summary}
                </span>
              </span>
              <span className="col-start-2 row-start-2 sm:col-start-3 sm:row-start-1">
                <DotBar segments={[{ value: th.share, color: th.color }]} max={max} />
              </span>
              <span className="col-start-2 row-start-3 flex items-baseline gap-2 text-[14px] font-semibold ltr-nums sm:col-start-4 sm:row-start-1 sm:block sm:text-end">
                {th.share}%
                {th.delta && <span className={cn("block text-[12px] font-medium", th.deltaTone === "neg" ? "text-neg" : "text-muted")}>{th.delta}</span>}
              </span>
              <ChevronDown
                className={cn("col-start-3 row-start-1 h-4 w-4 text-faint transition-transform duration-200 ease-out motion-reduce:transition-none sm:col-start-5", isOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            <div
              id={id}
              className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
            >
              <div className="overflow-hidden" inert={!isOpen}>
                <div className="grid gap-5 border-t border-line px-5 pb-6 pt-5 sm:grid-cols-2 sm:gap-7 sm:pe-[52px] sm:ps-6">
                  {th.quote ? (
                    <blockquote className="text-[15px] leading-[1.8]">
                      <span dir="auto" className="block">
                        «{th.quote}»
                      </span>
                      {th.who && <span className="mt-1.5 block text-[13px] text-faint">{th.who}</span>}
                    </blockquote>
                  ) : (
                    <span />
                  )}
                  <div className="text-[15px] leading-[1.8]">
                    {th.rec ? (
                      <>
                        <span className="mb-1 block text-[13px] text-faint">{labels.suggested}</span>
                        <span dir="auto" className="block">
                          {th.rec}
                        </span>
                      </>
                    ) : null}
                    {th.href && (
                      <Link prefetch={false} href={th.href} className={cn("inline-block text-[13.5px] text-brand-600 transition-colors hover:text-ink", th.rec && "mt-2")}>
                        {labels.seePosts}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
