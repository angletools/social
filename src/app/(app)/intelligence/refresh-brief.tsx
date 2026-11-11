"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshIntelligenceBrief } from "@/app/actions";
import { toast } from "@/components/feedback";
import { cn } from "@/lib/utils";

/** Rebuilds the brief; when the worker takes the job, polls until the new brief lands. */
export function RefreshBrief({ days, stamp, labels }: { days: number; stamp: string | null; labels: { refresh: string; refreshing: string; queued: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [waiting, setWaiting] = useState(false);
  const from = useRef(stamp);

  useEffect(() => {
    if (!waiting) return;
    if (stamp !== from.current) {
      setWaiting(false);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      if (Date.now() - startedAt > 180_000) setWaiting(false);
      else router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [waiting, stamp, router]);

  const busy = pending || waiting;
  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          from.current = stamp;
          const r = await refreshIntelligenceBrief(days);
          if (r.ok && r.message === "queued") {
            toast(labels.queued, "info");
            setWaiting(true);
          } else router.refresh();
        })
      }
    >
      <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      {busy ? labels.refreshing : labels.refresh}
    </button>
  );
}
