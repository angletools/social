"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, Download, Link2, Mail, Trash2 } from "lucide-react";
import { confirmDialog, toast } from "@/components/feedback";
import { useClientDict } from "@/components/client-dict";
import { deleteReport, retryReport } from "@/app/actions";
import { cn } from "@/lib/utils";

export function ReportToolbar({
  id,
  canDelete,
  docTitle,
  ready,
  uiLocale,
  labels,
}: {
  id: string;
  canDelete: boolean;
  docTitle: string;
  ready: boolean;
  uiLocale: string;
  labels: {
    back: string;
    share: string;
    shareTitle: string;
    copy: string;
    copied: string;
    emailPdf: string;
    shareNote: string;
    exportPdf: string;
    delete: string;
    confirm: string;
  };
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setUrl(`${window.location.origin}/reports/${id}`), [id]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers or no permission: select the text so the person can copy it.
      boxRef.current?.querySelector("input")?.select();
      return;
    }
    setCopied(true);
    toast(labels.copied);
    setTimeout(() => setCopied(false), 1600);
  }

  /** Prints only the document card (see the print styles); the PDF is named after the report. */
  function exportPdf() {
    const prev = document.title;
    document.title = docTitle;
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  const shareText = `${docTitle}\n${url}`;
  const mailto = `mailto:?subject=${encodeURIComponent(docTitle)}&body=${encodeURIComponent(shareText)}`;

  return (
    <nav aria-label={labels.share} className="no-print flex items-center justify-between gap-4" dir={uiLocale === "ar" ? "rtl" : "ltr"}>
      <Link href="/reports" className="-ms-1.5 inline-flex h-[38px] items-center gap-1.5 rounded-[10px] ps-1.5 pe-3 text-[14px] text-muted transition-colors hover:bg-sunken hover:text-ink">
        <ChevronLeft className="h-[18px] w-[18px] rtl:rotate-180" strokeWidth={1.7} />
        {labels.back}
      </Link>
      <div className="flex items-center gap-2">
        {canDelete && (
          <button
            type="button"
            className="btn-ghost h-[38px] w-[38px] rounded-[11px] px-0"
            disabled={pending}
            title={labels.delete}
            aria-label={labels.delete}
            onClick={async () => (await confirmDialog(labels.confirm, { danger: true, confirmLabel: labels.delete })) && start(() => deleteReport(id))}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <div ref={boxRef} className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className="btn-secondary h-[38px] rounded-[11px] ps-3 pe-3.5 text-[14px]"
          >
            <Link2 className="h-4 w-4" strokeWidth={1.7} />
            {labels.share}
          </button>
          {open && (
            <div
              role="dialog"
              aria-label={labels.shareTitle}
              className="animate-pop absolute end-0 top-[46px] z-30 flex w-[min(340px,calc(100vw-32px))] origin-top-right flex-col gap-3 rounded-[16px] bg-surface p-4 shadow-[0_0_0_1px_var(--color-line),0_16px_40px_rgba(0,0,0,0.14)] rtl:origin-top-left"
            >
              <span className="text-[14px] font-semibold">{labels.shareTitle}</span>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url.replace(/^https?:\/\//, "")}
                  dir="ltr"
                  aria-label={labels.shareTitle}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-[38px] min-w-0 flex-1 truncate rounded-[10px] border border-line bg-surface px-3 text-[13px] text-muted outline-none focus:border-brand-500"
                />
                <button type="button" onClick={copy} className="btn-primary h-[38px] shrink-0 rounded-[10px] px-3.5 text-[13.5px] font-semibold">
                  {copied ? labels.copied : labels.copy}
                </button>
              </div>
              <a href={mailto} className="flex h-10 items-center gap-2.5 rounded-lg px-0.5 text-[14px] text-ink transition-colors hover:text-muted">
                <Mail className="h-4 w-4 text-muted" strokeWidth={1.6} />
                {labels.emailPdf}
              </a>
              <span className="text-[12.5px] leading-[1.6] text-faint">{labels.shareNote}</span>
            </div>
          )}
        </div>
        <button type="button" onClick={exportPdf} disabled={!ready} className={cn("btn-primary h-[38px] rounded-[11px] ps-3.5 pe-4 text-[14px] font-semibold")}>
          <Download className="h-4 w-4" strokeWidth={1.8} />
          {labels.exportPdf}
        </button>
      </div>
    </nav>
  );
}

export function RetryInline({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const { common } = useClientDict();
  return (
    <button
      type="button"
      disabled={pending}
      className="btn-secondary h-8 rounded-[10px] px-3 text-[13px] text-ink"
      onClick={() =>
        start(async () => {
          const r = await retryReport(id).catch(() => null);
          if (!r?.ok) toast(common.failed, "error");
        })
      }
    >
      {label}
    </button>
  );
}
