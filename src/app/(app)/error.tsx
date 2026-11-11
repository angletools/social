"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useClientDict } from "@/components/client-dict";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  let t: { title: string; body: string; retry: string; home: string } = {
    title: "Something went wrong",
    body: "This page couldn't load. Your data is safe. Try again, or go back to the overview.",
    retry: "Try again",
    home: "Back to overview",
  };
  try {
    const d = useClientDict();
    t = d.locale === "ar" ? { title: "حدث خطأ ما", body: "تعذّر تحميل هذه الصفحة. بياناتك بأمان. حاول مرة أخرى أو ارجع إلى النظرة العامة.", retry: "حاول مرة أخرى", home: "العودة للنظرة العامة" } : t;
  } catch {
    /* provider not mounted */
  }
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <div className="mb-5 h-12 w-12 rounded-full border border-line bg-surface" style={{ backgroundImage: "radial-gradient(circle at 50% 50%, var(--color-sand-500) 0 3px, transparent 4px)" }} />
      <h1 className="text-lg font-semibold">{t.title}</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{t.body}</p>
      {error.digest && <p className="mt-3 text-[11px] text-faint ltr-nums">ref {error.digest}</p>}
      <div className="mt-7 flex gap-2">
        <button type="button" className="btn-primary" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> {t.retry}
        </button>
        <Link href="/" className="btn-secondary">
          {t.home}
        </Link>
      </div>
    </div>
  );
}
