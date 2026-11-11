"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { useClientDict } from "@/components/client-dict";
import { confirmDialog, toast } from "@/components/feedback";
import { deleteMonitor, refreshMonitor, toggleMonitor } from "@/app/actions";
import { cn } from "@/lib/utils";

const BTN =
  "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-line ps-3.5 pe-4 text-[14px] font-medium text-ink transition-[background-color,transform] duration-150 ease-(--ease-out) hover:bg-sunken active:scale-[0.97] disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent disabled:active:scale-100";

export function MonitorActions({
  id,
  active,
  canRefresh,
  canAdmin,
  labels,
}: {
  id: string;
  active: boolean;
  canRefresh: boolean;
  canAdmin: boolean;
  labels: { pause: string; resume: string; refresh: string; edit: string; delete: string; confirm: string };
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"refresh" | "toggle" | "delete" | null>(null);
  const { toasts, common } = useClientDict();
  const run = (what: typeof busy, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(what);
    start(async () => {
      try {
        await fn();
        if (ok) toast(ok, what === "refresh" ? "info" : "success");
      } catch (e) {
        // A redirect after delete is not an error.
        if (!(e instanceof Error && e.message === "NEXT_REDIRECT")) toast(common.failed, "error");
      } finally {
        setBusy(null);
      }
    });
  };
  return (
    <>
      {canRefresh && (
        <button type="button" className={BTN} disabled={pending || !active} onClick={() => run("refresh", () => refreshMonitor(id), toasts.refreshQueued)}>
          <RefreshCw className={cn("h-4 w-4", busy === "refresh" && "animate-spin")} strokeWidth={1.7} /> {labels.refresh}
        </button>
      )}
      {canAdmin && (
        <>
          <button type="button" className={BTN} disabled={pending} onClick={() => run("toggle", () => toggleMonitor(id), active ? toasts.monitorPaused : toasts.monitorResumed)}>
            {active ? <Pause className="h-4 w-4" strokeWidth={1.7} /> : <Play className="h-4 w-4" strokeWidth={1.7} />} {active ? labels.pause : labels.resume}
          </button>
          <Link href={`/monitors/${id}/edit`} className={BTN}>
            <Pencil className="h-4 w-4" strokeWidth={1.7} /> {labels.edit}
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-line text-muted transition-[background-color,color,border-color] hover:border-neg/40 hover:bg-neg/5 hover:text-neg disabled:opacity-45"
            disabled={pending}
            onClick={async () => (await confirmDialog(labels.confirm, { danger: true, confirmLabel: labels.delete })) && run("delete", () => deleteMonitor(id))}
            aria-label={labels.delete}
            title={labels.delete}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </>
      )}
    </>
  );
}
