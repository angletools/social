"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Mention } from "@prisma/client";
import type { Dict } from "@/lib/i18n";
import { correctClassification, addHandoffNote } from "@/app/classification-actions";

type Classification = Pick<Mention, "id" | "sentiment" | "dialect" | "intent" | "relevant" | "isRisk" | "sarcasm" | "classificationSource" | "classificationRevision" | "classificationModel" | "classificationVersion" | "classificationContextHash" | "classificationConfidence">;
export const classificationLabels = {
  en: { PENDING: "Awaiting analysis", HEURISTIC: "Rule-based estimate", MODEL: "AI classification", HUMAN: "Team corrected", LEGACY: "Earlier analysis · source unknown", SAMPLE: "Sample classification" },
  ar: { PENDING: "بانتظار التحليل", HEURISTIC: "تقدير بقواعد آلية", MODEL: "تصنيف بالذكاء الاصطناعي", HUMAN: "صححه الفريق", LEGACY: "تحليل سابق · المصدر غير معروف", SAMPLE: "تصنيف تجريبي" },
};
export function ClassificationReview({ m, t, locale, canEdit }: { m: Classification; t: Dict; locale: string; canEdit: boolean }) {
  const ar = locale === "ar", router = useRouter();
  const [pending, start] = useTransition(), [message, setMessage] = useState("");
  const labels = classificationLabels[ar ? "ar" : "en"];
  return <details className="text-sm text-muted">
    <summary className="cursor-pointer py-2">{labels[m.classificationSource as keyof typeof labels] ?? labels.LEGACY} · {ar ? "مراجعة التصنيف" : "Review classification"}</summary>
    <p className="mt-2 text-xs break-words">{m.classificationModel ?? "—"} {m.classificationVersion && ` · ${m.classificationVersion}`} {m.classificationContextHash && ` · ${ar ? "سياق" : "Context"} ${m.classificationContextHash.slice(0, 12)}`}</p>
    {m.classificationConfidence !== null && <p className="mt-2 text-xs">{ar ? "الثقة المبلغ عنها من النموذج (غير معايرة)" : "Model-reported confidence (not calibrated)"}: {Math.round(m.classificationConfidence * 100)}%</p>}
    {canEdit && <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
      try { await correctClassification({ id: m.id, revision: m.classificationRevision, sentiment: f.get("sentiment") as NonNullable<Mention["sentiment"]>, dialect: f.get("dialect") as NonNullable<Mention["dialect"]>, intent: f.get("intent") as NonNullable<Mention["intent"]>, relevant: f.has("relevant"), isRisk: f.has("isRisk"), sarcasm: f.has("sarcasm"), reason: String(f.get("reason")) }); setMessage(ar ? "حُفظ التصحيح ولن تستبدله إعادة التحليل." : "Correction saved. Reprocessing will preserve it."); router.refresh(); }
      catch (e) { setMessage(e instanceof Error && e.message === "STALE" ? (ar ? "تغير التصنيف. حدّث الصفحة ثم حاول مجددًا." : "The classification changed. Refresh before correcting it.") : (ar ? "تعذر الحفظ" : "Could not save")); }
    }); }}>
      <label className="grid gap-1">{ar ? "المشاعر" : "Sentiment"}<select className="input" name="sentiment" defaultValue={m.sentiment ?? "NEUTRAL"}>{Object.entries({ POSITIVE: t.sentiment.POSITIVE, NEUTRAL: t.sentiment.NEUTRAL, NEGATIVE: t.sentiment.NEGATIVE }).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="grid gap-1">{ar ? "اللهجة" : "Dialect"}<select className="input" name="dialect" defaultValue={m.dialect ?? "OTHER"}>{Object.entries(t.dialects).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="grid gap-1">{ar ? "النية" : "Intent"}<select className="input" name="intent" defaultValue={m.intent ?? "OTHER"}>{Object.entries(t.intents).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <div className="flex flex-wrap gap-3 sm:col-span-3">{([['relevant', ar ? 'ذو صلة' : 'Relevant'], ['isRisk', ar ? 'خطر' : 'Risk'], ['sarcasm', ar ? 'سخرية' : 'Sarcasm']] as const).map(([key,label]) => <label key={key} className="flex items-center gap-2"><input name={key} type="checkbox" defaultChecked={m[key]} />{label}</label>)}</div>
      <label className="grid gap-1 sm:col-span-3">{ar ? "سبب التصحيح" : "Reason for correction"}<textarea className="input min-h-20" name="reason" required minLength={3} maxLength={500} /></label>
      <button className="btn-secondary justify-self-start" disabled={pending}>{ar ? "حفظ التصحيح" : "Save correction"}</button><p className="sm:col-span-3" role="status">{message}</p>
    </form>}
  </details>;
}

export function HandoffNote({ id, locale }: { id: string; locale: string }) {
  const ar = locale === "ar", router = useRouter();
  const [text, setText] = useState(""), [error, setError] = useState(false), [pending, start] = useTransition();
  return <form className="grid gap-2" onSubmit={e => { e.preventDefault(); start(async () => { try { await addHandoffNote(id, text); setText(""); setError(false); router.refresh(); } catch { setError(true); } }); }}>
    <label className="grid gap-2 text-sm text-muted">{ar ? "ملاحظة داخلية للفريق" : "Internal handoff note"}<textarea className="input min-h-20" required maxLength={2000} value={text} onChange={e => setText(e.target.value)} /></label>
    <button className="btn-ghost justify-self-start" disabled={pending}>{ar ? "إضافة ملاحظة" : "Add note"}</button>
    {error && <p role="alert" className="text-sm text-neg">{ar ? "تعذر حفظ الملاحظة" : "Could not save the note"}</p>}
  </form>;
}
