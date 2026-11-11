"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check, ChevronRight } from "lucide-react";
import { dismissOnboarding } from "@/app/actions";
import { cn } from "@/lib/utils";
import { DotBar } from "@/components/dots";

type Step = { key: string; title: string; body: string; href: string; done: boolean };

/** First-run checklist on Home: shown until setup is done or an admin hides it. */
export function Onboarding({ steps, labels }: { steps: Step[]; labels: { title: string; subtitle: string; progress: string; dismiss: string } }) {
  const [pending, start] = useTransition();
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="card flex flex-col px-5 pt-5 pb-2 sm:px-6" aria-labelledby="onboarding-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="onboarding-title" className="text-[15px] font-semibold">{labels.title}</h2>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => dismissOnboarding())}
          className="-me-2 rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:text-ink max-md:py-2.5"
        >
          {labels.dismiss}
        </button>
      </div>
      <p className="mt-0.5 text-[13px] text-muted">{labels.subtitle}</p>
      <div className="mt-3 flex items-center gap-2.5">
        <DotBar segments={[{ value: done, color: "var(--color-ink)" }]} max={steps.length} className="flex-1" label={labels.progress.replace("{done}", String(done)).replace("{total}", String(steps.length))} />
        <span className="shrink-0 text-[12.5px] text-muted tnum">{labels.progress.replace("{done}", String(done)).replace("{total}", String(steps.length))}</span>
      </div>
      <ol className="mt-2">
        {steps.map((s, i) => {
          const current = i === next;
          return (
            <li key={s.key} className="border-t border-sunken first:border-0">
              <Link href={s.href} prefetch={false} className="group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-[11px] transition-colors hover:bg-canvas/70">
                <span
                  aria-hidden
                  className={cn(
                    "mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
                    s.done ? "bg-ink text-on-ink" : current ? "border-[1.5px] border-ink" : "border-[1.5px] border-faint group-hover:border-ink",
                  )}
                >
                  {s.done && <Check className="h-[11px] w-[11px]" strokeWidth={3} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("text-[13.5px]", s.done ? "font-medium text-faint" : current ? "font-semibold" : "font-medium")}>
                    {s.title}
                  </span>
                  {current && <span className="text-[12.5px] leading-normal text-muted">{s.body}</span>}
                </span>
                {!s.done && <ChevronRight aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" strokeWidth={1.8} />}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
