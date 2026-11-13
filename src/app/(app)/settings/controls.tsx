"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Pill-style radio group ("segmented control"); arrow keys move the choice. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  name,
  disabled,
  className,
}: {
  options: { value: T; label: string; lang?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn("flex gap-0.5 rounded-[12px] bg-sunken p-[3px]", disabled && "opacity-60", className)}
      onKeyDown={(e) => {
        const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
        if (e.key === "ArrowRight") { e.preventDefault(); move(rtl ? -1 : 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); move(rtl ? 1 : -1); }
      }}
    >
      {name && <input type="hidden" name={name} value={String(value)} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            lang={o.lang}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 min-w-0 flex-1 truncate rounded-[9px] px-2 text-[14px] transition-colors duration-150 max-md:h-10",
              on ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch; posts "on" through a hidden input when it has a name. */
export function Switch({ checked, onChange, label, name, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; name?: string; disabled?: boolean }) {
  return (
    <>
      {name && checked && <input type="hidden" name={name} value="on" />}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50", checked ? "bg-ink" : "bg-line-strong")}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[3px] h-5 w-5 rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.15)] transition-[inset-inline-start] duration-150 ease-(--ease-out)",
            checked ? "start-[21px]" : "start-[3px]",
          )}
        />
      </button>
    </>
  );
}
