import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { LangToggle } from "@/components/shell/lang-toggle";
import { LoginForm } from "./login-form";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const { t, locale } = await getDict();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="text-xl font-bold">{t.app.name}</span>
          </div>
          <LangToggle locale={locale} label={t.nav.language} />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-semibold tracking-tight">{t.login.title}</h1>
          <p className="mt-2 text-muted">{t.login.subtitle}</p>
          <LoginForm labels={t.login} />
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(19,163,127,.45),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(19,163,127,.25),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <div className="mb-10 space-y-3">
            {[
              { s: "POSITIVE", text: locale === "ar" ? "فتحت حسابي خلال ٥ دقائق 👌" : "Opened my account in 5 minutes 👌" },
              { s: "NEGATIVE", text: locale === "ar" ? "التطبيق علّق وقت افتتاح السوق" : "App froze right at market open" },
              { s: "NEUTRAL", text: locale === "ar" ? "هل الاكتتاب متاح عن طريق التطبيق؟" : "Is the IPO available in the app?" },
            ].map((x, i) => (
              <div
                key={i}
                className="flex max-w-sm items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm backdrop-blur"
                style={{ marginInlineStart: i * 28 }}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${x.s === "POSITIVE" ? "bg-green-400" : x.s === "NEGATIVE" ? "bg-red-400" : "bg-slate-300"}`} />
                {x.text}
              </div>
            ))}
          </div>
          <h2 className="max-w-md text-3xl font-semibold leading-snug">{t.app.tagline}</h2>
        </div>
      </div>
    </div>
  );
}
