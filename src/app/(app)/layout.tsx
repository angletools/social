import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { dataSource } from "@/lib/ingest/sync";
import { INBOX_INTENTS } from "@/lib/analytics";
import { getWorkerStatus } from "@/lib/system";
import { Logo, Rail, TabBar } from "@/components/shell/nav-links";
import { LangToggle } from "@/components/shell/lang-toggle";
import { Notifications } from "@/components/shell/notifications";
import { GlobalSearch } from "@/components/shell/search";
import { UserMenu } from "@/components/shell/user-menu";
import { FeedbackHost } from "@/components/feedback";
import { ClientDictProvider } from "@/components/client-dict";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const orgId = user.organizationId;
  const [notes, awaiting, worker] = await Promise.all([
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
  ]);
  const unread = notes.filter((n) => !n.readAt).length;
  const labels = t.nav as unknown as Record<string, string>;
  const badges = { alerts: unread, inbox: awaiting };
  const demo = dataSource() === "demo";
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const menu = (placement: "rail" | "below") => (
    <UserMenu
      name={user.name}
      email={user.email}
      role={t.settings.roles[user.role]}
      theme={theme}
      placement={placement}
      extra={placement === "below" ? labels : null}
      labels={{
        theme: t.nav.theme,
        profile: t.nav.profile,
        settings: t.nav.settings,
        logout: t.nav.logout,
      }}
    />
  );

  return (
    <ClientDictProvider value={{ locale, toasts: t.toasts, common: t.common }}>
      <div className="flex min-h-screen">
        <FeedbackHost
          labels={{ confirm: t.common.confirm, cancel: t.common.cancel }}
        />
        <Rail
          labels={labels}
          badges={badges}
          themeLabels={{ light: t.nav.theme.light, dark: t.nav.theme.dark }}
          account={menu("rail")}
        />

        <div className="app-col flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 bg-canvas/85 px-4 backdrop-blur md:px-10">
            <Link href="/" aria-label={t.app.name} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rail md:hidden">
              <Logo size={22} />
            </Link>
            <GlobalSearch placeholder={t.nav.search} />
            <div className="ms-auto flex items-center gap-1">
              {demo && (
                <Link
                  href="/settings#connections"
                  title={t.common.demoModeHint}
                  className="me-1 hidden h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted hover:text-ink sm:inline-flex"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-sand-500" />
                  {t.common.demoMode}
                </Link>
              )}
              <Link
                href="/assistant"
                className="btn-ghost hidden lg:inline-flex"
              >
                <MessageCircleQuestion
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.6}
                />{" "}
                {t.nav.assistant}
              </Link>
              <LangToggle locale={locale} label={t.nav.language} compact />
              <Notifications
                labels={{
                  title: t.nav.notifications,
                  empty: t.nav.noNotifications,
                  markAll: t.nav.markAllRead,
                }}
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
              <div className="ms-1 md:hidden">{menu("below")}</div>
            </div>
          </header>
          {!worker.alive && hasRole(user, "ADMIN") && (
            <div className="no-print mx-4 mb-1 flex items-center gap-2 text-[12.5px] text-muted md:mx-10">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              <span className="truncate" title={t.nav.workerDown}>{t.nav.workerDown}</span>
            </div>
          )}
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-5 pb-28 md:px-10 md:pt-7 md:pb-12">
            {children}
          </main>
        </div>
        <TabBar labels={labels} badges={badges} />
      </div>
    </ClientDictProvider>
  );
}
