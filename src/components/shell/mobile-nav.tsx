"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLinks } from "./nav-links";

export function MobileNav({ labels, badges, brand }: { labels: Record<string, string>; badges: Record<string, number>; brand: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button type="button" className="btn-secondary px-2.5 py-2" onClick={() => setOpen(true)} aria-label="menu">
        <Menu className="h-4 w-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setOpen(false)}>
          <div className="h-full w-72 bg-canvas p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button type="button" className="btn-ghost px-2" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks labels={labels} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
