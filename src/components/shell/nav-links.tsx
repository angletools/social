"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChartSpline,
  ChevronDown,
  FileText,
  Hash,
  House,
  Inbox,
  MessageCircleQuestion,
  MessagesSquare,
  Moon,
  PanelLeft,
  PanelRight,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { SIDEBAR_COOKIE, applyTheme, isDarkNow } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";


type Item = { href: string; key: string; icon: React.ElementType; shortcut?: string };

/** Sidebar destinations, in order. The first five are also the phone tab bar. */
export const NAV: Item[] = [
  { href: "/", key: "overview", icon: House, shortcut: "1" },
  { href: "/inbox", key: "inbox", icon: Inbox, shortcut: "2" },
  { href: "/mentions", key: "mentions", icon: MessagesSquare, shortcut: "3" },
  { href: "/intelligence", key: "intelligence", icon: ChartSpline, shortcut: "4" },
  { href: "/studio", key: "studio", icon: Sparkles, shortcut: "5" },
  { href: "/assistant", key: "assistant", icon: MessageCircleQuestion, shortcut: "J" },
  { href: "/reports", key: "reports", icon: FileText },
  { href: "/alerts", key: "alerts", icon: Bell },
];
export const PRIMARY = NAV.slice(0, 5);
/** On phones these live in the account menu. */
export const SECONDARY: Item[] = [{ href: "/monitors", key: "monitors", icon: Target }, ...NAV.slice(5)];
export const SETTINGS_ITEM: Item = { href: "/settings", key: "settings", icon: SlidersHorizontal, shortcut: "," };

export type SidebarMonitor = { id: string; name: string; type: "KEYWORD" | "HASHTAG" | "PROFILE" | "TOPIC"; competitor: boolean; live: boolean };

const MONITOR_ICON: Record<SidebarMonitor["type"], React.ElementType> = { KEYWORD: Target, HASHTAG: Hash, PROFILE: UserRound, TOPIC: MessagesSquare };
const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function useMac() {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

/**
 * ⌘/Ctrl + 1…5 jump between the main pages, ⌘/Ctrl + J opens Ask, ⌘/Ctrl + , settings,
 * ⌘/Ctrl + \ folds the sidebar. Alt + digit also works, for browsers that keep ⌘/Ctrl + digit for tabs.
 */
function useShortcuts(onToggle: () => void) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey || e.altKey) || e.shiftKey) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "\\" || e.code === "Backslash")) {
        e.preventDefault();
        return onToggle();
      }
      const key = e.code.startsWith("Digit") ? e.code.slice(5) : e.code === "KeyJ" ? "J" : e.key;
      if (e.altKey && !/^[1-5]$/.test(key)) return;
      const hit = [...NAV, SETTINGS_ITEM].find((i) => i.shortcut === key);
      if (!hit) return;
      e.preventDefault();
      router.push(hit.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, onToggle]);
}

export function Tip({ label, shortcut, show = true }: { label: string; shortcut?: string; show?: boolean }) {
  if (!show) return null;
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute start-full top-1/2 z-50 ms-3 hidden h-[30px] -translate-y-1/2 items-center gap-2.5 whitespace-nowrap rounded-full bg-tip px-3 text-[13px] font-medium text-white shadow-[0_8px_20px_rgb(0_0_0/0.35)] group-hover:flex group-focus-visible:flex"
    >
      {label}
      {shortcut && <span dir="ltr" className="text-white/45">{shortcut}</span>}
    </span>
  );
}

const row = (collapsed: boolean, active = false) =>
  cn(
    "group relative flex h-[46px] items-center gap-3.5 rounded-xl text-[16px] outline-offset-0 select-none",
    collapsed ? "justify-center px-0" : "px-3.5",
    active ? "bg-[#1c1c1c] text-white" : "text-[#d6d6d6] hover:bg-[#111] hover:text-white",
  );

function NavRow({ item, label, count, collapsed, kbd }: { item: Item; label: string; count?: number; collapsed: boolean; kbd?: string }) {
  const path = usePathname();
  const active = isActive(path, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-label={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={row(collapsed, active)}>
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && count ? (
        <span dir="ltr" className="flex w-5 shrink-0 justify-center text-[14px] leading-none whitespace-nowrap text-[#8f8f8f] tnum">
          {count > 999 ? "999+" : count}
        </span>
      ) : null}
      {collapsed && count ? <span className="absolute end-[9px] top-[9px] h-[7px] w-[7px] rounded-full bg-chart" aria-hidden /> : null}
      <Tip label={label} shortcut={kbd} show={collapsed} />
    </Link>
  );
}

export function ThemeButton({ labels, collapsed, className }: { labels: { light: string; dark: string }; collapsed?: boolean; className?: string }) {
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
      aria-label={collapsed ? label : undefined}
      onClick={() => {
        applyTheme(dark ? "light" : "dark");
        setDark(!dark);
      }}
      className={cn(row(Boolean(collapsed)), "w-full text-start", className)}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      <Tip label={label} shortcut="⇧⌘L" show={Boolean(collapsed)} />
    </button>
  );
}

const WS_COLORS = ["#5b5bd6", "#e8590c", "#1c7ed6", "#0b8a8a", "#9c0fe8", "#3b7a12"];

/** Desktop: the black sidebar, 264px open or 84px folded. Sits at the inline start (right in Arabic). */
export function Sidebar({
  labels,
  themeLabels,
  badges = {},
  monitors,
  org,
  initialCollapsed,
  account,
  dir,
}: {
  labels: Record<string, string>;
  themeLabels: { light: string; dark: string };
  badges?: Record<string, number>;
  monitors: SidebarMonitor[];
  org: string;
  initialCollapsed: boolean;
  account: Omit<React.ComponentProps<typeof UserMenu>, "placement" | "collapsed" | "extra">;
  dir: "rtl" | "ltr";
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      document.cookie = `${SIDEBAR_COOKIE}=${c ? "open" : "collapsed"}; path=/; max-age=${365 * 86400}; samesite=lax`;
      return !c;
    });
  }, []);
  useShortcuts(toggle);
  const mac = useMac();
  const kbd = (s?: string) => (s ? (mac ? `⌘${s}` : `Ctrl ${s}`) : undefined);
  const ws = org.replace(/\(.*?\)/g, "").trim();
  const wsColor = WS_COLORS[[...ws].reduce((a, c) => a + c.charCodeAt(0), 0) % WS_COLORS.length];
  // The panel icon points the way the sidebar will move.
  const Panel = dir === "rtl" ? PanelRight : PanelLeft;
  const toggleLabel = collapsed ? labels.expand : labels.collapse;

  return (
    <aside
      aria-label={labels.sidebar}
      className={cn(
        "no-print sticky top-0 z-40 hidden h-dvh shrink-0 flex-col gap-0.5 bg-black px-3.5 pt-3.5 pb-[18px] text-[#ececec] md:flex",
        collapsed ? "w-[84px]" : "w-[264px]",
      )}
    >
      <div className={cn("mb-3.5 flex h-12 items-center", collapsed ? "justify-center" : "justify-between ps-3.5 pe-1")}>
        {!collapsed && (
          <Link href="/" className="min-w-0 truncate text-[25px] font-semibold leading-none tracking-[-0.03em] text-white" dir="ltr">
            angle<span className="text-[20px] font-normal tracking-normal text-[#7a7a7a]"> /social</span>
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#bdbdbd] hover:bg-[#161616] hover:text-white"
        >
          <Panel className="h-5 w-5" strokeWidth={1.5} />
          <Tip label={toggleLabel} shortcut={mac ? "⌘\\" : "Ctrl \\"} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((i) => (
          <NavRow key={i.href} item={i} label={labels[i.key]} count={badges[i.key]} collapsed={collapsed} kbd={kbd(i.shortcut)} />
        ))}
      </nav>

      <Link
        href="/settings#organization"
        aria-label={ws}
        className={cn(
          "group relative mt-[22px] flex h-[50px] shrink-0 items-center gap-[11px] rounded-[13px] border bg-[#080808]",
          collapsed ? "justify-center border-transparent" : "border-[#212121] ps-2.5 pe-[13px]",
        )}
      >
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-[13px] font-semibold text-white" style={{ background: wsColor }}>
          {[...ws][0]?.toUpperCase()}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-[15.5px] font-medium text-[#f2f2f2]">{ws}</span>
            <span className="flex w-5 shrink-0 justify-center" aria-hidden>
              <ChevronDown className="h-4 w-4 text-[#9a9a9a]" strokeWidth={1.8} />
            </span>
          </>
        )}
        <Tip label={ws} show={collapsed} />
      </Link>

      {!collapsed ? (
        <>
          <div className="flex h-12 items-end justify-between px-3.5 pb-2 text-[13.5px] leading-7 text-[#8a8a8a]">
            <Link href="/monitors" className="hover:text-white">{labels.monitors}</Link>
            <Link href="/monitors/new" aria-label={labels.newMonitor} title={labels.newMonitor} className="-me-1 flex h-7 w-7 items-center justify-center rounded-[8px] text-[#9a9a9a] hover:bg-[#161616] hover:text-white">
              <Plus className="h-4 w-4" strokeWidth={1.6} />
            </Link>
          </div>
          {monitors.map((m) => {
            const Icon = m.competitor ? Users : MONITOR_ICON[m.type];
            return (
              <MonitorRow key={m.id} href={`/monitors/${m.id}`} icon={Icon} name={m.name} live={m.live} />
            );
          })}
        </>
      ) : (
        <div className="mt-2">
          <NavRow item={{ href: "/monitors", key: "monitors", icon: Target }} label={labels.monitors} collapsed />
        </div>
      )}

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        <NavRow item={SETTINGS_ITEM} label={labels.settings} collapsed={collapsed} kbd={kbd(SETTINGS_ITEM.shortcut)} />
        <ThemeButton labels={themeLabels} collapsed={collapsed} />
        <div className="mt-2.5">
          <UserMenu {...account} placement="rail" collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}

function MonitorRow({ href, icon: Icon, name, live }: { href: string; icon: React.ElementType; name: string; live: boolean }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link href={href} className={cn("flex h-10 shrink-0 items-center gap-3.5 rounded-[10px] px-3.5 text-[15px]", active ? "bg-[#1c1c1c] text-white" : "text-[#c9c9c9] hover:bg-[#111] hover:text-white")}>
      <Icon className="h-5 w-5 shrink-0 text-[#8f8f8f]" strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="flex w-5 shrink-0 justify-center" aria-hidden>
        {live && <span className="h-1.5 w-1.5 rounded-full bg-[#5cc08a]" />}
      </span>
    </Link>
  );
}

/** Black top bar: history arrows, then search and the bell at the far end. */
export function HistoryArrows({ labels, dir }: { labels: { back: string; forward: string }; dir: "rtl" | "ltr" }) {
  const back = dir === "rtl" ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6";
  const fwd = dir === "rtl" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6";
  const btn = "hidden h-9 w-9 items-center justify-center rounded-[9px] hover:bg-[#161616] md:flex";
  return (
    <>
      <button type="button" aria-label={labels.back} title={labels.back} onClick={() => history.back()} className={cn(btn, "text-[#bdbdbd]")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={back} />
        </svg>
      </button>
      <button type="button" aria-label={labels.forward} title={labels.forward} onClick={() => history.forward()} className={cn(btn, "text-[#5a5a5a] hover:text-[#bdbdbd]")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={fwd} />
        </svg>
      </button>
    </>
  );
}

/** Phones: a bottom tab bar with the five main pages. */
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
            {badges[i.key] ? <span className="absolute end-3.5 top-0 h-2 w-2 rounded-full bg-chart" aria-hidden /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

