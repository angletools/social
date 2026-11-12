import { getDict } from "@/lib/i18n";
import { AccessForm } from "./forms";
export const metadata = { title: "Account access", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { locale, dir } = await getDict(), { token } = await searchParams;
  return <main dir={dir} className="flex min-h-dvh items-center justify-center bg-canvas px-5"><section className="card w-full max-w-md p-6 sm:p-8"><p className="mb-8 text-lg font-semibold" dir="ltr">angle /social</p><h1 className="mb-3 text-2xl font-semibold">{locale === "ar" ? (token ? "تعيين كلمة المرور" : "استعادة الوصول") : (token ? "Set your password" : "Recover access")}</h1><p className="mb-6 text-sm text-muted">{locale === "ar" ? "وصول آمن إلى مساحة عمل فريقك." : "Secure access to your team’s workspace."}</p><AccessForm token={token} locale={locale} /></section></main>;
}
