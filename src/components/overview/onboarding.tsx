"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { dismissOnboarding } from "@/app/actions";
import { cn } from "@/lib/utils";

type Step = { key: string; title: string; body: string; href: string; done: boolean };

export function Onboarding({ steps, labels }: { steps: Step[]; labels: { title: string; subtitle: string; progress: string; dismiss: string } }) {
  const [pending, start] = useTransition();
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 className="text-[15px] font-semibold">{labels.title}</h2>
          <p className="mt-1 text-[13px] text-muted">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{labels.progress.replace("{done}", String(done)).replace("{total}", String(steps.length))}</span>
          <button type="button" className="btn-ghost btn-sm w-7 px-0" disabled={pending} onClick={() => start(() => dismissOnboarding())} aria-label={labels.dismiss} title={labels.dismiss}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mx-5 mt-4 h-1 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-2 grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link href={s.href} className={cn("group flex h-full gap-3 px-5 py-4 transition-colors hover:bg-canvas", s.done && "opacity-60")}>
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tnum",
                  s.done ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong text-muted group-hover:border-ink group-hover:text-ink",
                )}
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[13px] font-medium leading-snug", s.done && "line-through decoration-line-strong")}>{s.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{s.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
