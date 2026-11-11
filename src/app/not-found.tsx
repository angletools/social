import Link from "next/link";
import { getDict } from "@/lib/i18n";

export default async function NotFound() {
  const { t } = await getDict();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="text-[64px] font-semibold leading-none tracking-tight text-line-strong ltr-nums">404</div>
      <h1 className="mt-4 text-lg font-semibold">{t.errors.notFound}</h1>
      <p className="mt-2 max-w-sm text-[13.5px] text-muted">{t.errors.notFoundBody}</p>
      <Link href="/" className="btn-primary mt-7">
        {t.errors.home}
      </Link>
    </div>
  );
}
