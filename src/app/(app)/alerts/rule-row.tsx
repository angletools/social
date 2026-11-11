"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { confirmDialog, toast } from "@/components/feedback";
import { deleteAlert, toggleAlert } from "@/app/actions";
import { cn } from "@/lib/utils";
import { useClientDict } from "@/components/client-dict";

/** The board's on/off switch: ink track when on, the knob slides to the inline end. */
export function Switch({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-(--ease-out) disabled:cursor-not-allowed",
        on ? "bg-ink" : "bg-faint/55",
      )}
    >
      <span
        className={cn(
          "absolute start-0.5 top-0.5 h-4 w-4 rounded-full bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150 ease-(--ease-out) motion-reduce:transition-none",
          on && "translate-x-4 rtl:-translate-x-4",
        )}
      />
    </button>
  );
}

export function RuleControls({
  id,
  name,
  enabled,
  onChange,
  canEdit,
  labels,
}: {
  id: string;
  name: string;
  enabled: boolean;
  onChange: (on: boolean) => void;
  canEdit: boolean;
  labels: { delete: string; confirm: string; confirmLabel: string };
}) {
  const [pending, start] = useTransition();
  const { toasts, common } = useClientDict();
  return (
    <>
      <Switch
        on={enabled}
        label={name}
        disabled={!canEdit}
        onToggle={() => {
          // Flip right away; roll back if the server says no.
          const next = !enabled;
          onChange(next);
          start(async () => {
            try {
              await toggleAlert(id);
              toast(next ? toasts.alertOn : toasts.alertOff);
            } catch {
              onChange(!next);
              toast(common.failed, "error");
            }
          });
        }}
      />
      {canEdit && (
        <button
          type="button"
          className="btn-ghost h-8 w-8 rounded-lg px-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={`${labels.delete}: ${name}`}
          title={labels.delete}
          disabled={pending}
          onClick={async () =>
            (await confirmDialog(labels.confirm, { danger: true, confirmLabel: labels.confirmLabel, detail: name })) &&
            start(async () => {
              await deleteAlert(id);
              toast(toasts.deleted);
            })
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );
}
