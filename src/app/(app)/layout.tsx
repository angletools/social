import Link from "next/link";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { dataSource } from "@/lib/ingest/sync";
import { INBOX_INTENTS } from "@/lib/analytics";
import { getWorkerStatus } from "@/lib/system";
import { HistoryArrows, Sidebar, TabBar } from "@/components/shell/nav-links";
import { LangToggle } from "@/components/shell/lang-toggle";
import { Notifications } from "@/components/shell/notifications";
import { GlobalSearch } from "@/components/shell/search";
import { UserMenu } from "@/components/shell/user-menu";
import { FeedbackHost } from "@/components/feedback";
import { ClientDictProvider } from "@/components/client-dict";
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE, THEME_COOKIE, parseTheme } from "@/lib/theme";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { t, locale, dir } = await getDict();
  const orgId = user.organizationId;
  const [notes, awaiting, worker, monitors] = await Promise.all([
    db.notification.findMany({
      where: {
        organizationId: orgId,
        OR: [{ userId: null }, { userId: user.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.mention.count({
      where: {
        organizationId: orgId,
        relevant: true,
        repliedAt: null,
        status: { not: "ARCHIVED" },
        publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        OR: [{ intent: { in: INBOX_INTENTS } }, { isRisk: true }],
      },
    }),
    getWorkerStatus(),
    db.monitor.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, type: true, isCompetitor: true, status: true },
      orderBy: [{ isCompetitor: "asc" }, { createdAt: "asc" }],
      take: 8,
    }),
  ]);
  const unread = notes.filter((n) => !n.readAt).length;
  const labels = t.nav as unknown as Record<string, string>;
  const badges = { alerts: unread, inbox: awaiting };
  const demo = dataSource() === "demo";
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const account = {
    name: user.name,
    email: user.email,
    role: t.settings.roles[user.role],
    theme,
    labels: { theme: t.nav.theme, profile: t.nav.profile, settings: t.nav.settings, logout: t.nav.logout },
  };

  return (
    <ClientDictProvider value={{ locale, toasts: t.toasts, common: t.common }}>
      <div className="flex min-h-dvh bg-black">
        <FeedbackHost labels={{ confirm: t.common.confirm, cancel: t.common.cancel, retry: t.states.retry, dismiss: t.states.dismiss }} />
        <Sidebar
          dir={dir}
          labels={labels}
          themeLabels={{ light: t.nav.theme.light, dark: t.nav.theme.dark }}
          badges={badges}
          org={user.organization.name}
          monitors={monitors.map((m) => ({ id: m.id, name: m.name, type: m.type, competitor: m.isCompetitor, live: m.status === "ACTIVE" }))}
          initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}
          account={account}
        />

        <div className="app-col flex min-w-0 flex-1 flex-col bg-black">
          <header className="no-print sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-1.5 bg-black px-3 md:px-[18px]">
            <Link href="/" aria-label={t.app.name} className="me-2 text-[20px] font-semibold tracking-[-0.03em] text-white md:hidden">
              <span dir="ltr">
                angle<span className="font-normal text-[#7a7a7a]"> /social</span>
              </span>
            </Link>
            <HistoryArrows dir={dir} labels={{ back: t.nav.back, forward: t.nav.forward }} />
            <div className="ms-auto flex min-w-0 items-center gap-1.5 md:gap-2.5">
              {demo && (
                <Link href="/settings#connections" title={t.common.demoModeHint} className="hidden h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#8f8f8f] hover:text-white lg:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-sand-500" />
                  {t.common.demoMode}
                </Link>
              )}
              <div className="hidden sm:block sm:w-[320px]">
                <GlobalSearch placeholder={t.nav.search} />
              </div>
              <LangToggle locale={locale} label={t.nav.language} compact />
              <Notifications
                labels={{ title: t.nav.notifications, empty: t.nav.noNotifications, markAll: t.nav.markAllRead }}
                items={notes.map((n) => ({
                  id: n.id,
                  title: locale === "ar" ? n.titleAr : n.titleEn,
                  body: locale === "ar" ? n.bodyAr : n.bodyEn,
                  link: n.link,
                  severity: n.severity,
                  unread: !n.readAt,
                  when: timeAgo(n.createdAt, locale),
                }))}
              />
              <div className="md:hidden">
                <UserMenu {...account} placement="below" extra={labels} />
              </div>
            </div>
          </header>
          <div className="sheet flex min-h-0 flex-1 flex-col bg-canvas md:rounded-ss-[26px]">
            {!worker.alive && hasRole(user, "ADMIN") && (
              <div className="no-print mx-4 mt-4 flex items-center gap-2 text-[12.5px] text-muted md:mx-10">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                <span className="truncate" title={t.nav.workerDown}>{t.nav.workerDown}</span>
              </div>
            )}
            <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-28 md:px-10 md:pt-9 md:pb-12">{children}</main>
          </div>
        </div>
        <TabBar labels={labels} badges={badges} />
      </div>
    </ClientDictProvider>
  );
}
