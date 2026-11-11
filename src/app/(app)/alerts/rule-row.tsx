"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteAlert, toggleAlert } from "@/app/actions";
import { cn } from "@/lib/utils";

export function RuleControls({ id, enabled, canEdit, labels }: { id: string; enabled: boolean; canEdit: boolean; labels: { on: string; off: string; confirm: string } }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={!canEdit || pending}
        onClick={() => start(() => toggleAlert(id))}
        className={cn("relative h-6 w-11 rounded-full transition", enabled ? "bg-brand-600" : "bg-slate-300")}
        title={enabled ? labels.on : labels.off}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", enabled ? "start-[1.375rem]" : "start-0.5")} />
      </button>
      {canEdit && (
        <button type="button" className="btn-ghost px-2 py-1.5" disabled={pending} onClick={() => confirm(labels.confirm) && start(() => deleteAlert(id))}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
