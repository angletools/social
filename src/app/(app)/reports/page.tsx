import Link from "next/link";
import { FileText } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import { Card, PageHeader } from "@/components/ui";
import { ReportForm } from "./report-form";

export default async function ReportsPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const [reports, monitors] = await Promise.all([
    db.report.findMany({ where: { organizationId: user.organizationId, kind: "report" }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.monitor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } }),
  ]);
  const status = (s: string) =>
    s === "READY" ? "bg-pos/[0.07] text-pos" : s === "FAILED" ? "bg-neg/[0.06] text-neg" : "bg-sand-50 text-sand-700 animate-pulse";

  return (
    <>
      <PageHeader title={t.reports.title} subtitle={t.reports.subtitle} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card bodyClassName="p-0">
          {reports.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">{t.reports.empty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link prefetch={false} href={`/reports/${r.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-canvas">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" dir="auto">{r.title}</div>
                      <div className="text-xs text-muted">
                        {t.reports.generatedOn} {formatDate(r.createdAt, locale)} · {r.locale === "ar" ? "العربية" : "English"}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status(r.status)}`}>{r.status === "GENERATING" ? "…" : r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {hasRole(user, "ANALYST") && (
          <Card title={t.reports.new} className="h-fit">
            {!aiEnabled() && <p className="mb-4 rounded-xl bg-sand-50 px-3 py-2 text-xs text-sand-700">{t.assistant.disabled}</p>}
            <ReportForm
              monitors={monitors}
              locale={locale}
              ranges={{ "1": t.common.range["1"], "7": t.common.range["7"], "30": t.common.range["30"], "90": t.common.range["90"] }}
              labels={{ period: t.reports.period, scope: t.reports.scope, all: t.reports.allMonitors, language: t.reports.language, submit: t.reports.new }}
            />
          </Card>
        )}
      </div>
    </>
  );
}
