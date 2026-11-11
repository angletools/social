"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Clapperboard, FileText, Inbox, Languages, LayoutGrid, MessagesSquare, Radar, Settings, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; key: string; icon: React.ElementType };

export const NAV_GROUPS: { group?: string; items: Item[] }[] = [
  { items: [{ href: "/", key: "overview", icon: LayoutGrid }] },
  {
    group: "listen",
    items: [
      { href: "/mentions", key: "mentions", icon: MessagesSquare },
      { href: "/dialect", key: "dialect", icon: Languages },
      { href: "/monitors", key: "monitors", icon: Radar },
    ],
  },
  {
    group: "engage",
    items: [
      { href: "/inbox", key: "inbox", icon: Inbox },
      { href: "/alerts", key: "alerts", icon: Bell },
    ],
  },
  { group: "create", items: [{ href: "/studio", key: "studio", icon: Clapperboard }] },
  {
    group: "understand",
    items: [
      { href: "/assistant", key: "assistant", icon: MessageCircleQuestion },
      { href: "/reports", key: "reports", icon: FileText },
    ],
  },
];

export const SETTINGS_ITEM: Item = { href: "/settings", key: "settings", icon: Settings };

function NavItem({ item, label, badge, onNavigate }: { item: Item; label: string; badge?: number; onNavigate?: () => void }) {
  const path = usePathname();
  const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
        active ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-muted hover:bg-sunken hover:text-ink",
      )}
    >
      {active && <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-brand-600" />}
      <Icon className={cn("h-[17px] w-[17px] shrink-0", active ? "text-brand-700" : "text-faint group-hover:text-muted")} strokeWidth={1.8} />
      <span className="flex-1 truncate">{label}</span>
      {badge ? (
        <span dir="ltr" className="rounded-md bg-ink/[0.06] px-1.5 text-[11px] font-semibold text-ink tnum">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function NavLinks({
  labels,
  groups,
  badges = {},
  onNavigate,
}: {
  labels: Record<string, string>;
  groups: Record<string, string>;
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((g, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {g.group && <div className="eyebrow mb-1 px-2.5">{groups[g.group]}</div>}
          {g.items.map((item) => (
            <NavItem key={item.href} item={item} label={labels[item.key]} badge={badges[item.key]} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function SettingsLink({ label, onNavigate }: { label: string; onNavigate?: () => void }) {
  return <NavItem item={SETTINGS_ITEM} label={label} onNavigate={onNavigate} />;
}
