"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Period picker that reads as quiet text ("7 days ⌄") and opens the native
 * picker. Used on phones, where the segmented control does not fit.
 */
export function RangeSelect({ days, labels, basePath, label, className }: { days: number; labels: Record<string, string>; basePath: string; label: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cn("relative inline-flex items-center gap-1 text-[13px] text-faint", pending && "opacity-60", className)}>
      <span className="sr-only">{label}</span>
      <span aria-hidden>{labels[String(days)]}</span>
      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      <select
        value={String(days)}
        onChange={(e) => start(() => router.push(`${basePath}?days=${e.target.value}`, { scroll: false }))}
        className="absolute inset-0 cursor-pointer text-[16px] opacity-0"
        aria-label={label}
      >
        {["1", "7", "30", "90"].map((d) => (
          <option key={d} value={d}>
            {labels[d]}
          </option>
        ))}
      </select>
    </label>
  );
}
