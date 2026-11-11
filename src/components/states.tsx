import Link from "next/link";
import { cn } from "@/lib/utils";

/** Shared empty and loading states (V2Empty board). Server-safe. */

/** "All caught up": a finished progress ring with a tick, plus what the team did today. */
export function CaughtUp({ title, body, stats }: { title: string; body: string; stats?: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center" role="status">
      <svg viewBox="0 0 96 96" width="88" height="88" aria-hidden className="animate-rise">
        <circle cx="48" cy="48" r="44" fill="none" strokeWidth="5" className="stroke-line" />
        <circle cx="48" cy="48" r="32" fill="none" strokeWidth="5" className="stroke-line" />
        <circle cx="48" cy="48" r="44" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray="276.5 999" transform="rotate(-90 48 48)" className="stroke-pos" />
        <path d="M38 48.5l7 7 13-14" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" />
      </svg>
      <h2 className="mt-[18px] text-[17px] font-semibold">{title}</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{body}</p>
      {stats && stats.length > 0 && (
        <p className="mt-[18px] flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-[12.5px] text-faint">
          {stats.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-3.5">
              {i > 0 && <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-faint" />}
              <span>
                <span className="font-semibold text-ink tnum">{s.value}</span> {s.label}
              </span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** Loading placeholder in the shape of a chart card (variant "chart") or a list card (variant "list"). */
export function CardSkeleton({ variant = "chart", rows = 2, className, label = "Loading" }: { variant?: "chart" | "list"; rows?: number; className?: string; label?: string }) {
  if (variant === "list") {
    const widths = [
      ["58%", "84%"],
      ["40%", "70%"],
      ["66%", "52%"],
      ["48%", "76%"],
    ];
    return (
      <div aria-busy aria-label={label} className={cn("card flex flex-col px-6 py-2", className)}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-3 border-t border-sunken first:border-0">
            <span className="skeleton h-8 w-8 shrink-0 rounded-[10px]" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="skeleton h-2.5" style={{ width: widths[i % 4][0] }} />
              <span className="skeleton h-2.5" style={{ width: widths[i % 4][1] }} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-busy aria-label={label} className={cn("card flex flex-col px-6 pt-6 pb-4", className)}>
      <div className="flex justify-between">
        <span className="skeleton h-3 w-24" />
        <span className="skeleton h-3 w-11" />
      </div>
      <span className="skeleton mt-3.5 h-7 w-[110px]" />
      <svg viewBox="0 0 320 110" className="mt-4 block h-auto w-full" aria-hidden>
        <defs>
          <pattern id="sk-dots" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
            <circle cx="2.25" cy="2.25" r="1.35" className="fill-line" />
          </pattern>
        </defs>
        <path d={SK_LINE + " L320 110 L0 110 Z"} fill="url(#sk-dots)" />
        <path d={SK_LINE} fill="none" strokeWidth="1.6" className="stroke-line" />
      </svg>
    </div>
  );
}

// A soft wave for the chart placeholder (same curve as the board).
const SK_LINE = (() => {
  const P = Array.from({ length: 13 }, (_, i) => [(i / 12) * 320, 70 - 18 * Math.sin(i * 0.9) - 8 * Math.sin(i * 2.1)]);
  return P.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const a = P[i - 2] || P[i - 1], b = P[i - 1], d = P[i + 1] || p;
    const lo = Math.min(b[1], p[1]), hi = Math.max(b[1], p[1]);
    const cl = (y: number) => Math.min(hi, Math.max(lo, y));
    return `C${(b[0] + (p[0] - a[0]) / 6).toFixed(1)} ${cl(b[1] + (p[1] - a[1]) / 6).toFixed(1)} ${(p[0] - (d[0] - b[0]) / 6).toFixed(1)} ${cl(p[1] - (d[1] - b[1]) / 6).toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  }).join(" ");
})();

/** Full-page "not found", outside the app shell. */
export function NotFoundPage({ title, body, home, href = "/" }: { title: string; body: string; home: string; href?: string }) {
  return (
    <div className="flex min-h-dvh bg-black p-2.5 sm:p-4">
      <div className="flex flex-1 flex-col rounded-[18px] bg-canvas px-6 py-5 sm:rounded-[22px] sm:px-10 sm:py-8">
        <span dir="ltr" className="self-start text-[18px] leading-none font-semibold tracking-[-0.03em] sm:text-[22px]">
          angle<span className="text-[15px] font-normal tracking-normal text-faint sm:text-[18px]"> /social</span>
        </span>
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <span className="text-[88px] leading-none font-semibold tracking-[-0.04em] text-line-strong tnum sm:text-[120px]" dir="ltr">404</span>
          <h1 className="mt-5 text-[18px] font-semibold">{title}</h1>
          <p className="mt-2 max-w-[280px] text-[14px] leading-relaxed text-muted">{body}</p>
          <Link href={href} className="btn-primary mt-6 h-10 px-[18px] text-[14px] font-semibold">
            {home}
          </Link>
        </div>
      </div>
    </div>
  );
}
