"use client";

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
  return (
    <>
      <button type="button" className="btn-secondary" disabled={pending || !active} onClick={() => start(() => refreshMonitor(id))}>
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> {labels.refresh}
      </button>
      {canAdmin && (
        <>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => start(() => toggleMonitor(id))}>
            {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {active ? labels.pause : labels.resume}
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={pending}
            onClick={() => confirm(labels.confirm) && start(() => deleteMonitor(id))}
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
