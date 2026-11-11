"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Section } from "./styles";

/** Old links used #anchors on one long page; send them to the matching section. */
const LEGACY: Record<string, Section> = { profile: "general", organization: "general", team: "team", weekly: "weekly", connections: "integrations", activity: "system" };

export function SettingsNav({
  current,
  items,
  label,
}: {
  current: Section;
  items: { key: Section; label: string; dot?: "warn" | "pos"; dotLabel?: string; rule?: boolean }[];
  label: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const target = LEGACY[window.location.hash.slice(1)];
    if (target) router.replace(`/settings?section=${target}`, { scroll: false });
  }, [router]);
  // On phones the menu is a scrolling strip: keep the current section in view.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    const navBox = nav.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    nav.scrollLeft += box.left - navBox.left - (navBox.width - box.width) / 2;
  }, [current]);

  return (
    <nav
      ref={ref}
      aria-label={label}
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-[84px] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {items.map((s) => (
        <span key={s.key} className="contents">
          {s.rule && <span aria-hidden className="mx-3 my-2.5 hidden h-px bg-line lg:block" />}
          <Link
            href={`/settings?section=${s.key}`}
            scroll={false}
            prefetch={false}
            aria-current={current === s.key ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] px-3 text-[14.5px] whitespace-nowrap transition-colors duration-150",
              current === s.key ? "bg-surface font-semibold text-ink" : "text-muted hover:bg-surface/60 hover:text-ink",
            )}
          >
            <span className="flex-1 text-start">{s.label}</span>
            {s.dot && (
              <span
                role="img"
                aria-label={s.dotLabel}
                title={s.dotLabel}
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot === "warn" ? "bg-warn" : "bg-pos")}
              />
            )}
          </Link>
        </span>
      ))}
    </nav>
  );
}
