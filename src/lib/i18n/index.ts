import "server-only";
import { cookies } from "next/headers";
import en, { type Dict } from "./en";
import ar from "./ar";

export type Locale = "ar" | "en";
export const LOCALE_COOKIE = "rasd_locale";

const dicts: Record<Locale, Dict> = { en, ar };

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (v === "ar" || v === "en") return v;
  return process.env.DEFAULT_LOCALE === "en" ? "en" : "ar";
}

export async function getDict() {
  const locale = await getLocale();
  return { locale, t: dicts[locale], dir: locale === "ar" ? ("rtl" as const) : ("ltr" as const) };
}

export function dictFor(locale: Locale) {
  return dicts[locale];
}

export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export type { Dict };
