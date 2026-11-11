import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { LangToggle } from "@/components/shell/lang-toggle";
import { Avatar } from "@/components/avatar";
import { PlatformIcon } from "@/components/platform";
import { Sparkline } from "@/components/sparkline";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const { t, locale } = await getDict();
  if (await getCurrentUser()) redirect("/");
  const ar = locale === "ar";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col bg-surface p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <span dir="ltr" className="text-[24px] font-semibold leading-none tracking-[-0.03em]" aria-label={t.app.name}>
            angle<span className="text-[19px] font-normal tracking-normal text-faint"> /social</span>
          </span>
          <LangToggle locale={locale} label={t.nav.language} />
        </div>
        <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col justify-center py-14">
          <h1 className="text-[26px] font-semibold tracking-tight">{t.login.title}</h1>
          <p className="mt-2 text-[14px] text-muted">{t.login.subtitle}</p>
          <LoginForm labels={t.login} />
        </div>
        <p className="text-xs text-faint">© {new Date().getFullYear()} {t.app.name}</p>
      </div>

      <div className="relative hidden overflow-hidden border-s border-line bg-canvas lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{ backgroundImage: "radial-gradient(var(--color-line-strong) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
        <div className="relative mx-auto w-full max-w-lg">
          <p className="mb-10 max-w-md text-[22px] font-semibold leading-snug tracking-tight">{t.login.pitch}</p>

          <div className="space-y-3">
            <div className="card flex items-center justify-between p-5 shadow-[var(--shadow-pop)]">
              <div>
                <div className="text-xs text-muted">{t.sentiment.net}</div>
                <div className="mt-1 text-[28px] font-semibold leading-none ltr-nums">+18</div>
                <div className="mt-2 text-xs text-pos ltr-nums">↗ +6 {t.overview.vsPrev}</div>
              </div>
              <div className="w-40">
                <Sparkline values={[3, 5, 4, 8, 7, 11, 10, 14, 13, 18]} height={44} width={150} />
              </div>
            </div>

            <div className="card p-4 shadow-[var(--shadow-pop)] ms-10">
              <div className="flex items-center gap-2.5">
                <Avatar name="Saud" seed="saud" size={30} />
                <div className="text-xs">
                  <div className="font-semibold">{ar ? "سعود | استثمار" : "Saud · Investing"}</div>
                  <div className="flex items-center gap-1 text-faint">
                    <PlatformIcon platform="X" size="xs" /> {ar ? "قبل 5 دقائق" : "5 min ago"}
                  </div>
                </div>
              </div>
              <p dir="rtl" className="mt-2.5 text-[14px] leading-relaxed">ما شاء الله عليكم 🙂 ثالث مرة هالأسبوع التطبيق يطلعني وقت التداول، مبدعين</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-neg">
                  <span className="h-2 w-2 rounded-full bg-neg" />
                  {t.sentiment.NEGATIVE}
                </span>
                <span className="inline-flex h-5 items-center rounded-md bg-plum/[0.08] px-1.5 text-[11.5px] font-medium text-plum">{t.engage.sarcasm}</span>
                <span className="text-muted">{t.dialects.SAUDI}</span>
              </div>
            </div>

            <div className="card p-4 shadow-[var(--shadow-pop)] me-10">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-sand-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-sand-700">AI</span>
                <span className="text-xs font-medium">{t.inbox.draft}</span>
              </div>
              <p dir="rtl" className="mt-2 text-[14px] leading-relaxed text-ink/90">نعتذر لك عن الإزعاج 🙏 فريقنا يتابع المشكلة الحين، تواصل معنا على الخاص ونخدمك أول بأول.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
