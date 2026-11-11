import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { LoginForm, LoginLanguage } from "./login-form";
import { Stage } from "./stage";

export const metadata = { title: "Sign in" };

const COLS = 60;
const ROWS = 18;

/** Decorative dot-matrix of a month of conversation: two readings a day, with a late spike. */
function matrix() {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const dots: { x: number; y: number; on: boolean; a: number }[] = [];
  for (let c = 0; c < COLS; c++) {
    const t = c / (COLS - 1);
    const base = 0.28 + 0.1 * Math.sin(t * 9) + 0.06 * Math.sin(t * 23);
    const spike = 0.62 * Math.exp(-(((t - 0.86) / 0.035) ** 2)) + 0.22 * Math.exp(-(((t - 0.93) / 0.03) ** 2));
    const lit = Math.max(1, Math.round(Math.min(1, base + spike + (rnd() - 0.5) * 0.08) * ROWS));
    for (let r = 0; r < ROWS; r++) {
      dots.push({ x: 5 + c * 10, y: 5 + r * 10, on: ROWS - r <= lit, a: 0.22 + 0.78 * (1 - r / (ROWS - 1)) });
    }
  }
  return dots;
}
const DOTS = matrix();

export default async function LoginPage() {
  const { t, locale, dir } = await getDict();
  if (await getCurrentUser()) redirect("/");
  const ar = locale === "ar";
  const day = 86400_000;
  const tick = new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: ar ? "long" : "short" });
  const ticks = [28, 21, 14, 7, 0].map((n) => tick.format(new Date(Date.now() - n * day)));

  return (
    <div dir={dir} className="grid min-h-dvh bg-black p-3 sm:p-4 lg:grid-cols-[600px_minmax(0,1fr)]">
      <section className="flex min-h-[calc(100dvh-24px)] flex-col rounded-[22px] bg-canvas px-5 py-6 sm:min-h-[calc(100dvh-32px)] sm:rounded-[26px] sm:px-10 sm:py-8">
        <header className="flex h-10 items-center justify-between gap-4">
          <span dir="ltr" aria-label={t.app.name} className="text-[25px] leading-none font-semibold tracking-[-0.03em]">
            angle<span className="text-[20px] font-normal tracking-normal text-faint"> /social</span>
          </span>
          <LoginLanguage locale={locale} />
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px]">
            <h1 className="text-[28px] leading-[1.3] font-semibold sm:text-[30px]">{t.login.title}</h1>
            <p className="mt-2 text-[15px] leading-[1.75] text-muted">{t.login.subtitle}</p>
            <LoginForm labels={{ ...t.login, ...t.loginPage }} />
          </div>
        </div>

        <footer className="text-[12.5px] text-faint">
          <span dir="ltr">© {new Date().getFullYear()} {t.app.name}</span>
        </footer>
      </section>

      <Stage rtl={dir === "rtl"}>
        <p className={ar ? "text-[28px] leading-[1.75] font-medium text-white" : "text-[28px] leading-[1.45] font-medium tracking-[-0.01em] text-white"}>{t.login.pitch}</p>
        <div className="flex flex-col gap-3.5">
          <div className="flex items-baseline justify-between gap-4 text-[13.5px] text-white/62">
            <span>{t.loginPage.chartLabel}</span>
            <span className="flex items-baseline gap-2.5">
              <span dir="ltr" className="text-[20px] font-semibold text-white tnum">945</span>
              <span dir="ltr" className="text-[13.5px] font-semibold text-[#ffb199]">↗ 13%</span>
            </span>
          </div>
          <svg viewBox="0 0 600 180" className="block h-auto w-full" style={{ direction: "ltr" }}>
            {DOTS.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={2.4} fill={d.on ? `rgba(255,214,200,${d.a.toFixed(2)})` : "rgba(255,255,255,0.07)"} />
            ))}
          </svg>
          <div dir="ltr" className="flex justify-between text-[12px] text-white/45 tnum">
            {ticks.map((x) => (
              <span key={x} dir="auto">{x}</span>
            ))}
          </div>
        </div>
      </Stage>
    </div>
  );
}
