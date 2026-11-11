"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markNotificationsRead } from "@/app/actions";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  unread: boolean;
  when: string;
};

export function Notifications({ items, labels }: { items: NotificationItem[]; labels: { title: string; empty: string; markAll: string } }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => i.unread).length;

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[11px] text-[#bdbdbd] transition-[background-color,color,transform] duration-150 ease-(--ease-out) hover:bg-[#161616] hover:text-white active:scale-[0.96]" aria-label={labels.title} aria-expanded={open}>
        <Bell className="h-[19px] w-[19px]" strokeWidth={1.5} />
        {unread > 0 && <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-chart ring-2 ring-black" />}
      </button>
      {open && (
        <div className="animate-pop absolute end-0 top-11 z-40 ltr:origin-top-right rtl:origin-top-left w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-surface text-ink shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[13.5px] font-semibold">{labels.title}</span>
            {unread > 0 && (
              <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => start(() => markNotificationsRead())}>
                {labels.markAll}
              </button>
            )}
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-muted">{labels.empty}</p>}
            {items.map((n) => (
              <Link
                key={n.id} prefetch={false} href={n.link ?? "/alerts"}
                onClick={() => setOpen(false)}
                className="flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-canvas"
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    !n.unread ? "bg-line-strong" : n.severity === "CRITICAL" ? "bg-neg" : n.severity === "WARNING" ? "bg-warn" : "bg-brand-600",
                  )}
                />
                <div className="min-w-0">
                  <p className={cn("text-[13px] leading-snug", n.unread ? "font-medium" : "text-muted")}>{n.title}</p>
                  <p dir="auto" className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                  <p className="mt-1 text-[11px] text-faint">{n.when}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
