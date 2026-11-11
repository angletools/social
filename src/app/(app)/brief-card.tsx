"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw } from "lucide-react";
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
  const generating = brief?.status === "GENERATING";

  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [generating, router]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 bg-gradient-to-l from-brand-50 to-white p-5 rtl:bg-gradient-to-r">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{labels.title}</h2>
            {brief?.when && <span className="text-xs text-muted">· {brief.when}</span>}
          </div>
          {generating ? (
            <p className="mt-2 animate-pulse text-sm text-muted">{labels.generating}</p>
          ) : brief?.status === "READY" ? (
            <>
              <p className="mt-2 text-base font-medium leading-relaxed">{brief.headline}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{brief.summary}</p>
            </>
          ) : brief?.status === "FAILED" ? (
            <p className="mt-2 text-sm text-red-700">{aiOn ? labels.failed : labels.disabled}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">{aiOn ? labels.empty : labels.disabled}</p>
          )}
        </div>
        {aiOn && !generating && (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => start(async () => { await createBrief(); router.refresh(); })}>
            <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {labels.generate}
          </button>
        )}
      </div>
    </section>
  );
}
