"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logout } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { SECONDARY } from "./nav-links";

export function UserMenu({
  name,
  email,
  role,
  theme,
  labels,
  placement = "below",
  extra = null,
  collapsed = false,
}: {
  name: string;
  email: string;
  role: string;
  theme: Theme;
  labels: { profile: string; settings: string; logout: string; theme: Record<Theme, string> & { title: string } };
  /** "rail": opens beside the rail, anchored to the bottom. "below": drops down from the top bar. */
  placement?: "rail" | "below";
  /** Labels for the secondary pages; when given they are listed (phones, where there is no rail). */
  extra?: Record<string, string> | null;
  /** In the sidebar: show only the avatar when folded. */
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      {placement === "rail" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={name}
          aria-expanded={open}
          className={cn("flex w-full items-center gap-3 rounded-xl py-2 text-start hover:bg-[#111]", collapsed ? "justify-center px-0" : "px-2.5")}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] text-[13px] font-semibold text-[#e6e6e6]">{[...name][0]?.toUpperCase()}</span>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[14.5px] text-[#e6e6e6]">{name}</span>
              <span className="block truncate text-[12.5px] text-[#7f7f7f]">{role}</span>
            </span>
          )}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center rounded-full" aria-label={name} aria-expanded={open}>
          <Avatar name={name} seed={email} size={34} />
        </button>
      )}
      {open && (
        <div
          className={cn(
            "animate-rise absolute z-50 w-64 overflow-hidden rounded-2xl bg-surface text-ink shadow-[var(--shadow-pop)]",
            placement === "rail" ? (collapsed ? "start-full bottom-0 ms-4" : "start-0 bottom-full mb-2") : "end-0 top-11",
          )}
        >
          <div className="border-b border-line px-4 py-3">
            <div className="truncate text-[13.5px] font-medium">{name}</div>
            <div className="truncate text-xs text-muted ltr-nums">{email}</div>
            <div className="mt-1 text-xs text-faint">{role}</div>
          </div>
          <div className="border-b border-line p-1">
            <ThemeToggle initial={theme} labels={labels.theme} />
          </div>
          {extra && (
            <div className="border-b border-line p-1">
              {SECONDARY.map((x) => (
                <Link key={x.href} href={x.href} onClick={() => setOpen(false)} className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] hover:bg-sunken">
                  <x.icon className="h-4 w-4 text-faint" strokeWidth={1.6} /> {extra[x.key]}
                </Link>
              ))}
            </div>
          )}
          <div className="p-1">
            <Link href="/settings#profile" onClick={() => setOpen(false)} className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] hover:bg-sunken">
              <UserRound className="h-4 w-4 text-faint" /> {labels.profile}
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)} className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] hover:bg-sunken">
              <Settings className="h-4 w-4 text-faint" /> {labels.settings}
            </Link>
            <form action={logout}>
              <button className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] text-neg hover:bg-neg/5">
                <LogOut className="h-4 w-4 rtl:rotate-180" /> {labels.logout}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
