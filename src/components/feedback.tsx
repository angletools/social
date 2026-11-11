"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App-wide toasts and confirmation dialog, callable from any client component:
 *   toast("Saved")                          toast("Couldn't save", "error", { retry: save })
 *   toast("Rewriting…", "info", { busy: true })
 *   if (await confirmDialog("Delete this monitor?", { danger: true })) …
 *
 * Toasts sit bottom centre, three at most. Success closes after 3 s, info
 * after 4.5 s, errors stay 6 s. Hovering the stack holds them open.
 */

type ToastKind = "success" | "error" | "info";
type ToastOpts = { retry?: () => void; busy?: boolean; retryLabel?: string };
type ToastItem = { id: number; message: string; kind: ToastKind; leaving?: boolean } & ToastOpts;
type ConfirmReq = { message: string; detail?: string; danger?: boolean; confirmLabel?: string; resolve: (ok: boolean) => void };

const bus = typeof window !== "undefined" ? new EventTarget() : null;
const LIFETIME: Record<ToastKind, number> = { success: 3000, info: 4500, error: 6000 };
const MAX = 3;

export function toast(message: string, kind: ToastKind = "success", opts: ToastOpts = {}) {
  bus?.dispatchEvent(new CustomEvent("toast", { detail: { message, kind, ...opts } }));
}

export function confirmDialog(message: string, opts: { detail?: string; danger?: boolean; confirmLabel?: string } = {}) {
  return new Promise<boolean>((resolve) => {
    if (!bus) return resolve(false);
    bus.dispatchEvent(new CustomEvent("confirm", { detail: { message, ...opts, resolve } }));
  });
}

export function FeedbackHost({ labels }: { labels: { confirm: string; cancel: string; retry?: string; dismiss?: string } }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const [mounted, setMounted] = useState(false);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const kinds = useRef(new Map<number, ToastKind>());
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    kinds.current.delete(id);
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 160);
  }, []);

  const schedule = useCallback((id: number, ms: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  useEffect(() => {
    setMounted(true);
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<ToastItem, "id">;
      const id = ++n;
      setToasts((t) => {
        const live = t.filter((x) => !x.leaving);
        // Drop the oldest beyond three so the stack never grows.
        for (const old of live.slice(0, Math.max(0, live.length - (MAX - 1)))) {
          clearTimeout(timers.current.get(old.id));
          timers.current.delete(old.id);
        }
        return [...live.slice(-(MAX - 1)), { id, ...d }];
      });
      kinds.current.set(id, d.kind);
      schedule(id, LIFETIME[d.kind]);
    };
    const onConfirm = (e: Event) => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setReq((e as CustomEvent).detail);
    };
    bus?.addEventListener("toast", onToast);
    bus?.addEventListener("confirm", onConfirm);
    const all = timers.current;
    return () => {
      bus?.removeEventListener("toast", onToast);
      bus?.removeEventListener("confirm", onConfirm);
      all.forEach(clearTimeout);
    };
  }, [schedule]);

  const hold = () => timers.current.forEach(clearTimeout);
  const release = () => kinds.current.forEach((kind, id) => schedule(id, Math.min(LIFETIME[kind], 2000)));

  const close = useCallback(
    (ok: boolean) => {
      req?.resolve(ok);
      setReq(null);
      returnFocus.current?.focus?.();
    },
    [req],
  );

  useEffect(() => {
    if (!req) return;
    (req.danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Tab") {
        // Two buttons: keep focus inside the dialog.
        e.preventDefault();
        (document.activeElement === confirmRef.current ? cancelRef : confirmRef).current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, close]);

  if (!mounted) return null;
  return createPortal(
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(20px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 max-md:bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
        aria-live="polite"
        onPointerEnter={hold}
        onPointerLeave={release}
      >
        {toasts.map((t) => {
          const Icon = t.kind === "error" ? AlertTriangle : t.busy ? Loader2 : t.kind === "info" ? Info : CheckCircle2;
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex min-h-11 w-full max-w-[340px] items-center gap-2.5 rounded-[12px] bg-tip py-2 ps-3.5 pe-2.5 text-[13.5px] leading-snug text-white shadow-[0_10px_30px_rgb(0_0_0/0.18)] transition-[opacity,transform] duration-150 ease-(--ease-out)",
                t.leaving ? "translate-y-1 opacity-0" : "animate-rise",
              )}
            >
              <Icon
                aria-hidden
                strokeWidth={2}
                className={cn("h-4 w-4 shrink-0", t.kind === "error" ? "text-[#ef7a6a]" : t.kind === "info" ? "text-white/70" : "text-[#5cc08a]", t.busy && "animate-spin motion-reduce:animate-none")}
              />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t.message}</span>
              {t.retry ? (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(t.id);
                    t.retry?.();
                  }}
                  className="h-7 shrink-0 rounded-lg bg-white/12 px-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
                >
                  {t.retryLabel ?? labels.retry ?? "Retry"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="-me-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:text-white"
                  aria-label={labels.dismiss ?? "Dismiss"}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {req && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-5" onMouseDown={() => close(false)}>
          <div
            role="alertdialog"
            aria-modal
            aria-labelledby={titleId}
            className="animate-pop w-full max-w-[340px] rounded-[18px] bg-surface p-[22px] shadow-[0_24px_60px_rgb(0_0_0/0.3)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p id={titleId} className="text-[16px] leading-snug font-semibold">{req.message}</p>
            {req.detail && <p className="mt-2 text-[14px] leading-relaxed text-muted [overflow-wrap:anywhere]">{req.detail}</p>}
            <div className="mt-[22px] flex justify-end gap-2">
              <button ref={cancelRef} type="button" className="btn-ghost h-[38px] px-3.5 text-[14px]" onClick={() => close(false)}>
                {labels.cancel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={cn("btn h-[38px] px-4 text-[14px] font-semibold", req.danger ? "bg-neg text-white hover:bg-neg/90" : "bg-ink text-on-ink hover:bg-ink/85")}
                onClick={() => close(true)}
              >
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
