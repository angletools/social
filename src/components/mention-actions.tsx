"use client";

import { useTransition } from "react";
import { Archive, Check, Flag } from "lucide-react";
import type { MentionStatus } from "@prisma/client";
import { setMentionStatus } from "@/app/actions";
import { cn } from "@/lib/utils";
import { toast } from "./feedback";
import { useClientDict } from "./client-dict";

export function MentionActions({
  id,
  status,
  labels,
}: {
  id: string;
  status: MentionStatus;
  labels: Record<MentionStatus, string> & { markReviewed: string; flag: string; archive: string };
}) {
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();
  const set = (s: MentionStatus) =>
    start(async () => {
      const next = s === status ? "NEW" : s;
      await setMentionStatus([id], next);
      toast(toasts[next]);
    });
  return (
    <>
      <button
        type="button"
        onClick={() => set("REVIEWED")}
        disabled={pending}
        aria-pressed={status === "REVIEWED"}
        className={cn("btn-ghost btn-sm", status === "REVIEWED" && "text-pos")}
      >
        <Check className="h-3.5 w-3.5" /> {status === "REVIEWED" ? labels.REVIEWED : labels.markReviewed}
      </button>
      <button
        type="button"
        onClick={() => set("FLAGGED")}
        disabled={pending}
        aria-pressed={status === "FLAGGED"}
        title={labels.flag}
        aria-label={labels.flag}
        className={cn("btn-ghost btn-sm w-7 px-0", status === "FLAGGED" && "bg-sand-50 text-sand-700")}
      >
        <Flag className={cn("h-3.5 w-3.5", status === "FLAGGED" && "fill-current")} />
      </button>
      <button type="button" onClick={() => set("ARCHIVED")} disabled={pending} title={labels.archive} aria-label={labels.archive} className="btn-ghost btn-sm w-7 px-0">
        <Archive className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
