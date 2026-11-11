import { CheckCircle2, CircleAlert } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { cn, formatDate, formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled, AI_ENRICH_MODEL, AI_MODEL } from "@/lib/ai/client";
import { MonidClient } from "@/lib/monid/client";
import { emailConfigured, getWorkerStatus } from "@/lib/system";
import { PageHeader } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { AddMemberForm, MemberControls, OrgForm, PasswordForm, ProfileForm, WeeklyReportForm } from "./forms";

function Section({ id, title, description, children, className }: { id: string; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className="scroll-mt-24 grid gap-x-10 gap-y-4 border-t border-line py-8 first-of-type:border-0 first-of-type:pt-0 lg:grid-cols-[15rem_1fr]">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      <div className={cn("min-w-0", className)}>{children}</div>
    </section>
  );
}

function Usage({ label, used, limit, locale }: { label: string; used: number; limit: number; locale: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="text-muted ltr-nums">
          {formatNumber(used, locale)} / {formatNumber(limit, locale)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${pct > 90 ? "bg-neg" : pct > 70 ? "bg-warn" : "bg-brand-600"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusRow({ label, ok, okLabel, offLabel, detail }: { label: string; ok: boolean; okLabel: string; offLabel: string; detail?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="text-[13.5px]">{label}</span>
      <span className={cn("flex items-center gap-1.5 text-[13px]", ok ? "text-pos" : "text-sand-700")}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
        {ok ? okLabel : offLabel}
        {detail && <span className="text-faint">· {detail}</span>}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const org = user.organization;
  const isAdmin = hasRole(user, "ADMIN");
  const since = new Date(Date.now() - 30 * 86400_000);
  const [members, monitorCount, mentionCount, logs, worker] = await Promise.all([
    db.user.findMany({ where: { organizationId: org.id }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] }),
    db.monitor.count({ where: { organizationId: org.id } }),
    db.mention.count({ where: { organizationId: org.id, createdAt: { gte: since } } }),
    isAdmin ? db.auditLog.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 20 }) : Promise.resolve([]),
    getWorkerStatus(),
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

  const nav = [
    ["profile", t.profile.title],
    ["organization", t.settings.organization],
    ["team", t.settings.team],
    ...(isAdmin ? [["weekly", t.weekly.title]] : []),
    ["connections", t.settings.dataSources],
    ...(isAdmin ? [["activity", t.settings.audit]] : []),
  ];

  return (
    <>
      <PageHeader title={t.settings.title} />
      <nav className="sticky top-14 z-20 -mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-line bg-canvas/90 px-4 py-2 backdrop-blur lg:-mx-8 lg:px-8">
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] text-muted hover:bg-sunken hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <Section id="profile" title={t.profile.title}>
        <div className="card divide-y divide-line">
          <div className="p-5">
            <ProfileForm name={user.name} locale={user.locale} labels={{ name: t.profile.name, language: t.profile.language, save: t.common.save }} />
          </div>
          <div className="p-5">
            <h3 className="mb-4 text-[13.5px] font-semibold">{t.profile.password}</h3>
            <PasswordForm labels={{ current: t.profile.current, next: t.profile.next, nextHint: t.profile.nextHint, wrong: t.profile.wrong, short: t.profile.short, save: t.common.save }} />
          </div>
        </div>
      </Section>

      <Section id="organization" title={t.settings.organization} description={t.settings.brandContext}>
        <div className="space-y-5">
          <div className="card p-5">
            <OrgForm
              name={org.name}
              brandContext={org.brandContext ?? ""}
              complianceRules={org.complianceRules ?? ""}
              disabled={!isAdmin}
              labels={{
                name: t.settings.orgName,
                context: t.settings.brandContext,
                placeholder: t.settings.brandContextPlaceholder,
                compliance: t.settings.compliance,
                compliancePlaceholder: t.settings.compliancePlaceholder,
                save: t.common.save,
                saved: t.common.saved,
              }}
            />
          </div>
          <div className="card p-5">
            <div className="mb-5 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <div>
                <div className="text-faint">{t.settings.planName}</div>
                <div className="mt-0.5 font-semibold">{org.plan}</div>
              </div>
              <div>
                <div className="text-faint">{t.settings.status}</div>
                <div className="mt-0.5 font-semibold">{org.subscriptionStatus}</div>
              </div>
              {org.currentPeriodEnd && (
                <div>
                  <div className="text-faint">↻</div>
                  <div className="mt-0.5 font-semibold">{formatDate(org.currentPeriodEnd, locale, undefined, org.timezone)}</div>
                </div>
              )}
              <div>
                <div className="text-faint">{t.settings.timezone}</div>
                <div className="mt-0.5 font-semibold ltr-nums">{org.timezone}</div>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Usage label={t.settings.monitorsUsed} used={monitorCount} limit={org.monitorLimit} locale={locale} />
              <Usage label={t.settings.seatsUsed} used={members.filter((m) => m.active).length} limit={org.seatLimit} locale={locale} />
              <Usage label={t.settings.mentionsUsed} used={mentionCount} limit={org.mentionQuota} locale={locale} />
            </div>
          </div>
        </div>
      </Section>

      <Section id="team" title={t.settings.team} description={t.settings.roleHelp}>
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !m.active && "opacity-50")}>
                <Avatar name={m.name} seed={m.email} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">
                    {m.name}
                    {m.id === user.id && <span className="ms-1.5 text-xs font-normal text-faint">({t.common.you})</span>}
                  </div>
                  <div className="truncate text-xs text-muted ltr-nums">{m.email}</div>
                </div>
                <span className="hidden text-xs text-faint sm:inline">{m.lastLoginAt ? timeAgo(m.lastLoginAt, locale) : "—"}</span>
                {isAdmin && m.role !== "OWNER" && m.id !== user.id && m.active ? (
                  <MemberControls id={m.id} role={m.role} roles={t.settings.roles} deactivateLabel={t.settings.deactivate} />
                ) : (
                  <span className="chip">{t.settings.roles[m.role]}</span>
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
        </div>
      </Section>

      {isAdmin && (
        <Section id="weekly" title={t.weekly.title} description={t.weekly.desc}>
          <div className="card p-5">
            <WeeklyReportForm
              enabled={org.weeklyReportEnabled}
              day={org.weeklyReportDay}
              locale={org.weeklyReportLocale}
              recipients={org.weeklyReportRecipients}
              labels={{ ...t.weekly, save: t.common.save, saved: t.common.saved }}
            />
            {org.weeklyReportLastSentAt && (
              <p className="mt-4 text-xs text-faint">
                {t.weekly.lastSent}: {formatDate(org.weeklyReportLastSentAt, locale, { dateStyle: "medium", timeStyle: "short" }, org.timezone)}
              </p>
            )}
          </div>
        </Section>
      )}

      <Section id="connections" title={t.settings.dataSources}>
        <div className="card divide-y divide-line px-5">
          <StatusRow label={t.settings.monid} ok={Boolean(monid)} okLabel={t.settings.connected} offLabel={t.settings.notConnected} detail={balance} />
          <StatusRow
            label={t.settings.anthropic}
            ok={aiEnabled()}
            okLabel={t.settings.connected}
            offLabel={t.settings.aiNotConnected}
            detail={aiEnabled() && isAdmin ? [...new Set([AI_MODEL, AI_ENRICH_MODEL])].join(", ") : undefined}
          />
          <StatusRow
            label={t.system.worker}
            ok={worker.alive}
            okLabel={t.system.online}
            offLabel={t.system.offline}
            detail={worker.lastBeat ? `${t.system.lastBeat} ${timeAgo(worker.lastBeat, locale)}` : undefined}
          />
          <StatusRow label={t.system.email} ok={emailConfigured()} okLabel={t.system.configured} offLabel={t.system.notConfigured} />
        </div>
      </Section>

      {isAdmin && (
        <Section id="activity" title={t.settings.audit}>
          <div className="card divide-y divide-line">
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-32 shrink-0 text-xs text-faint ltr-nums">{formatDate(l.createdAt, locale, { dateStyle: "short", timeStyle: "short" }, org.timezone)}</span>
                <span className="font-medium">{l.userId ? names.get(l.userId) : "system"}</span>
                <code className="rounded bg-sunken px-1.5 py-0.5 text-[11.5px] text-muted">
                  {l.action}
                </code>
                {l.target && (
                  <span className="truncate text-xs text-faint" dir="ltr">
                    {l.target}
                  </span>
                )}
              </div>
            ))}
            {logs.length === 0 && <p className="p-6 text-center text-[13px] text-muted">{t.common.noData}</p>}
          </div>
        </Section>
      )}
    </>
  );
}
