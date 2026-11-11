"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AlertKind, MentionStatus, MonitorType, Platform, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, createSession, destroySession, getCurrentUser, hashPassword, requireRole, verifyPassword } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { enqueue, QUEUES } from "@/lib/queue";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const PLATFORMS = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"] as const;

// ---------- auth & preferences ----------

const attempts = new Map<string, { n: number; until: number }>();

export async function login(_: unknown, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const a = attempts.get(email);
  if (a && a.n >= 5 && a.until > Date.now()) return { ok: false, error: "locked" };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    attempts.set(email, { n: (a?.n ?? 0) + 1, until: Date.now() + 15 * 60_000 });
    return { ok: false, error: "invalid" };
  }
  attempts.delete(email);
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 365 * 86400 });
  await audit(user, "auth.login");
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function setLocale(locale: "ar" | "en") {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 86400 });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}

// ---------- monitors ----------

const MonitorInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"]),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  terms: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  excludeTerms: z.array(z.string().trim().min(1).max(100)).max(20),
  languages: z.array(z.enum(["ar", "en"])),
  description: z.string().trim().max(500).optional(),
  isCompetitor: z.boolean(),
  refreshMinutes: z.number().int().min(15).max(1440),
});

export async function createMonitor(input: z.infer<typeof MonitorInput>): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const parsed = MonitorInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const count = await db.monitor.count({ where: { organizationId: user.organizationId } });
  if (count >= user.organization.monitorLimit) return { ok: false, error: "limit" };

  const d = parsed.data;
  const m = await db.monitor.create({
    data: {
      organizationId: user.organizationId,
      createdById: user.id,
      name: d.name,
      type: d.type as MonitorType,
      platforms: d.platforms as Platform[],
      terms: d.terms,
      excludeTerms: d.excludeTerms,
      languages: d.languages.length === 2 ? [] : d.languages,
      description: d.type === "TOPIC" ? d.description : null,
      isCompetitor: d.isCompetitor,
      refreshMinutes: d.refreshMinutes,
    },
  });
  await audit(user, "monitor.create", m.id, { name: m.name });
  await enqueue(QUEUES.sync, { monitorId: m.id }, m.id).catch(() => null);
  revalidatePath("/monitors");
  return { ok: true, id: m.id };
}

async function ownMonitor(id: string, orgId: string) {
  const m = await db.monitor.findFirst({ where: { id, organizationId: orgId } });
  if (!m) throw new Error("NOT_FOUND");
  return m;
}

export async function toggleMonitor(id: string) {
  const user = await requireRole("ADMIN");
  const m = await ownMonitor(id, user.organizationId);
  await db.monitor.update({
    where: { id },
    data: { status: m.status === "ACTIVE" ? "PAUSED" : "ACTIVE", nextSyncAt: new Date() },
  });
  await audit(user, m.status === "ACTIVE" ? "monitor.pause" : "monitor.resume", id);
  revalidatePath("/monitors");
  revalidatePath(`/monitors/${id}`);
}

export async function refreshMonitor(id: string) {
  const user = await requireRole("ANALYST");
  await ownMonitor(id, user.organizationId);
  await enqueue(QUEUES.sync, { monitorId: id }, id);
  revalidatePath(`/monitors/${id}`);
}

export async function deleteMonitor(id: string) {
  const user = await requireRole("ADMIN");
  const m = await ownMonitor(id, user.organizationId);
  await db.monitor.delete({ where: { id } });
  await audit(user, "monitor.delete", id, { name: m.name });
  revalidatePath("/monitors");
  redirect("/monitors");
}

// ---------- mentions ----------

export async function setMentionStatus(ids: string[], status: MentionStatus) {
  const user = await requireRole("ANALYST");
  await db.mention.updateMany({ where: { id: { in: ids }, organizationId: user.organizationId }, data: { status } });
  revalidatePath("/mentions");
}

// ---------- alerts ----------

const AlertInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["NEGATIVE_SPIKE", "VOLUME_SPIKE", "KEYWORD", "HIGH_REACH", "RISK"]),
  monitorId: z.string().optional(),
  threshold: z.coerce.number().min(0).default(0),
  windowMinutes: z.coerce.number().int().min(15).max(10080).default(60),
  keyword: z.string().trim().max(100).optional(),
  emails: z.string().optional(),
});

export async function createAlert(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const parsed = AlertInput.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  if (d.monitorId) await ownMonitor(d.monitorId, user.organizationId);
  if (d.kind === "KEYWORD" && !d.keyword) return { ok: false, error: "keyword" };
  const emails = (d.emails ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter((e) => z.email().safeParse(e).success);
  await db.alertRule.create({
    data: {
      organizationId: user.organizationId,
      name: d.name,
      kind: d.kind as AlertKind,
      monitorId: d.monitorId || null,
      threshold: d.threshold,
      windowMinutes: d.windowMinutes,
      keyword: d.keyword,
      emails,
      notifyEmail: emails.length > 0,
    },
  });
  await audit(user, "alert.create", undefined, { name: d.name });
  revalidatePath("/alerts");
  return { ok: true };
}

export async function toggleAlert(id: string) {
  const user = await requireRole("ADMIN");
  const r = await db.alertRule.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!r) return;
  await db.alertRule.update({ where: { id }, data: { enabled: !r.enabled } });
  revalidatePath("/alerts");
}

export async function deleteAlert(id: string) {
  const user = await requireRole("ADMIN");
  await db.alertRule.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/alerts");
}

export async function markNotificationsRead() {
  const user = await requireRole("VIEWER");
  await db.notification.updateMany({ where: { organizationId: user.organizationId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

// ---------- reports ----------

export async function createReport(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ANALYST");
  const days = Math.min(90, Math.max(1, Number(form.get("days") ?? 7)));
  const monitorId = String(form.get("monitorId") ?? "") || null;
  const locale = form.get("locale") === "en" ? "en" : "ar";
  const monitor = monitorId ? await ownMonitor(monitorId, user.organizationId) : null;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const title = `${monitor?.name ?? (locale === "ar" ? "كل المراقبات" : "All monitors")} · ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`;
  const r = await db.report.create({
    data: { organizationId: user.organizationId, monitorId, title, locale, periodStart: start, periodEnd: end, createdById: user.id },
  });
  await enqueue(QUEUES.report, { reportId: r.id });
  await audit(user, "report.create", r.id);
  redirect(`/reports/${r.id}`);
}

export async function createBrief(): Promise<ActionResult> {
  const user = await requireRole("VIEWER");
  const recent = await db.report.findFirst({
    where: { organizationId: user.organizationId, kind: "brief", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
  });
  if (recent) return { ok: true, id: recent.id };
  const end = new Date();
  const r = await db.report.create({
    data: {
      organizationId: user.organizationId,
      kind: "brief",
      title: "Daily brief",
      locale: user.locale === "en" ? "en" : "ar",
      periodStart: new Date(end.getTime() - 86400_000),
      periodEnd: end,
      createdById: user.id,
    },
  });
  await enqueue(QUEUES.report, { reportId: r.id });
  revalidatePath("/");
  return { ok: true, id: r.id };
}

export async function deleteReport(id: string) {
  const user = await requireRole("ANALYST");
  await db.report.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/reports");
  redirect("/reports");
}

// ---------- settings ----------

export async function updateOrganization(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const brandContext = String(form.get("brandContext") ?? "").trim().slice(0, 1500);
  if (!name) return { ok: false, error: "invalid" };
  await db.organization.update({ where: { id: user.organizationId }, data: { name, brandContext: brandContext || null } });
  await audit(user, "org.update");
  revalidatePath("/settings");
  return { ok: true };
}

export async function addMember(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.email(),
      role: z.enum(["ADMIN", "ANALYST", "VIEWER"]),
      password: z.string().min(10).max(200),
    })
    .safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const seats = await db.user.count({ where: { organizationId: user.organizationId, active: true } });
  if (seats >= user.organization.seatLimit) return { ok: false, error: "seats" };
  const email = parsed.data.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) return { ok: false, error: "exists" };
  await db.user.create({
    data: {
      organizationId: user.organizationId,
      name: parsed.data.name,
      email,
      role: parsed.data.role as Role,
      locale: user.locale,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  await audit(user, "member.add", email, { role: parsed.data.role });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateMember(id: string, change: { role?: Role; active?: boolean }) {
  const user = await requireRole("ADMIN");
  const target = await db.user.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!target || target.role === "OWNER" || target.id === user.id) return;
  if (change.role === "OWNER") return;
  await db.user.update({ where: { id }, data: change });
  if (change.active === false) await db.session.deleteMany({ where: { userId: id } });
  await audit(user, "member.update", target.email, change);
  revalidatePath("/settings");
}
