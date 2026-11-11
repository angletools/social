"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLinks, SettingsLink } from "./nav-links";

export function MobileNav({
  labels,
  groups,
  badges,
  brand,
}: {
  labels: Record<string, string>;
  groups: Record<string, string>;
  badges: Record<string, number>;
  brand: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button type="button" className="btn-ghost w-9 px-0" onClick={() => setOpen(true)} aria-label="menu">
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink/30" onClick={() => setOpen(false)}>
          <div className="animate-rise flex h-full w-72 flex-col overflow-y-auto bg-canvas p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button type="button" className="btn-ghost w-9 px-0" onClick={() => setOpen(false)} aria-label="close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks labels={labels} groups={groups} badges={badges} onNavigate={() => setOpen(false)} />
            <div className="mt-auto pt-6">
              <SettingsLink label={labels.settings} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
