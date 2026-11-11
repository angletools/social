import Link from "next/link";
import { MessageCircleQuestion, TriangleAlert } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { dataSource } from "@/lib/ingest/sync";
import { INBOX_INTENTS } from "@/lib/analytics";
import { getWorkerStatus } from "@/lib/system";
import { NavLinks, SettingsLink } from "@/components/shell/nav-links";
import { LangToggle } from "@/components/shell/lang-toggle";
import { Notifications } from "@/components/shell/notifications";
import { MobileNav } from "@/components/shell/mobile-nav";
import { GlobalSearch } from "@/components/shell/search";
import { UserMenu } from "@/components/shell/user-menu";
import { FeedbackHost } from "@/components/feedback";
import { ClientDictProvider } from "@/components/client-dict";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

function Brand({ name, org }: { name: string; org: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-8 w-8" />
      <div className="min-w-0 leading-tight">
        <div className="text-[15px] font-semibold">{name}</div>
        <div className="max-w-[10.5rem] truncate text-xs text-muted">{org}</div>
      </div>
    </Link>
  );
}

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
  const brand = <Brand name={t.app.name} org={user.organization.name} />;
  const labels = t.nav as unknown as Record<string, string>;
  const groups = t.nav.groups as Record<string, string>;
  const badges = { alerts: unread, inbox: awaiting };
  const demo = dataSource() === "demo";

  return (
    <ClientDictProvider value={{ locale, toasts: t.toasts, common: t.common }}>
      <div className="flex min-h-screen">
        <FeedbackHost
          labels={{ confirm: t.common.confirm, cancel: t.common.cancel }}
        />
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-e border-line px-3 py-4 lg:flex">
          <div className="mb-7 px-2">{brand}</div>
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            <NavLinks labels={labels} groups={groups} badges={badges} />
          </div>
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <SettingsLink label={t.nav.settings} />
            {demo && (
              <Link
                href="/settings#connections"
                className="block rounded-lg border border-sand-100 bg-sand-50 px-3 py-2.5 text-xs leading-relaxed text-sand-700"
              >
                <span className="font-semibold">{t.common.demoMode}</span>
                <span className="mt-0.5 block text-sand-700/80">
                  {t.common.demoModeHint}
                </span>
              </Link>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:px-8">
            <MobileNav
              labels={labels}
              groups={groups}
              badges={badges}
              brand={brand}
            />
            <GlobalSearch placeholder={t.nav.search} />
            <div className="ms-auto flex items-center gap-1">
              <Link
                href="/assistant"
                className="btn-ghost hidden sm:inline-flex"
              >
                <MessageCircleQuestion
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.8}
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
              <div className="ms-1">
                <UserMenu
                  name={user.name}
                  email={user.email}
                  role={t.settings.roles[user.role]}
                  theme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)}
                  labels={{
                    theme: t.nav.theme,
                    profile: t.nav.profile,
                    settings: t.nav.settings,
                    logout: t.nav.logout,
                  }}
                />
              </div>
            </div>
          </header>
          {!worker.alive && hasRole(user, "ADMIN") && (
            <div className="flex items-start gap-2.5 border-b border-warn/30 bg-warn/10 px-4 py-2.5 text-[13px] text-ink lg:px-8">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t.nav.workerDown}</span>
            </div>
          )}
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-7 lg:px-8 lg:py-9">
            {children}
          </main>
        </div>
      </div>
    </ClientDictProvider>
  );
}
