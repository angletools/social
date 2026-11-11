"use client";

import { useTransition } from "react";
import { setLocale } from "@/app/actions";

export function LangToggle({ locale, label, compact }: { locale: "ar" | "en"; label: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setLocale(locale === "ar" ? "en" : "ar"))}
      className={compact ? "btn-ghost px-2.5" : "btn-secondary"}
      lang={locale === "ar" ? "en" : "ar"}
      title={label}
    >
      {compact ? (locale === "ar" ? "EN" : "ع") : label}
    </button>
  );
}
