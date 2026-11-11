import { CheckCircle2, CircleAlert } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatDate, formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled, AI_ENRICH_MODEL, AI_MODEL } from "@/lib/ai/client";
import { MonidClient } from "@/lib/monid/client";
import { Card, PageHeader } from "@/components/ui";
import { AddMemberForm, MemberControls, OrgForm } from "./forms";

function Usage({ label, used, limit, locale }: { label: string; used: number; limit: number; locale: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted ltr-nums">{formatNumber(used, locale)} / {formatNumber(limit, locale)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Status({ ok, okLabel, offLabel, detail }: { ok: boolean; okLabel: string; offLabel: string; detail?: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-sm ${ok ? "text-green-700" : "text-amber-700"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
      {ok ? okLabel : offLabel}
      {detail && <span className="text-muted">· {detail}</span>}
    </span>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const org = user.organization;
  const isAdmin = hasRole(user, "ADMIN");
  const since = new Date(Date.now() - 30 * 86400_000);
  const [members, monitorCount, mentionCount, logs] = await Promise.all([
    db.user.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } }),
    db.monitor.count({ where: { organizationId: org.id } }),
    db.mention.count({ where: { organizationId: org.id, createdAt: { gte: since } } }),
    isAdmin ? db.auditLog.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 15 }) : Promise.resolve([]),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));

  const monid = MonidClient.fromEnv();
  let balance: string | undefined;
  if (monid && isAdmin) {
    try {
      const b = await monid.balance();
      const amount = b?.balance ?? b?.available ?? b?.amount;
      balance = amount !== undefined ? `${t.settings.balance}: ${typeof amount === "object" ? JSON.stringify(amount) : amount}` : undefined;
    } catch {
      balance = undefined;
    }
  }

  return (
    <>
      <PageHeader title={t.settings.title} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t.settings.organization}>
          <OrgForm
            name={org.name}
            brandContext={org.brandContext ?? ""}
            disabled={!isAdmin}
            labels={{ name: t.settings.orgName, context: t.settings.brandContext, placeholder: t.settings.brandContextPlaceholder, save: t.common.save, saved: t.settings.saved }}
          />
        </Card>
        <div className="space-y-6">
          <Card title={t.settings.plan}>
            <div className="mb-5 flex flex-wrap gap-6 text-sm">
              <div>
                <div className="text-muted">{t.settings.planName}</div>
                <div className="font-semibold">{org.plan}</div>
              </div>
              <div>
                <div className="text-muted">{t.settings.status}</div>
                <div className="font-semibold">{org.subscriptionStatus}</div>
              </div>
              {org.currentPeriodEnd && (
                <div>
                  <div className="text-muted">↻</div>
                  <div className="font-semibold">{formatDate(org.currentPeriodEnd, locale)}</div>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <Usage label={t.settings.monitorsUsed} used={monitorCount} limit={org.monitorLimit} locale={locale} />
              <Usage label={t.settings.seatsUsed} used={members.filter((m) => m.active).length} limit={org.seatLimit} locale={locale} />
              <Usage label={t.settings.mentionsUsed} used={mentionCount} limit={org.mentionQuota} locale={locale} />
            </div>
          </Card>
          <Card title={t.settings.dataSources}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.settings.monid}</span>
                <Status ok={Boolean(monid)} okLabel={t.settings.connected} offLabel={t.settings.notConnected} detail={balance} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.settings.anthropic}</span>
                <Status
                  ok={aiEnabled()}
                  okLabel={t.settings.connected}
                  offLabel={t.settings.aiNotConnected}
                  detail={aiEnabled() && isAdmin ? [...new Set([AI_MODEL, AI_ENRICH_MODEL])].join(", ") : undefined}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title={t.settings.team} className="mt-6" bodyClassName="p-0">
        <p className="px-5 pt-4 text-xs text-muted">{t.settings.roleHelp}</p>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-center gap-4 px-5 py-3.5 ${m.active ? "" : "opacity-50"}`}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{m.name.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-muted ltr-nums">{m.email}</div>
              </div>
              <span className="text-xs text-muted">{m.lastLoginAt ? timeAgo(m.lastLoginAt, locale) : "—"}</span>
              {isAdmin && m.role !== "OWNER" && m.id !== user.id && m.active ? (
                <MemberControls id={m.id} role={m.role} roles={t.settings.roles} deactivateLabel={t.settings.deactivate} />
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{t.settings.roles[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <AddMemberForm
            roles={t.settings.roles}
            labels={{ name: t.settings.name, email: t.settings.email, role: t.settings.role, password: t.settings.tempPassword, add: t.settings.invite, error: t.common.forbidden }}
          />
        )}
      </Card>

      {isAdmin && (
        <Card title={t.settings.audit} className="mt-6" bodyClassName="p-0">
          <ul className="divide-y divide-line text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="w-36 shrink-0 text-xs text-muted">{formatDate(l.createdAt, locale, { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="font-medium">{l.userId ? names.get(l.userId) : "system"}</span>
                <code className="rounded bg-canvas px-1.5 py-0.5 text-xs" dir="ltr">{l.action}</code>
                {l.target && <span className="truncate text-xs text-muted" dir="ltr">{l.target}</span>}
              </li>
            ))}
            {logs.length === 0 && <li className="p-6 text-center text-muted">{t.common.noData}</li>}
          </ul>
        </Card>
      )}
    </>
  );
}
