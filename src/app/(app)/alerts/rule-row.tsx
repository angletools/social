"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { confirmDialog, toast } from "@/components/feedback";
import { deleteAlert, toggleAlert, previewAlert } from "@/app/actions";
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
  locale,
  id,
  name,
  enabled,
  onChange,
  canEdit,
  labels,
}: {
  locale: string;
  id: string;
  name: string;
  enabled: boolean;
  onChange: (on: boolean) => void;
  canEdit: boolean;
  labels: { delete: string; confirm: string; confirmLabel: string };
}) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const ar = locale === "ar";
  const { toasts, common } = useClientDict();
  return (
    <>
      <details className="relative"><summary className="btn-ghost cursor-pointer text-xs">{ar ? "معاينة" : "Preview"}</summary><div className="absolute end-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-4 text-sm shadow-lg"><p className="mb-2 text-xs text-muted">{ar ? "معاينة للفترة الحالية دون إرسال؛ يتجاهل وقت الانتظار السابق." : "Checks the current window without sending; ignores the previous cooldown."}</p><button className="btn-secondary" disabled={pending} onClick={() => start(async () => { try { const p = await previewAlert(id); setPreview(`${p.hit ? (ar ? p.hit.bodyAr : p.hit.bodyEn) : (ar ? "لا توجد نتائج مطابقة حاليًا." : "No matches in the current window.")} ${ar ? "الحد الأدنى للتنبيهات النسبية" : "Minimum for percentage alerts"}: ${p.minimumVolume}. ${ar ? "وقت الانتظار بالدقائق" : "Cooldown in minutes"}: ${p.cooldownMinutes}.`); } catch { setPreview(common.failed); } })}>{ar ? "تشغيل المعاينة" : "Run preview"}</button><p role="status" className="mt-3 break-words">{preview}</p></div></details>
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
