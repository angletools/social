import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { hashPassword } from "./auth";

export const AccessPassword = z.string().min(12).max(72).refine(p => Buffer.byteLength(p, "utf8") <= 72);
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
export const newAccessToken = () => randomBytes(32).toString("base64url");
export function accessLink(token: string) {
  const base = new URL(process.env.APP_URL ?? "http://localhost:3000");
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("APP_URL_MUST_USE_HTTPS");
  return new URL(`/access?token=${encodeURIComponent(token)}`, base).toString();
}
export async function redeemAccessToken(token: string, password: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("INVALID_LINK");
  const parsed = AccessPassword.parse(password);
  const hash = tokenDigest(token);
  const candidate = await db.accessToken.findUnique({ where: { tokenHash: hash }, include: { user: { select: { organizationId: true } } } });
  if (!candidate) throw new Error("INVALID_LINK");
  const passwordHash = await hashPassword(parsed);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${candidate.user.organizationId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId} FOR UPDATE`;
    const row = await tx.accessToken.findUnique({ where: { tokenHash: hash }, include: { user: true } });
    if (!row || row.expiresAt <= new Date() || (row.purpose === "RESET" ? !row.user.active : row.purpose !== "INVITE" || row.user.active)) throw new Error("INVALID_LINK");
    if (row.purpose === "INVITE") {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: row.user.organizationId } });
      if (await tx.user.count({ where: { organizationId: org.id, active: true } }) >= org.seatLimit) throw new Error("SEAT_LIMIT");
    }
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, active: true } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.accessToken.deleteMany({ where: { userId: row.userId } });
    await tx.auditLog.create({ data: { organizationId: row.user.organizationId, userId: row.userId, action: row.purpose === "INVITE" ? "member.accepted" : "auth.recovered" } });
  });
}
