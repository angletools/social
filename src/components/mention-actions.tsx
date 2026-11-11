"use client";

import { useTransition } from "react";
import { Archive, Check, Flag } from "lucide-react";
import type { MentionStatus } from "@prisma/client";
import { setMentionStatus } from "@/app/actions";
import { cn } from "@/lib/utils";

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
  const set = (s: MentionStatus) => start(() => setMentionStatus([id], s === status ? "NEW" : s));
  const btn = (active: boolean) =>
    cn("btn-ghost px-2 py-1 text-xs", active && "bg-brand-50 text-brand-700", pending && "opacity-50");
  return (
    <>
      <button type="button" onClick={() => set("REVIEWED")} className={btn(status === "REVIEWED")} disabled={pending}>
        <Check className="h-3.5 w-3.5" /> {status === "REVIEWED" ? labels.REVIEWED : labels.markReviewed}
      </button>
      <button type="button" onClick={() => set("FLAGGED")} className={cn(btn(status === "FLAGGED"), status === "FLAGGED" && "bg-amber-50 text-amber-700")} disabled={pending}>
        <Flag className="h-3.5 w-3.5" /> {status === "FLAGGED" ? labels.FLAGGED : labels.flag}
      </button>
      <button type="button" onClick={() => set("ARCHIVED")} className={btn(false)} disabled={pending} title={labels.archive}>
        <Archive className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
