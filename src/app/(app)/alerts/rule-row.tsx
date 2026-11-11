"use client";

import { confirmDialog, toast } from "@/components/feedback";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteAlert, toggleAlert } from "@/app/actions";
import { cn } from "@/lib/utils";
import { useClientDict } from "@/components/client-dict";

export function RuleControls({
  id,
  enabled,
  canEdit,
  labels,
}: {
  id: string;
  enabled: boolean;
  canEdit: boolean;
  labels: { on: string; off: string; confirm: string };
}) {
  const [pending, start] = useTransition();
  const { toasts } = useClientDict();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={!canEdit || pending}
        onClick={() =>
          start(async () => {
            await toggleAlert(id);
            toast(enabled ? toasts.alertOff : toasts.alertOn);
          })
        }
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          enabled ? "bg-brand-600" : "bg-line-strong",
        )}
        title={enabled ? labels.on : labels.off}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
            enabled ? "start-[18px]" : "start-0.5",
          )}
        />
      </button>
      {canEdit && (
        <button
          type="button"
          className="btn-ghost btn-sm w-7 px-0"
          aria-label="delete"
          disabled={pending}
          onClick={async () =>
            (await confirmDialog(labels.confirm, { danger: true })) &&
            start(async () => {
              await deleteAlert(id);
              toast(toasts.deleted);
            })
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
