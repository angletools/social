"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reprocessClassifications } from "@/app/classification-actions";
import { saveAIBudget } from "./actions";

export function AIBudget({ limit, used, uncertain, locale, canManage }: { limit: number; used: number; uncertain: number; locale: string; canManage: boolean }) {
  const ar = locale === "ar", router = useRouter();
  const [value, setValue] = useState(String(limit)), [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <section className="card p-5 sm:p-6">
    <h3 className="font-semibold">{ar ? "رصيد الذكاء الاصطناعي الشهري" : "Monthly AI allowance"}</h3>
    <p className="mt-2 text-sm text-muted">{ar ? `${used.toLocaleString()} من ${limit.toLocaleString()} وحدة نصية مستخدمة أو محجوزة هذا الشهر.` : `${used.toLocaleString()} of ${limit.toLocaleString()} tokens used or reserved this calendar month.`}</p>
    <p className="mt-2 text-xs text-faint">{ar ? "يشمل الإدخال والإخراج والذاكرة المؤقتة لكل أدوات الذكاء الاصطناعي. تُحجز الطلبات غير المؤكدة احتياطيًا. هذا حد استخدام وليس مبلغًا ماليًا." : "Covers input, output and cached input across all AI features. Uncertain requests keep their reservation. This is a usage limit, not a currency budget."} {uncertain > 0 && (ar ? `طلبات محجوزة: ${uncertain}.` : `${uncertain} reserved requests.`)}</p>
    {canManage && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); start(async () => { try { const r = await saveAIBudget(Number(value)); setMessage(r.ok ? (ar ? "تم الحفظ" : "Saved") : (ar ? "تحقق من الحد" : "Check the limit")); if (r.ok) router.refresh(); } catch { setMessage(ar ? "تعذر الحفظ" : "Could not save"); } }); }}>
      <label className="flex flex-col gap-1 text-sm">{ar ? "الحد الشهري (صفر لإيقاف الطلبات)" : "Monthly limit (0 pauses new requests)"}<input className="input w-full sm:w-64" type="number" min={0} max={100000000} step={1000} required value={value} onChange={e => setValue(e.target.value)} /></label>
      <button className="btn-secondary" disabled={pending}>{ar ? "حفظ" : "Save"}</button><p role="status" className="text-sm text-muted">{message}</p>
    </form>}
  </section>;
}

export function ReprocessClassifications({ locale, enabled, pendingCount }: { locale: string; enabled: boolean; pendingCount: number }) {
  const ar = locale === "ar", router = useRouter();
  const [count, setCount] = useState(200), [message, setMessage] = useState(""), [pending, start] = useTransition();
  return <section className="card p-5 sm:p-6"><h3 className="font-semibold">{ar ? "إعادة تحليل التصنيفات" : "Reprocess classifications"}</h3><p className="mt-2 text-sm text-muted">{ar ? "أعد تحليل أقدم التصنيفات بعد تعديل المصطلحات أو النموذج. تُحفظ تصحيحات الفريق، ويُخصم الاستخدام من الرصيد الشهري." : "Revisit the oldest classifications after changing the glossary or model. Team corrections are preserved; processing uses the monthly AI allowance."}</p><p className="mt-2 text-xs text-faint">{ar ? `بانتظار التحليل: ${pendingCount}` : `${pendingCount} awaiting analysis`}</p><form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); start(async () => { try { const n = await reprocessClassifications(count); setMessage(ar ? `تمت جدولة ${n} منشورًا` : `${n} posts queued`); router.refresh(); } catch { setMessage(ar ? "تعذر بدء التحليل" : "Could not start reprocessing"); } }); }}><label className="grid gap-1 text-sm">{ar ? "عدد المنشورات" : "Number of posts"}<input className="input w-32" type="number" min={1} max={1000} required value={count} onChange={e => setCount(Number(e.target.value))} /></label><button className="btn-secondary" disabled={pending || !enabled}>{ar ? "إعادة التحليل" : "Reprocess"}</button><p className="text-sm text-muted" role="status">{message || (!enabled ? (ar ? "اربط الذكاء الاصطناعي أولًا" : "Connect AI first") : "")}</p></form></section>;
}
