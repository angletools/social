import Link from "next/link";
import { cn } from "@/lib/utils";

/** Segmented period switcher that keeps other query params. */
export function RangeTabs({
  days,
  labels,
  basePath,
  params = {},
}: {
  days: number;
  labels: Record<string, string>;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  return (
    <div className="inline-flex rounded-[10px] bg-sunken p-0.5">
      {["1", "7", "30", "90"].map((d) => {
        const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), days: d } as Record<string, string>);
        const active = String(days) === d;
        return (
          <Link
            key={d}
            href={`${basePath}?${qs}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[8px] px-3 py-1.5 text-[13px] transition",
              active ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(21_24_27/0.08)]" : "text-muted hover:text-ink",
            )}
          >
            {labels[d]}
          </Link>
        );
      })}
    </div>
  );
}
