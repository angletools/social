"use client";

import { confirmDialog } from "@/components/feedback";
import Link from "next/link";
import { useTransition } from "react";
import { ArrowLeft, Printer, Trash2 } from "lucide-react";
import { deleteReport } from "@/app/actions";

export function ReportToolbar({ id, labels }: { id: string; labels: { back: string; print: string; delete: string; confirm: string } }) {
  const [pending, start] = useTransition();
  return (
    <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between">
      <Link href="/reports" className="btn-ghost">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {labels.back}
      </Link>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {labels.print}
        </button>
        <button type="button" className="btn-danger" disabled={pending} onClick={async () => (await confirmDialog(labels.confirm, { danger: true, confirmLabel: labels.delete })) && start(() => deleteReport(id))} aria-label={labels.delete}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
