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

export function Notifications({
  items,
  labels,
}: {
  items: NotificationItem[];
  labels: { title: string; empty: string; markAll: string };
}) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => i.unread).length;

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-secondary relative px-2.5 py-2" aria-label={labels.title}>
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-40 w-[22rem] overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">{labels.title}</span>
            {unread > 0 && (
              <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => start(() => markNotificationsRead())}>
                {labels.markAll}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">{labels.empty}</p>}
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "/alerts"}
                onClick={() => setOpen(false)}
                className={cn("block border-b border-line px-4 py-3 last:border-0 hover:bg-canvas", n.unread && "bg-brand-50/40")}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.severity === "CRITICAL" ? "bg-red-500" : n.severity === "WARNING" ? "bg-amber-500" : "bg-sky-500",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p dir="auto" className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{n.when}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
