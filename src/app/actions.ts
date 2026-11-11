"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
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
  const complianceRules = String(form.get("complianceRules") ?? "").trim().slice(0, 3000);
  if (!name) return { ok: false, error: "invalid" };
  await db.organization.update({
    where: { id: user.organizationId },
    data: { name, brandContext: brandContext || null, complianceRules: complianceRules || null },
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
  revalidatePath("/dialect");
  return { ok: true };
}

export async function deleteLexiconTerm(id: string) {
  const user = await requireRole("ANALYST");
  await db.lexiconTerm.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/dialect");
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
  await enqueue(QUEUES.draft, { draftId: draft.id });
  await audit(user, "draft.create", draft.id);
  redirect(`/studio/drafts/${draft.id}`);
}

export async function refineDraft(id: string, instruction: string) {
  const user = await requireRole("ANALYST");
  const d = await db.contentDraft.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!d || d.status === "GENERATING") return;
  await db.contentDraft.update({ where: { id }, data: { status: "GENERATING", error: null } });
  await enqueue(QUEUES.draft, { draftId: id, instruction: instruction.slice(0, 500) });
  revalidatePath(`/studio/drafts/${id}`);
}

export async function saveDraftContent(id: string, content: unknown) {
  const user = await requireRole("ANALYST");
  const d = await db.contentDraft.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!d || !content || typeof content !== "object") return { ok: false as const };
  const { reflowBeats } = await import("@/lib/trends/score");
  const c = content as { beats?: unknown[] };
  if (Array.isArray(c.beats)) c.beats = reflowBeats(c.beats as Parameters<typeof reflowBeats>[0]);
  await db.contentDraft.update({ where: { id }, data: { content: c as object } });
  revalidatePath(`/studio/drafts/${id}`);
  return { ok: true as const };
}

export async function setDraftStatus(id: string, status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED") {
  const user = await requireRole(status === "APPROVED" ? "ADMIN" : "ANALYST");
  await db.contentDraft.updateMany({
    where: { id, organizationId: user.organizationId, status: { notIn: ["GENERATING"] } },
    data: { status, ...(status === "APPROVED" && { approvedById: user.id }) },
  });
  await audit(user, `draft.${status.toLowerCase()}`, id);
  revalidatePath(`/studio/drafts/${id}`);
  revalidatePath("/studio");
}

export async function deleteDraft(id: string) {
  const user = await requireRole("ANALYST");
  await db.contentDraft.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath("/studio");
  redirect("/studio?tab=drafts");
}
