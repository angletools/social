"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Light / dark / system switch. Applies instantly and remembers the choice in a cookie. */
export function ThemeToggle({ initial, labels }: { initial: Theme; labels: Record<Theme, string> & { title: string } }) {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    const on = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("rasd-theme", on);
    return () => window.removeEventListener("rasd-theme", on);
  }, []);
  const pick = (v: Theme) => {
    setTheme(v);
    applyTheme(v);
  };
  const opts: [Theme, React.ElementType][] = [
    ["light", Sun],
    ["dark", Moon],
    ["system", Monitor],
  ];
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-[13px]">{labels.title}</span>
      <div role="radiogroup" aria-label={labels.title} className="inline-flex rounded-lg bg-sunken p-0.5">
        {opts.map(([v, Icon]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={theme === v}
            aria-label={labels[v]}
            title={labels[v]}
            onClick={() => pick(v)}
            className={cn("flex h-7 w-8 items-center justify-center rounded-md transition", theme === v ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-faint hover:text-ink")}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
