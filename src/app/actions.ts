"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AlertKind, Dialect, MentionStatus, MonitorType, Platform, Role, Sentiment } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, createSession, destroySession, getCurrentUser, hashPassword, requireRole, verifyPassword } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { enqueue, QUEUES } from "@/lib/queue";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const PLATFORMS = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"] as const;

// ---------- auth & preferences ----------

const LOCK_WINDOW_MS = 15 * 60_000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 40;

/** Sign-in with throttling stored in the database (works across restarts and instances). */
export async function login(_: unknown, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || null;
  const since = new Date(Date.now() - LOCK_WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { key: email, createdAt: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ip, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) return { ok: false, error: "locked" };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    await db.loginAttempt.create({ data: { key: email, ip } });
    return { ok: false, error: "invalid" };
  }
  await db.loginAttempt.deleteMany({ where: { key: email } });
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
    data: { status: m.status === "ACTIVE" ? "PAUSED" : "ACTIVE", nextSyncAt: new Date(), pausedAt: m.status === "ACTIVE" ? new Date() : null },
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
  name: z.string().trim().max(80).optional(),
  defaultName: z.string().trim().max(80).optional(),
  kind: z.enum(["NEGATIVE_SPIKE", "VOLUME_SPIKE", "KEYWORD", "HIGH_REACH", "RISK", "CHURN_RISK"]),
  monitorId: z.string().optional(),
  threshold: z.coerce.number().min(0).max(1_000_000_000).default(0),
  windowMinutes: z.coerce.number().int().min(15).max(10080).default(60),
  keyword: z.string().trim().max(200).optional(),
  emails: z.string().max(2000).optional(),
  webhookUrl: z.string().trim().max(500).optional(),
});

/** Splits a comma/space separated list of emails. Returns null when any entry isn't an email. */
function parseEmails(raw: string | undefined) {
  const list = (raw ?? "")
    .split(/[,،;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.some((e) => !z.email().safeParse(e).success)) return null;
  return [...new Set(list)].slice(0, 20);
}

export async function createAlert(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const parsed = AlertInput.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  const name = d.name || d.defaultName;
  if (!name) return { ok: false, error: "name" };
  if (d.monitorId) await ownMonitor(d.monitorId, user.organizationId);
  if (d.kind === "KEYWORD" && !d.keyword?.split(/[,،]/).some((w) => w.trim())) return { ok: false, error: "keyword" };
  if (d.kind === "NEGATIVE_SPIKE" && d.threshold > 100) return { ok: false, error: "threshold" };
  const { isAllowedWebhook } = await import("@/lib/webhooks");
  if (d.webhookUrl && !isAllowedWebhook(d.webhookUrl)) return { ok: false, error: "webhook" };
  const emails = parseEmails(d.emails);
  if (!emails) return { ok: false, error: "emails" };
  await db.alertRule.create({
    data: {
      organizationId: user.organizationId,
      name,
      kind: d.kind as AlertKind,
      monitorId: d.monitorId || null,
      threshold: d.threshold,
      windowMinutes: d.windowMinutes,
      keyword: d.kind === "KEYWORD" ? d.keyword : null,
      emails,
      notifyEmail: emails.length > 0,
      webhookUrl: d.webhookUrl || null,
    },
  });
  await audit(user, "alert.create", undefined, { name });
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
  const notes = await db.notification.findMany({ where: { organizationId: user.organizationId, OR: [{ userId: null }, { userId: user.id }], reads: { none: { userId: user.id } } }, select: { id: true } });
  await db.notificationRead.createMany({ data: notes.map((n) => ({ notificationId: n.id, userId: user.id })), skipDuplicates: true });
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
  const range =
    locale === "ar"
      ? ({ 1: "آخر 24 ساعة", 7: "آخر 7 أيام", 30: "آخر 30 يومًا", 90: "آخر 90 يومًا" } as Record<number, string>)[days] ?? `آخر ${days} يوم`
      : ({ 1: "last 24 hours" } as Record<number, string>)[days] ?? `last ${days} days`;
  const title = `${monitor?.name ?? (locale === "ar" ? "كل المراقبات" : "All monitors")} · ${range}`;
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

/**
 * Rebuilds the Intelligence hub brief. Runs in the worker when it's up;
 * otherwise inline, so the page never waits on a missing worker.
 */
export async function refreshIntelligenceBrief(days: number): Promise<ActionResult> {
  const user = await requireRole("ANALYST");
  const d = [1, 7, 30, 90].includes(days) ? days : 7;
  const { getWorkerStatus } = await import("@/lib/system");
  if ((await getWorkerStatus()).alive) {
    await enqueue(QUEUES.intelligence, { organizationId: user.organizationId, days: d }, `intel:${user.organizationId}:${d}`);
    return { ok: true, message: "queued" };
  }
  const { generateIntelligenceBrief } = await import("@/lib/ai/intelligence");
  await generateIntelligenceBrief(user.organizationId, d);
  revalidatePath("/intelligence");
  return { ok: true, message: "done" };
}

/** Re-queues a report that failed to generate. */
export async function retryReport(id: string): Promise<ActionResult> {
  const user = await requireRole("ANALYST");
  const report = await db.report.findFirst({ where: { id, organizationId: user.organizationId }, include: { delivery: true } });
  if (!report || report.status !== "FAILED") return { ok: false, error: "not_found" };
  if (report.delivery) {
    await retryDelivery(report.delivery.id);
  } else {
    await db.report.updateMany({ where: { id, organizationId: user.organizationId, status: "FAILED" }, data: { status: "GENERATING", error: null } });
    await enqueue(QUEUES.report, { reportId: id });
  }
  await audit(user, "report.retry", id);
  revalidatePath("/reports");
  revalidatePath(`/reports/${id}`);
  return { ok: true };
}

export async function retryDelivery(id: string): Promise<void> {
  const user = await requireRole("ADMIN");
  await db.delivery.updateMany({ where: { id, organizationId: user.organizationId, status: "FAILED" }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), error: null } });
  await enqueue(QUEUES.delivery, {});
  revalidatePath("/reports");
  revalidatePath("/alerts");
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
  // Settings sections each post only their own fields; leave the others untouched.
  const field = (k: string, max: number) => (form.has(k) ? String(form.get(k) ?? "").trim().slice(0, max) : undefined);
  const name = field("name", 100);
  const brandContext = field("brandContext", 1500);
  const complianceRules = field("complianceRules", 3000);
  const timezone = field("timezone", 64);
  if (name === "") return { ok: false, error: "invalid" };
  if (timezone !== undefined && !Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC") return { ok: false, error: "invalid" };
  await db.organization.update({
    where: { id: user.organizationId },
    data: {
      name,
      timezone: timezone || undefined,
      brandContext: brandContext === undefined ? undefined : brandContext || null,
      complianceRules: complianceRules === undefined ? undefined : complianceRules || null,
    },
  });
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

export async function updateMember(id: string, change: unknown) {
  const user = await requireRole("ADMIN");
  const parsed = z.object({ role: z.enum(["ADMIN", "ANALYST", "VIEWER"]).optional(), active: z.boolean().optional() }).strict().safeParse(change);
  if (!parsed.success || !Object.keys(parsed.data).length) throw new Error("INVALID_MEMBER_CHANGE");
  const target = await db.user.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!target || target.role === "OWNER" || target.id === user.id) throw new Error("FORBIDDEN");
  const data = parsed.data;
  await db.$transaction(async (tx) => {
    const result = await tx.user.updateMany({ where: { id, organizationId: user.organizationId, role: { not: "OWNER" } }, data });
    if (!result.count) throw new Error("FORBIDDEN");
    if (data.active === false) await tx.session.deleteMany({ where: { userId: id } });
  });
  await audit(user, "member.update", target.email, data);
  revalidatePath("/settings");
}

// ---------- dialect suite: translation, replies, glossary ----------

function aiError(e: unknown): { ok: false; error: string } {
  const msg = (e as Error)?.message ?? String(e);
  console.error("AI action failed:", msg);
  return { ok: false, error: msg === "AI_DISABLED" ? "ai_disabled" : "failed" };
}

export async function translateMentionAction(id: string) {
  const user = await requireRole("VIEWER");
  try {
    const { translateMention } = await import("@/lib/ai/engage");
    return { ok: true as const, translation: await translateMention(id, user.organizationId) };
  } catch (e) {
    return aiError(e);
  }
}

export async function draftRepliesAction(mentionId: string, instruction?: string) {
  const user = await requireRole("ANALYST");
  try {
    const { draftReplies } = await import("@/lib/ai/engage");
    const out = await draftReplies(mentionId, user.organizationId, user.id, instruction?.slice(0, 300));
    await audit(user, "reply.draft", mentionId);
    revalidatePath("/inbox");
    return { ok: true as const, escalate: out.escalate, reason: out.escalation_reason };
  } catch (e) {
    return aiError(e);
  }
}

/** Saves the final reply text and marks the mention as replied (the team posts it on the platform). */
export async function markReplied(mentionId: string, text: string, replyId?: string) {
  const user = await requireRole("ANALYST");
  const m = await db.mention.findFirst({ where: { id: mentionId, organizationId: user.organizationId } });
  if (!m) return { ok: false as const, error: "not_found" };
  const clean = text.trim().slice(0, 2000);
  if (replyId) {
    await db.replyDraft.updateMany({
      where: { id: replyId, organizationId: user.organizationId },
      data: { text: clean, status: "POSTED", postedAt: new Date(), approvedById: user.id },
    });
  } else if (clean) {
    await db.replyDraft.create({
      data: { organizationId: user.organizationId, mentionId, text: clean, status: "POSTED", postedAt: new Date(), createdById: user.id, approvedById: user.id },
    });
  }
  await db.replyDraft.updateMany({ where: { mentionId, status: "DRAFT" }, data: { status: "DISCARDED" } });
  await db.mention.update({ where: { id: mentionId }, data: { repliedAt: new Date(), status: "REVIEWED" } });
  await audit(user, "reply.posted", mentionId);
  revalidatePath("/inbox");
  return { ok: true as const };
}

export async function skipInboxItem(mentionId: string) {
  const user = await requireRole("ANALYST");
  await db.mention.updateMany({ where: { id: mentionId, organizationId: user.organizationId }, data: { status: "ARCHIVED" } });
  revalidatePath("/inbox");
}

const DIALECT_VALUES = ["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"] as const;

export async function addLexiconTerm(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ANALYST");
  const parsed = z
    .object({
      term: z.string().trim().min(1).max(60),
      meaning: z.string().trim().min(1).max(300),
      dialect: z.enum(DIALECT_VALUES).optional(),
      sentimentHint: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
    })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  await db.lexiconTerm.upsert({
    where: { organizationId_term: { organizationId: user.organizationId, term: d.term } },
    create: { organizationId: user.organizationId, term: d.term, meaning: d.meaning, dialect: d.dialect as Dialect | undefined, sentimentHint: d.sentimentHint as Sentiment | undefined },
    update: { meaning: d.meaning, dialect: (d.dialect as Dialect) ?? null, sentimentHint: (d.sentimentHint as Sentiment) ?? null },
  });
  await audit(user, "lexicon.upsert", d.term);
  revalidatePath("/intelligence");
  return { ok: true };
}

export async function deleteLexiconTerm(id: string) {
  const user = await requireRole("ANALYST");
  await db.lexiconTerm.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/intelligence");
}

// ---------- content studio ----------

const PLATFORM_VALUES = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK", "LINKEDIN"] as const;
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\n|،|,/)
    .map((x) => x.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .slice(0, 30);

export async function createTrendWatch(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const seeds = lines(form.get("seeds")).map((x) => x.replace(/^#/, ""));
  const accounts = lines(form.get("accounts")).map((x) => x.replace(/^@/, ""));
  const platforms = form.getAll("platforms").map(String).filter((p): p is (typeof PLATFORM_VALUES)[number] => (PLATFORM_VALUES as readonly string[]).includes(p));
  const minViews = Math.max(0, Math.min(100_000_000, Number(form.get("minViews")) || 20000));
  if (!name || seeds.length === 0 || platforms.length === 0) return { ok: false, error: "invalid" };
  const w = await db.trendWatch.create({
    data: { organizationId: user.organizationId, name, seeds, accounts, platforms: platforms as Platform[], minViews },
  });
  await audit(user, "trendwatch.create", w.id, { name });
  await enqueue(QUEUES.trendScan, { watchId: w.id }, w.id).catch(() => null);
  revalidatePath("/studio");
  return { ok: true, id: w.id };
}

export async function deleteTrendWatch(id: string) {
  const user = await requireRole("ADMIN");
  await db.trendWatch.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/studio");
}

export async function scanTrendWatch(id: string) {
  const user = await requireRole("ANALYST");
  const w = await db.trendWatch.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!w) return;
  await enqueue(QUEUES.trendScan, { watchId: id }, id);
}

export async function setFormatFlag(id: string, flag: "saved" | "dismissed", value: boolean) {
  const user = await requireRole("ANALYST");
  await db.trendFormat.updateMany({ where: { id, organizationId: user.organizationId }, data: { [flag]: value } });
  revalidatePath("/studio");
}

const VoiceInput = z.object({
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(2000),
  dialect: z.enum(DIALECT_VALUES),
  audience: z.string().trim().max(300).optional(),
  ctaStyle: z.string().trim().max(300).optional(),
  emojiPolicy: z.string().trim().max(300).optional(),
});

export async function saveVoice(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const parsed = VoiceInput.safeParse(Object.fromEntries([...form.entries()].filter(([k, v]) => v !== "" && typeof v === "string" && !["traits", "dos", "donts", "bannedWords", "examples", "id"].includes(k))));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const id = String(form.get("id") ?? "");
  const data = {
    ...parsed.data,
    dialect: parsed.data.dialect as Dialect,
    traits: lines(form.get("traits")),
    dos: lines(form.get("dos")),
    donts: lines(form.get("donts")),
    bannedWords: lines(form.get("bannedWords")),
    examples: String(form.get("examples") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20),
  };
  const isFirst = (await db.brandVoice.count({ where: { organizationId: user.organizationId } })) === 0;
  const v = id
    ? await db.brandVoice.update({ where: { id, organizationId: user.organizationId }, data })
    : await db.brandVoice.create({ data: { ...data, organizationId: user.organizationId, isDefault: isFirst } });
  await audit(user, id ? "voice.update" : "voice.create", v.id);
  revalidatePath("/studio");
  return { ok: true, id: v.id };
}

/** Learns a voice from pasted samples or a monitor's posts, and saves it as a new voice. */
export async function learnVoiceAction(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  let samples = String(form.get("samples") ?? "").split("\n").map((x) => x.trim()).filter((x) => x.length > 15);
  const monitorId = String(form.get("monitorId") ?? "");
  if (monitorId) {
    const rows = await db.mention.findMany({
      where: { organizationId: user.organizationId, monitorId },
      orderBy: { likes: "desc" },
      take: 25,
      select: { text: true },
    });
    samples = [...samples, ...rows.map((r) => r.text)];
  }
  if (samples.length < 3) return { ok: false, error: "samples" };
  try {
    const { learnVoice } = await import("@/lib/ai/voice");
    const v = await learnVoice(samples.slice(0, 40), user.organization.brandContext);
    const isFirst = (await db.brandVoice.count({ where: { organizationId: user.organizationId } })) === 0;
    const row = await db.brandVoice.create({
      data: {
        organizationId: user.organizationId,
        isDefault: isFirst,
        name: v.name.slice(0, 80),
        summary: v.summary,
        dialect: v.dialect as Dialect,
        traits: v.traits,
        dos: v.dos,
        donts: v.donts,
        bannedWords: v.banned_words,
        audience: v.audience,
        ctaStyle: v.cta_style,
        emojiPolicy: v.emoji_policy,
        examples: v.examples,
      },
    });
    await audit(user, "voice.learn", row.id);
    revalidatePath("/studio");
    return { ok: true, id: row.id };
  } catch (e) {
    return aiError(e);
  }
}

export async function setDefaultVoice(id: string) {
  const user = await requireRole("ADMIN");
  await db.$transaction([
    db.brandVoice.updateMany({ where: { organizationId: user.organizationId }, data: { isDefault: false } }),
    db.brandVoice.updateMany({ where: { id, organizationId: user.organizationId }, data: { isDefault: true } }),
  ]);
  revalidatePath("/studio");
}

export async function deleteVoice(id: string) {
  const user = await requireRole("ADMIN");
  await db.brandVoice.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/studio");
}

const DraftInput = z.object({
  brief: z.string().trim().min(3).max(1500),
  goal: z.enum(["awareness", "education", "downloads", "engagement", "launch"]),
  platform: z.enum(PLATFORM_VALUES),
  dialect: z.enum(DIALECT_VALUES),
  durationSec: z.coerce.number().int().min(6).max(180),
  formatId: z.string().optional(),
  voiceId: z.string().optional(),
});

export async function createDraft(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ANALYST");
  const parsed = DraftInput.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  if (d.formatId && !(await db.trendFormat.findFirst({ where: { id: d.formatId, organizationId: user.organizationId } }))) return { ok: false, error: "invalid" };
  if (d.voiceId && !(await db.brandVoice.findFirst({ where: { id: d.voiceId, organizationId: user.organizationId } }))) return { ok: false, error: "invalid" };
  const draft = await db.contentDraft.create({
    data: {
      organizationId: user.organizationId,
      createdById: user.id,
      title: d.brief.slice(0, 100),
      brief: d.brief,
      goal: d.goal,
      platform: d.platform as Platform,
      dialect: d.dialect as Dialect,
      durationSec: d.durationSec,
      formatId: d.formatId || null,
      voiceId: d.voiceId || null,
    },
  });
  await enqueue(QUEUES.draft, { draftId: draft.id, revision: draft.revision });
  await audit(user, "draft.create", draft.id);
  redirect(`/studio/drafts/${draft.id}`);
}

export async function refineDraft(id: string, instruction: string, revision: number) {
  const user = await requireRole("ANALYST");
  const { aiEnabled } = await import("@/lib/ai/client");
  if (!aiEnabled()) throw new Error("AI_DISABLED");
  if (!Number.isSafeInteger(revision) || revision < 0 || typeof instruction !== "string" || !instruction.trim()) throw new Error("DRAFT_CONFLICT");
  const changed = await db.contentDraft.updateMany({
    where: { id, organizationId: user.organizationId, revision, status: { not: "GENERATING" } },
    data: { status: "GENERATING", revision: { increment: 1 }, error: null, approvedById: null, approvedRevision: null, approvedAt: null },
  });
  if (!changed.count) throw new Error("DRAFT_CONFLICT");
  try { await enqueue(QUEUES.draft, { draftId: id, instruction: instruction.slice(0, 500), revision: revision + 1 }); }
  catch (e) {
    await db.contentDraft.updateMany({ where: { id, revision: revision + 1, status: "GENERATING" }, data: { status: "DRAFT", error: "Could not queue rewrite. Try again." } });
    throw e;
  }
  revalidatePath(`/studio/drafts/${id}`);
}

export async function saveDraftContent(id: string, content: unknown, revision: number) {
  const user = await requireRole("ANALYST");
  const { DraftContentSchema } = await import("@/lib/draft-content");
  const parsed = DraftContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false as const, error: "invalid" };
  const { reflowBeats } = await import("@/lib/trends/score");
  const c = { ...parsed.data, beats: reflowBeats(parsed.data.beats) };
  const { writeDraftContent } = await import("@/lib/drafts");
  const saved = await writeDraftContent({ id, orgId: user.organizationId, revision, content: c, kind: "EDIT", userId: user.id });
  revalidatePath(`/studio/drafts/${id}`);
  return { ok: true as const, revision: saved.revision };
}

export async function setDraftStatus(id: string, status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED", revision: number) {
  const user = await requireRole(status === "APPROVED" ? "ADMIN" : "ANALYST");
  const { transitionDraft } = await import("@/lib/drafts");
  await transitionDraft({ id, orgId: user.organizationId, userId: user.id, revision, status });
  await audit(user, `draft.${status.toLowerCase()}`, id, { revision });
  revalidatePath(`/studio/drafts/${id}`);
  revalidatePath("/studio");
}

export async function deleteDraft(id: string) {
  const user = await requireRole("ANALYST");
  await db.contentDraft.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/studio");
  redirect("/studio?tab=drafts");
}

// ---------- profile ----------

export async function updateProfile(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("VIEWER");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const locale = form.get("locale") === "en" ? "en" : "ar";
  if (!name) return { ok: false, error: "invalid" };
  await db.user.update({ where: { id: user.id }, data: { name, locale } });
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 86400 });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Changes the password and signs out every other session. */
export async function changePassword(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("VIEWER");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 10 || next.length > 200) return { ok: false, error: "short" };
  if (!(await verifyPassword(current, user.passwordHash))) return { ok: false, error: "wrong" };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  await audit(user, "auth.password_changed");
  return { ok: true };
}

// ---------- assignment ----------

/** Assigns a post to a teammate (or clears it) and notifies the assignee. */
export async function assignMention(mentionId: string, assigneeId: string | null) {
  const user = await requireRole("ANALYST");
  const m = await db.mention.findFirst({ where: { id: mentionId, organizationId: user.organizationId } });
  if (!m) return { ok: false as const, error: "not_found" };
  const assignee = assigneeId ? await db.user.findFirst({ where: { id: assigneeId, organizationId: user.organizationId, active: true } }) : null;
  if (assigneeId && !assignee) return { ok: false as const, error: "invalid" };
  await db.mention.update({ where: { id: m.id }, data: { assignedToId: assignee?.id ?? null } });
  if (assignee && assignee.id !== user.id) {
    const snippet = m.text.slice(0, 160);
    await db.notification.create({
      data: {
        organizationId: user.organizationId,
        userId: assignee.id,
        severity: "INFO",
        titleEn: `${user.name} assigned you a post`,
        titleAr: `أسند إليك ${user.name} منشورًا`,
        bodyEn: snippet,
        bodyAr: snippet,
        link: `/inbox?m=${m.id}`,
      },
    });
  }
  await audit(user, "mention.assign", m.id, { to: assignee?.email ?? null });
  revalidatePath("/inbox");
  revalidatePath("/mentions");
  return { ok: true as const, name: assignee?.name ?? null };
}

// ---------- assistant ----------

export async function deleteAssistantThread(id: string) {
  const user = await requireRole("VIEWER");
  await db.assistantThread.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/assistant");
}

// ---------- weekly report ----------

export async function saveWeeklyReport(_: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireRole("ADMIN");
  const recipients = String(form.get("recipients") ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => z.email().safeParse(e).success)
    .slice(0, 20);
  const day = Math.min(6, Math.max(0, Number(form.get("day")) || 0));
  const enabled = form.get("enabled") === "on";
  if (enabled && recipients.length === 0) return { ok: false, error: "recipients" };
  await db.organization.update({
    where: { id: user.organizationId },
    data: { weeklyReportEnabled: enabled, weeklyReportDay: day, weeklyReportRecipients: recipients, weeklyReportLocale: form.get("locale") === "en" ? "en" : "ar" },
  });
  await audit(user, "org.weekly_report", undefined, { enabled, recipients: recipients.length });
  revalidatePath("/settings");
  revalidatePath("/reports");
  return { ok: true };
}

export async function dismissOnboarding() {
  const user = await requireRole("VIEWER");
  await db.organization.update({ where: { id: user.organizationId }, data: { onboardingDoneAt: new Date() } });
  revalidatePath("/");
}
