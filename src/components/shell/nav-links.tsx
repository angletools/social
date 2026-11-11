"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChartSpline,
  FileText,
  House,
  Inbox,
  MessageCircleQuestion,
  MessagesSquare,
  Moon,
  Radar,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { applyTheme, isDarkNow } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Item = { href: string; key: string; icon: React.ElementType; shortcut?: string };

/** Primary destinations: on the rail with ⌘/Ctrl+1…5 and in the phone tab bar. */
export const PRIMARY: Item[] = [
  { href: "/", key: "overview", icon: House, shortcut: "1" },
  { href: "/inbox", key: "inbox", icon: Inbox, shortcut: "2" },
  { href: "/mentions", key: "mentions", icon: MessagesSquare, shortcut: "3" },
  { href: "/intelligence", key: "intelligence", icon: ChartSpline, shortcut: "4" },
  { href: "/studio", key: "studio", icon: Sparkles, shortcut: "5" },
];

/** Secondary tools: a quieter group lower on the rail; on phones they live in the account menu. */
export const SECONDARY: Item[] = [
  { href: "/monitors", key: "monitors", icon: Radar },
  { href: "/alerts", key: "alerts", icon: Bell },
  { href: "/reports", key: "reports", icon: FileText },
  { href: "/assistant", key: "assistant", icon: MessageCircleQuestion },
];

export const SETTINGS_ITEM: Item = { href: "/settings", key: "settings", icon: Settings, shortcut: "," };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

function useMac() {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

/** ⌘/Ctrl+1…5 jump between the primary pages, ⌘/Ctrl+, opens settings. Alt+digit works too, for browsers that keep ⌘/Ctrl+digit for tabs. */
function useShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey || e.altKey) || e.shiftKey) return;
      const all = [...PRIMARY, SETTINGS_ITEM];
      const key = e.code.startsWith("Digit") ? e.code.slice(5) : e.key;
      const hit = all.find((i) => i.shortcut === key);
      if (!hit || (e.altKey && key === ",")) return;
      e.preventDefault();
      router.push(hit.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

export function Tip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute start-full top-1/2 z-50 ms-3 hidden h-[30px] -translate-y-1/2 items-center gap-2.5 whitespace-nowrap rounded-full bg-tip px-3 text-[13px] font-medium text-white shadow-[0_8px_20px_rgb(0_0_0/0.25)] group-hover:flex group-focus-visible:flex"
    >
      {label}
      {shortcut && <span dir="ltr" className="text-white/45">{shortcut}</span>}
    </span>
  );
}

function RailLink({ item, label, badge, kbd }: { item: Item; label: string; badge?: number; kbd?: string }) {
  const path = usePathname();
  const active = isActive(path, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-11 w-11 items-center justify-center rounded-xl text-white outline-offset-0 transition-colors",
        active ? "bg-white/[0.16]" : "hover:bg-white/[0.08]",
      )}
    >
      <Icon className={cn("h-5 w-5 transition-opacity", active ? "opacity-100" : "opacity-70 group-hover:opacity-100")} strokeWidth={1.5} />
      {badge ? (
        <span
          dir="ltr"
          className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neg px-1 text-[10px] font-semibold leading-none text-white tnum"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <Tip label={label} shortcut={kbd} />
    </Link>
  );
}

export function ThemeButton({ labels, className, tip = true }: { labels: { light: string; dark: string }; className?: string; tip?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(isDarkNow());
    const on = () => setDark(isDarkNow());
    window.addEventListener("rasd-theme", on);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", on);
    return () => {
      window.removeEventListener("rasd-theme", on);
      mq.removeEventListener("change", on);
    };
  }, []);
  const label = dark ? labels.light : labels.dark;
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        applyTheme(dark ? "light" : "dark");
        setDark(!dark);
      }}
      className={cn("group relative flex h-11 w-11 items-center justify-center rounded-xl", className)}
    >
      <Icon className="h-5 w-5 opacity-80 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
      {tip && <Tip label={label} />}
    </button>
  );
}

/** Desktop: the slim icon rail. Sits at the inline start, so it is on the right in Arabic. */
export function Rail({
  labels,
  badges = {},
  themeLabels,
  account,
}: {
  labels: Record<string, string>;
  badges?: Record<string, number>;
  themeLabels: { light: string; dark: string };
  account: React.ReactNode;
}) {
  useShortcuts();
  const mac = useMac();
  const kbd = (s?: string) => (s ? (mac ? `⌘${s}` : `Ctrl ${s}`) : undefined);
  return (
    <aside className="no-print sticky top-0 z-40 hidden h-screen w-[76px] shrink-0 flex-col items-center bg-rail py-5 md:flex">
      <Link href="/" aria-label={labels.overview} className="mb-5 flex h-11 w-11 items-center justify-center">
        <Logo />
      </Link>
      <nav aria-label="Main" className="flex flex-col items-center gap-1.5">
        {PRIMARY.map((i) => (
          <RailLink key={i.href} item={i} label={labels[i.key]} badge={badges[i.key]} kbd={kbd(i.shortcut)} />
        ))}
        <span className="my-2 h-px w-6 bg-white/15" aria-hidden />
        {SECONDARY.map((i) => (
          <RailLink key={i.href} item={i} label={labels[i.key]} badge={badges[i.key]} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <RailLink item={SETTINGS_ITEM} label={labels.settings} kbd={kbd(SETTINGS_ITEM.shortcut)} />
        <ThemeButton labels={themeLabels} className="text-white hover:bg-white/[0.08]" />
        <div className="mt-2">{account}</div>
      </div>
    </aside>
  );
}

/** Phones: a bottom tab bar with the five primary pages. */
export function TabBar({ labels, badges = {} }: { labels: Record<string, string>; badges?: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-surface/95 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
    >
      {PRIMARY.map((i) => {
        const active = isActive(path, i.href);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex w-16 flex-col items-center gap-1 text-[11px]", active ? "font-semibold text-ink" : "font-medium text-faint")}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={1.5} />
            <span className="truncate">{labels[i.key]}</span>
            {badges[i.key] ? <span className="absolute end-3.5 top-0 h-2 w-2 rounded-full bg-neg" aria-hidden /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="text-white">
      <circle cx="16" cy="18" r="3.2" fill="currentColor" />
      <path d="M9 18a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" />
      <path d="M4.5 18a11.5 11.5 0 0 1 23 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".4" />
    </svg>
  );
}
