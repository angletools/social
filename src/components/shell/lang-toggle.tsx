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
      className={compact ? "flex h-[38px] min-w-[38px] items-center justify-center rounded-[11px] px-2 text-[13px] text-[#bdbdbd] hover:bg-[#161616] hover:text-white" : "btn-secondary"}
      lang={locale === "ar" ? "en" : "ar"}
      title={label}
    >
      {compact ? (locale === "ar" ? "EN" : "ع") : label}
    </button>
  );
}
