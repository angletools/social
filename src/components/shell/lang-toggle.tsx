"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/actions";

export function LangToggle({ locale, label }: { locale: "ar" | "en"; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setLocale(locale === "ar" ? "en" : "ar"))}
      className="btn-secondary px-3 py-2"
    >
      <Languages className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
