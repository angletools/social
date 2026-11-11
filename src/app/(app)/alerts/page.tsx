import Link from "next/link";
import { BellRing } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatNumber, timeAgo } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { AlertForm } from "./alert-form";
import { RuleControls } from "./rule-row";

export default async function AlertsPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const [rules, notes, monitors] = await Promise.all([
    db.alertRule.findMany({ where: { organizationId: user.organizationId }, include: { monitor: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.notification.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.monitor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } }),
  ]);
  const canEdit = hasRole(user, "ADMIN");

  const describe = (r: (typeof rules)[number]) => {
    if (r.kind === "NEGATIVE_SPIKE") return `> ${r.threshold}% · ${t.alerts.windowOpts[String(r.windowMinutes) as "60"] ?? `${r.windowMinutes}m`}`;
    if (r.kind === "VOLUME_SPIKE") return `> ${formatNumber(r.threshold, locale)} · ${t.alerts.windowOpts[String(r.windowMinutes) as "60"] ?? `${r.windowMinutes}m`}`;
    if (r.kind === "HIGH_REACH") return `≥ ${formatNumber(r.threshold, locale)} ${t.overview.followers}`;
    if (r.kind === "KEYWORD") return `“${r.keyword}”`;
    return "";
  };

  return (
    <>
      <PageHeader title={t.alerts.title} subtitle={t.alerts.subtitle} />
      <div className="grid gap-6 lg:grid-cols-[1fr_23rem]">
        <div className="space-y-6">
          <Card title={t.alerts.title} bodyClassName="p-0">
            {rules.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">{t.alerts.empty}</p>
            ) : (
              <ul className="divide-y divide-line">
                {rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-canvas text-muted">
                      <BellRing className="h-4 w-4" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium" dir="auto">{r.name}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {t.alerts.kind[r.kind]} <span className="ltr-nums">{describe(r)}</span> · {r.monitor?.name ?? t.alerts.anyMonitor}
                        {r.emails.length > 0 && <> · ✉ {r.emails.length}</>}
                        {r.webhookUrl && <> · {new URL(r.webhookUrl).hostname.includes("slack") ? "Slack" : "Teams"}</>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {t.alerts.lastTriggered}: {r.lastTriggeredAt ? timeAgo(r.lastTriggeredAt, locale) : t.common.never}
                      </div>
                    </div>
                    <RuleControls id={r.id} enabled={r.enabled} canEdit={canEdit} labels={{ on: t.alerts.enabled, off: t.alerts.disabled, confirm: t.common.confirmDelete }} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t.alerts.recent} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link href={n.link ?? "#"} className="flex gap-3 px-5 py-3.5 hover:bg-canvas">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.severity === "CRITICAL" ? "bg-neg" : n.severity === "WARNING" ? "bg-warn" : "bg-brand-600"}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium" dir="auto">{locale === "ar" ? n.titleAr : n.titleEn}</div>
                      <div className="mt-0.5 line-clamp-2 text-sm text-muted" dir="auto">{locale === "ar" ? n.bodyAr : n.bodyEn}</div>
                      <div className="mt-1 text-xs text-faint">{timeAgo(n.createdAt, locale)}</div>
                    </div>
                  </Link>
                </li>
              ))}
              {notes.length === 0 && <li className="p-8 text-center text-sm text-muted">{t.nav.noNotifications}</li>}
            </ul>
          </Card>
        </div>
        {canEdit && (
          <Card title={t.alerts.new} className="h-fit">
            <AlertForm t={t.alerts} monitors={monitors} saveLabel={t.common.create} />
          </Card>
        )}
      </div>
    </>
  );
}
