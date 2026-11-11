import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

/** "+5", "−13" (true minus sign), "0". */
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n)}`;

/** Wraps text in a left-to-right isolate so "−13" or "+12%" never flips inside an Arabic sentence. */
export const ltr = (s: string) => `\u2066${s}\u2069`;

export function formatNumber(n: number, locale: string) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    notation: n >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Default display timezone; organizations can override it in settings. */
export const DEFAULT_TZ = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? "Asia/Riyadh";

export function formatDate(d: Date | string, locale: string, opts?: Intl.DateTimeFormatOptions, timeZone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
    dateStyle: "medium",
    timeZone,
    ...opts,
  }).format(new Date(d));
}

/** Greeting-friendly hour in the given timezone (0-23). */
export function hourIn(timeZone = DEFAULT_TZ, d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(d));
}

export function timeAgo(d: Date | string, locale: string) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** Compact relative time for dense lists: "3m", "2h", "4d" / "3 د", "2 س", "4 ي". */
export function timeShort(d: Date | string, locale: string) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  const [n, unit] = s < 3600 ? [Math.max(1, Math.round(s / 60)), 0] : s < 86400 ? [Math.round(s / 3600), 1] : [Math.round(s / 86400), 2];
  return locale === "ar" ? `${n} ${["د", "س", "ي"][unit]}` : `${n}${["m", "h", "d"][unit]}`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/** Detects Arabic script; used before AI enrichment runs. */
export function guessLang(text: string): "ar" | "en" {
  const ar = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar >= latin ? "ar" : "en";
}
