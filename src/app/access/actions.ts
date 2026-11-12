"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { accessLink, newAccessToken, redeemAccessToken, tokenDigest } from "@/lib/access-tokens";

export async function requestPasswordReset(_: unknown, form: FormData) {
  const result = { ok: true as const };
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  if (!z.email().safeParse(email).success) return result;
  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim().slice(0,64);
  const permitted = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reset-ip:${ip}`}, 0))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reset:${email}`}, 0))::text`;
    const since = new Date(Date.now() - 3600_000);
    if (await tx.loginAttempt.count({ where: { key: `reset:${email}`, createdAt: { gte: since } } }) >= 3 || await tx.loginAttempt.count({ where: { ip: `reset:${ip}`, createdAt: { gte: since } } }) >= 10) return false;
    await tx.loginAttempt.create({ data: { key: `reset:${email}`, ip: `reset:${ip}` } });
    return true;
  });
  if (!permitted) return result;
  const token = newAccessToken();
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active) return result;
  // Serialize with deactivation and password changes; old reset links become unusable.
  const issued = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current?.active) return false;
    await tx.accessToken.deleteMany({ where: { userId: user.id, purpose: "RESET" } });
    await tx.accessToken.create({ data: { tokenHash: tokenDigest(token), userId: user.id, purpose: "RESET", expiresAt: new Date(Date.now() + 30 * 60_000) } });
    return true;
  });
  if (issued) {
    try {
      const link = accessLink(token);
      const sent = await sendEmail([user.email], user.locale === "ar" ? "إعادة تعيين كلمة المرور" : "Reset your password", user.locale === "ar" ? `استخدم الرابط خلال ٣٠ دقيقة لتعيين كلمة مرور جديدة. إذا لم تطلب ذلك فتجاهل الرسالة.\n\n${link}` : `Use this link within 30 minutes to set a new password. If you did not request this, ignore this message.\n\n${link}`);
      if (!sent) await db.accessToken.deleteMany({ where: { tokenHash: tokenDigest(token) } });
    } catch { await db.accessToken.deleteMany({ where: { tokenHash: tokenDigest(token) } }); }
  }
  return result;
}

export async function acceptAccessLink(_: unknown, form: FormData) {
  try { await redeemAccessToken(String(form.get("token") ?? ""), String(form.get("password") ?? "")); return { ok: true as const }; }
  catch { return { ok: false as const }; }
}
