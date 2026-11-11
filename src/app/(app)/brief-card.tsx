"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrief } from "@/app/actions";

/** The one-sentence read of the day, set large at the top of Home. Falls back to a sentence built from the numbers. */
export function BriefCard({
  brief,
  fallback,
  labels,
  aiOn,
}: {
  brief: { status: string; headline?: string; summary?: string; when: string } | null;
  fallback: React.ReactNode;
  labels: { title: string; generate: string; generating: string; failed: string };
  aiOn: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const generating = brief?.status === "GENERATING" || pending;
  const ready = brief?.status === "READY" && brief.headline;

  useEffect(() => {
    if (brief?.status !== "GENERATING") return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [brief?.status, router]);

  return (
    <section aria-label={labels.title} className="max-w-[900px]">
      {generating ? (
        <div className="space-y-3 py-1">
          <div className="skeleton h-6 w-3/4" />
          <div className="skeleton h-6 w-1/2" />
        </div>
      ) : ready ? (
        <>
          <p className="text-[21px] font-medium leading-[1.6] md:text-[24px]">{brief.headline}</p>
          {brief.summary && <p className="mt-2 text-[15.5px] leading-relaxed text-muted">{brief.summary}</p>}
        </>
      ) : (
        <p className="text-[20px] leading-[1.65] text-muted md:text-[22px]">{fallback}</p>
      )}
      <div className="mt-3 flex items-center gap-3 text-[13px] text-faint">
        {ready && brief.when && <span>{brief.when}</span>}
        {brief?.status === "FAILED" && aiOn && <span>{labels.failed}</span>}
        {aiOn && !generating && (
          <button type="button" className="text-brand-700 hover:text-ink" onClick={() => start(async () => { await createBrief(); router.refresh(); })}>
            {ready ? labels.generate : labels.title}
          </button>
        )}
        {generating && <span className="animate-pulse">{labels.generating}</span>}
      </div>
    </section>
  );
}
