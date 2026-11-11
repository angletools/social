"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App-wide toasts and confirmation dialog, callable from any client component:
 *   toast("Saved")                 toast("Couldn't save", "error")
 *   if (await confirmDialog("Delete this monitor?", { danger: true })) …
 */

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; message: string; kind: ToastKind };
type ConfirmReq = { message: string; detail?: string; danger?: boolean; confirmLabel?: string; resolve: (ok: boolean) => void };

const bus = typeof window !== "undefined" ? new EventTarget() : null;

export function toast(message: string, kind: ToastKind = "success") {
  bus?.dispatchEvent(new CustomEvent("toast", { detail: { message, kind } }));
}

export function confirmDialog(message: string, opts: { detail?: string; danger?: boolean; confirmLabel?: string } = {}) {
  return new Promise<boolean>((resolve) => {
    if (!bus) return resolve(false);
    bus.dispatchEvent(new CustomEvent("confirm", { detail: { message, ...opts, resolve } }));
  });
}

export function FeedbackHost({ labels }: { labels: { confirm: string; cancel: string } }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const [mounted, setMounted] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
    let n = 0;
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail;
      const id = ++n;
      setToasts((t) => [...t.slice(-2), { id, message, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3200);
    };
    const onConfirm = (e: Event) => setReq((e as CustomEvent).detail);
    bus?.addEventListener("toast", onToast);
    bus?.addEventListener("confirm", onConfirm);
    return () => {
      bus?.removeEventListener("toast", onToast);
      bus?.removeEventListener("confirm", onConfirm);
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  if (!mounted) return null;
  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.kind === "error" ? AlertTriangle : t.kind === "info" ? Info : CheckCircle2;
          return (
            <div key={t.id} className="animate-rise pointer-events-auto flex items-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-[13px] text-white shadow-[var(--shadow-pop)]">
              <Icon className={cn("h-4 w-4", t.kind === "error" ? "text-[#f0a090]" : t.kind === "info" ? "text-white/70" : "text-[#8fd3b0]")} />
              <span>{t.message}</span>
              <button type="button" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="ms-1 text-white/50 hover:text-white" aria-label="close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {req && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]" onMouseDown={() => close(false)}>
          <div role="alertdialog" aria-modal className="animate-rise w-full max-w-sm rounded-2xl bg-surface p-6 shadow-[var(--shadow-pop)]" onMouseDown={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-semibold leading-snug">{req.message}</p>
            {req.detail && <p className="mt-2 text-[13px] leading-relaxed text-muted">{req.detail}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => close(false)}>
                {labels.cancel}
              </button>
              <button ref={confirmRef} type="button" className={req.danger ? "btn bg-neg text-white hover:bg-neg/90" : "btn-primary"} onClick={() => close(true)}>
                {req.confirmLabel ?? labels.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
