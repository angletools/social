"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createBrief } from "@/app/actions";

export function BriefCard({
  brief,
  labels,
  aiOn,
}: {
  brief: { status: string; headline?: string; summary?: string; when: string } | null;
  labels: { title: string; empty: string; generate: string; generating: string; disabled: string; failed: string };
  aiOn: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const generating = brief?.status === "GENERATING" || pending;

  useEffect(() => {
    if (brief?.status !== "GENERATING") return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [brief?.status, router]);

  return (
    <section className="card relative overflow-hidden">
      <span className="absolute inset-y-0 start-0 w-[3px] bg-sand-500" />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 px-6 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-sand-50 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-sand-700">AI</span>
            <h2 className="text-[13px] font-semibold">{labels.title}</h2>
            {brief?.when && <span className="text-xs text-faint">· {brief.when}</span>}
          </div>
          {generating ? (
            <div className="mt-3 space-y-2">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-3.5 w-1/2" />
            </div>
          ) : brief?.status === "READY" ? (
            <>
              <p className="mt-2.5 text-[16px] font-medium leading-relaxed">{brief.headline}</p>
              <p className="mt-1.5 max-w-4xl text-[13.5px] leading-relaxed text-muted">{brief.summary}</p>
            </>
          ) : (
            <p className="mt-2.5 text-[13.5px] text-muted">{brief?.status === "FAILED" ? (aiOn ? labels.failed : labels.disabled) : aiOn ? labels.empty : labels.disabled}</p>
          )}
        </div>
        {aiOn && !generating && (
          <button type="button" className="btn-secondary" onClick={() => start(async () => { await createBrief(); router.refresh(); })}>
            <RefreshCw className="h-3.5 w-3.5" />
            {labels.generate}
          </button>
        )}
      </div>
    </section>
  );
}
