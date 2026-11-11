import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { ruleSentence } from "@/lib/alert-rules";
import { AlertsView, type NoteDay, type RuleView } from "./alerts-view";

/** Local calendar day (YYYY-MM-DD) in a timezone. */
const dayKey = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export default async function AlertsPage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const tz = user.organization.timezone;
  const [rules, notes, monitors] = await Promise.all([
    db.alertRule.findMany({ where: { organizationId: user.organizationId }, include: { monitor: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.notification.findMany({
      where: { organizationId: user.organizationId, OR: [{ userId: null }, { userId: user.id }] },
      include: { rule: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.monitor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: [{ isCompetitor: "asc" }, { createdAt: "asc" }] }),
  ]);
  const canEdit = hasRole(user, "ADMIN");
  const tp = t.alertsPage;
  const loc = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US";
  const time = (d: Date) => new Intl.DateTimeFormat(loc, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  const shortDate = (d: Date) => new Intl.DateTimeFormat(loc, { timeZone: tz, day: "numeric", month: "short" }).format(d);
  const today = dayKey(new Date(), tz);
  const yesterday = dayKey(new Date(Date.now() - 86400_000), tz);
  const when = (d: Date) => {
    const k = dayKey(d, tz);
    return k === today ? time(d) : k === yesterday ? tp.yesterdayAt : shortDate(d);
  };

  const ruleViews: RuleView[] = rules.map((r) => {
    let hook: string | null = null;
    if (r.webhookUrl) {
      try {
        hook = new URL(r.webhookUrl).hostname.includes("slack") ? "Slack" : "Teams";
      } catch {
        hook = "Webhook";
      }
    }
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      sentence: ruleSentence(r, tp, locale),
      scope: r.monitor?.name ?? t.alerts.anyMonitor,
      last: !r.enabled ? tp.paused : r.lastTriggeredAt ? fmt(tp.lastAlert, { when: when(r.lastTriggeredAt) }) : tp.neverFired,
      enabled: r.enabled,
      emails: r.notifyEmail ? r.emails.length : 0,
      hook,
    };
  });

  const days: NoteDay[] = [];
  for (const n of notes) {
    const k = dayKey(n.createdAt, tz);
    const label = k === today ? tp.today : k === yesterday ? tp.yesterday : new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(n.createdAt);
    let day = days.at(-1);
    if (!day || day.key !== k) days.push((day = { key: k, label, items: [] }));
    day.items.push({
      id: n.id,
      severity: n.severity,
      title: locale === "ar" ? n.titleAr : n.titleEn,
      body: locale === "ar" ? n.bodyAr : n.bodyEn,
      rule: n.rule?.name ?? null,
      time: k === today || k === yesterday ? time(n.createdAt) : shortDate(n.createdAt),
      link: n.link,
    });
  }

  return (
    <AlertsView
      title={t.alerts.title}
      rules={ruleViews}
      days={days}
      monitors={monitors}
      canEdit={canEdit}
      locale={locale}
      t={tp}
      labels={{ anyMonitor: t.alerts.anyMonitor, confirmDelete: t.common.confirmDelete, delete: t.common.delete, recent: t.alerts.recent }}
    />
  );
}
