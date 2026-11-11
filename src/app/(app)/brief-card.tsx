"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrief } from "@/app/actions";

/**
 * The one-sentence read of the day at the top of Home. Falls back to a
 * sentence built from the numbers; `after` (who is waiting) follows either.
 */
export function BriefCard({
  brief,
  fallback,
  after,
  labels,
  aiOn,
}: {
  brief: { status: string; headline?: string; summary?: string; when: string } | null;
  fallback: React.ReactNode;
  after?: React.ReactNode;
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

  const showMeta = (ready && brief.when) || (brief?.status === "FAILED" && aiOn) || aiOn;
  return (
    <section aria-label={labels.title} className="max-w-[880px]">
      {generating ? (
        <div className="space-y-3 py-1" aria-busy>
          <div className="skeleton h-6 w-3/4" />
          <div className="skeleton h-6 w-1/2" />
        </div>
      ) : (
        <p className="text-[17px] leading-[1.7] text-muted md:text-[22px] md:leading-[1.6]">
          {ready ? <span className="text-ink">{brief.headline}</span> : fallback}
          {after && <> {after}</>}
        </p>
      )}
      {ready && brief.summary && <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-muted">{brief.summary}</p>}
      {showMeta && (
        <div className="mt-2.5 flex items-center gap-3 text-[13px] text-faint">
          {ready && brief.when && <span>{brief.when}</span>}
          {brief?.status === "FAILED" && aiOn && <span>{labels.failed}</span>}
          {aiOn && !generating && (
            <button type="button" className="text-muted transition-colors hover:text-ink" onClick={() => start(async () => { await createBrief(); router.refresh(); })}>
              {ready ? labels.generate : labels.title}
            </button>
          )}
          {generating && <span className="animate-pulse">{labels.generating}</span>}
        </div>
      )}
    </section>
  );
}
