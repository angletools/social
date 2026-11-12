"use client";
import Link from "next/link";
import { useActionState } from "react";
import { acceptAccessLink, requestPasswordReset } from "./actions";
export function AccessForm({ token, locale }: { token?: string; locale: string }) {
  const ar = locale === "ar";
  const [reset, resetAction, resetPending] = useActionState(requestPasswordReset, null);
  const [accepted, acceptAction, acceptPending] = useActionState(acceptAccessLink, null);
  if (accepted?.ok) return <div className="grid gap-5"><p role="status">{ar ? "حُفظت كلمة المرور. سجّل الدخول للمتابعة." : "Your password is saved. Sign in to continue."}</p><Link className="btn-primary" href="/login">{ar ? "تسجيل الدخول" : "Sign in"}</Link></div>;
  if (!token && reset?.ok) return <p role="status" className="text-sm leading-relaxed text-muted">{ar ? "إذا كان الحساب نشطًا والبريد متصلًا، سيصلك رابط إعادة التعيين. تحقق من بريدك أو تواصل مع مسؤول مساحة العمل." : "If the account is active and email is connected, you’ll receive a reset link. Check your inbox or contact your workspace admin."}</p>;
  return <form action={token ? acceptAction : resetAction} className="grid gap-4">
    {token ? <><input type="hidden" name="token" value={token} /><label className="grid gap-2 text-sm">{ar ? "كلمة مرور جديدة" : "New password"}<input className="input" name="password" type="password" minLength={12} maxLength={72} required autoComplete="new-password" /></label><p className="text-xs text-muted">{ar ? "١٢ حرفًا على الأقل، وبحد أقصى ٧٢ بايت. الرابط صالح للاستخدام مرة واحدة." : "At least 12 characters, up to 72 bytes. This link can be used once."}</p></> : <label className="grid gap-2 text-sm">{ar ? "البريد الإلكتروني" : "Email"}<input className="input" name="email" type="email" required autoComplete="email" /></label>}
    {accepted && !accepted.ok && <p role="alert" className="text-sm text-neg">{ar ? "تعذر استخدام الرابط. تحقق من كلمة المرور أو اطلب رابطًا جديدًا." : "This link could not be used. Check the password or request a new link."}</p>}
    <button className="btn-primary" disabled={resetPending || acceptPending}>{ar ? (token ? "حفظ كلمة المرور" : "إرسال رابط إعادة التعيين") : (token ? "Save password" : "Send reset link")}</button>
    <Link href="/login" className="text-center text-sm text-muted underline">{ar ? "العودة لتسجيل الدخول" : "Back to sign in"}</Link>
  </form>;
}
