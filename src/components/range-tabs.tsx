import Link from "next/link";
import { cn } from "@/lib/utils";

/** Period switcher that keeps other query params. */
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
    <div className="inline-flex rounded-xl border border-line bg-white p-1">
      {["1", "7", "30", "90"].map((d) => {
        const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), days: d } as Record<string, string>);
        return (
          <Link
            key={d}
            href={`${basePath}?${qs}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition",
              String(days) === d ? "bg-brand-600 font-medium text-white" : "text-muted hover:text-ink",
            )}
          >
            {labels[d]}
          </Link>
        );
      })}
    </div>
  );
}
