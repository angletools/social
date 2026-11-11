"use client";

import { useClientDict } from "@/components/client-dict";
import { confirmDialog, toast } from "@/components/feedback";
import { useTransition } from "react";
import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { deleteMonitor, refreshMonitor, toggleMonitor } from "@/app/actions";

export function MonitorActions({
  id,
  active,
  canAdmin,
  labels,
}: {
  id: string;
  active: boolean;
  canAdmin: boolean;
  labels: { pause: string; resume: string; refresh: string; delete: string; confirm: string };
}) {
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();
  return (
    <>
      <button type="button" className="btn-secondary" disabled={pending || !active} onClick={() => start(async () => { await refreshMonitor(id); toast(toasts.refreshQueued, "info"); })}>
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> {labels.refresh}
      </button>
      {canAdmin && (
        <>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => start(async () => { await toggleMonitor(id); toast(active ? toasts.monitorPaused : toasts.monitorResumed); })}>
            {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {active ? labels.pause : labels.resume}
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={pending}
            onClick={async () => (await confirmDialog(labels.confirm, { danger: true, confirmLabel: labels.delete })) && start(() => deleteMonitor(id))}
            aria-label={labels.delete}
            title={labels.delete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </>
  );
}
