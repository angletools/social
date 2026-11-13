"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDraftComment } from "./actions";
export function ReviewComments({ id, revision, locale, canEdit, reviewers, comments }: { id: string; revision: number; locale: string; canEdit: boolean; reviewers: { id: string; name: string }[]; comments: { id: string; text: string; revision: number; author: string; reviewer: string | null; when: string }[] }) {
  const ar = locale === "ar", router = useRouter();
  const [text, setText] = useState(""), [reviewer, setReviewer] = useState(""), [message, setMessage] = useState(""), [pending, start] = useTransition();
  return <section className="grid gap-3 border-t border-line pt-5"><h3 className="text-sm font-semibold">{ar ? "مراجعة الفريق" : "Team review"}</h3>
    <p className="text-xs text-faint">{ar ? `التعليقات تخص النسخة المحفوظة ${revision}. احفظ تعديلاتك قبل طلب المراجعة.` : `Comments refer to saved revision ${revision}. Save edits before requesting review.`}</p>
    {canEdit && <form className="grid gap-2" onSubmit={e => { e.preventDefault(); start(async () => { try { await addDraftComment(id, revision, text, reviewer || null); setText(""); setMessage(ar ? "حُفظ التعليق" : "Comment saved"); router.refresh(); } catch { setMessage(ar ? "تعذر الحفظ. حدّث الصفحة إذا تغيرت النسخة." : "Could not save. Refresh if the revision has changed."); } }); }}>
      <label className="grid gap-1 text-xs">{ar ? "تعليق" : "Comment"}<textarea className="input min-h-24" value={text} maxLength={2000} required onChange={e => setText(e.target.value)} /></label>
      <label className="grid gap-1 text-xs">{ar ? "طلب مراجعة من" : "Request review from"}<select className="input w-full" value={reviewer} onChange={e => setReviewer(e.target.value)}><option value="">{ar ? "تعليق فقط" : "Comment only"}</option>{reviewers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <button className="btn-secondary" disabled={pending}>{ar ? "إضافة تعليق" : "Add comment"}</button><p role="status" className="text-xs text-muted">{message}</p>
    </form>}
    {comments.map(c => <article key={c.id} className="border-t border-line pt-3 text-sm"><p className="text-xs text-faint">{c.author} · {ar ? "نسخة" : "Revision"} {c.revision} · {c.when}</p><p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{c.text}</p>{c.reviewer && <p className="mt-1 text-xs text-muted">{ar ? "للمراجعة:" : "For review:"} {c.reviewer}</p>}</article>)}
  </section>;
}
