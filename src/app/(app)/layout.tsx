import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import { dataSource } from "@/lib/ingest/sync";
import { logout } from "@/app/actions";
import { NavLinks } from "@/components/shell/nav-links";
import { LangToggle } from "@/components/shell/lang-toggle";
import { Notifications } from "@/components/shell/notifications";
import { MobileNav } from "@/components/shell/mobile-nav";

function Brand({ name, org }: { name: string; org: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="h-9 w-9" />
      <div className="leading-tight">
        <div className="text-lg font-bold">{name}</div>
        <div className="max-w-[10rem] truncate text-xs text-muted">{org}</div>
      </div>
    </div>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const notes = await db.notification.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const unread = notes.filter((n) => !n.readAt).length;
  const brand = <Brand name={t.app.name} org={user.organization.name} />;
  const labels = t.nav as unknown as Record<string, string>;
  const badges = { alerts: unread };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-line p-4 lg:flex">
        <div className="mb-8 px-1">{brand}</div>
        <NavLinks labels={labels} badges={badges} />
        <div className="mt-auto space-y-3">
          {dataSource() === "demo" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              <b>{t.common.demoMode}</b>
              <p className="mt-1">{t.common.demoModeHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted">{t.settings.roles[user.role]}</div>
            </div>
            <form action={logout}>
              <button className="btn-ghost px-2 py-2" title={t.nav.logout} aria-label={t.nav.logout}>
                <LogOut className="h-4 w-4 rtl:rotate-180" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur lg:justify-end lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileNav labels={labels} badges={badges} brand={brand} />
            <span className="font-bold">{t.app.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle locale={locale} label={t.nav.language} />
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
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
