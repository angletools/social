"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Clapperboard, FileText, Inbox, Languages, LayoutDashboard, MessagesSquare, Radar, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", key: "overview", icon: LayoutDashboard },
  { href: "/inbox", key: "inbox", icon: Inbox },
  { href: "/monitors", key: "monitors", icon: Radar },
  { href: "/mentions", key: "mentions", icon: MessagesSquare },
  { href: "/dialect", key: "dialect", icon: Languages },
  { href: "/studio", key: "studio", icon: Clapperboard },
  { href: "/assistant", key: "assistant", icon: Sparkles },
  { href: "/alerts", key: "alerts", icon: Bell },
  { href: "/reports", key: "reports", icon: FileText },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

export function NavLinks({ labels, badges = {}, onNavigate }: { labels: Record<string, string>; badges?: Record<string, number>; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map(({ href, key, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              active ? "bg-brand-600 font-medium text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-ink",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="flex-1">{labels[key]}</span>
            {badges[key] ? (
              <span dir="ltr" className={cn("rounded-full px-1.5 text-xs font-semibold", active ? "bg-white/20" : "bg-red-500 text-white")}>{badges[key] > 99 ? "99+" : badges[key]}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
