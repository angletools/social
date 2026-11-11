"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logout } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import type { Theme } from "@/lib/theme";
import { ThemeToggle } from "./theme-toggle";

export function UserMenu({
  name,
  email,
  role,
  theme,
  labels,
}: {
  name: string;
  email: string;
  role: string;
  theme: Theme;
  labels: { profile: string; settings: string; logout: string; theme: Record<Theme, string> & { title: string } };
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
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center rounded-full" aria-label={name} aria-expanded={open}>
        <Avatar name={name} seed={email} size={32} />
      </button>
      {open && (
        <div className="animate-rise absolute end-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="border-b border-line px-4 py-3">
            <div className="truncate text-[13.5px] font-medium">{name}</div>
            <div className="truncate text-xs text-muted ltr-nums">{email}</div>
            <div className="mt-1 text-xs text-faint">{role}</div>
          </div>
          <div className="border-b border-line p-1">
            <ThemeToggle initial={theme} labels={labels.theme} />
          </div>
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
