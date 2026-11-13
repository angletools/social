import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import type { Organization, User, Monitor } from "@prisma/client";
import { db } from "@/lib/db";
import { setSession } from "../support/next";
import * as actions from "@/app/actions";
import { restoreDraftVersion } from "@/app/(app)/studio/drafts/[id]/actions";
import { writeDraftContent } from "@/lib/drafts";
import { collectReportData } from "@/lib/ai/report";
import { runDueWeeklyReports } from "@/lib/weekly";
import { deliverPending } from "@/lib/delivery";
import { evaluateAlerts } from "@/lib/alerts";
import * as email from "@/lib/email";
import { MonidClient } from "@/lib/monid/client";
import { syncMonitor } from "@/lib/ingest/sync";
import { getInboxPage } from "@/lib/inbox";
import { scanWatch } from "@/lib/trends/scan";
import { getTopAuthors } from "@/lib/analytics";

vi.mock("@/lib/queue", () => ({ enqueue: vi.fn(async () => "test-job"), QUEUES: { draft: "draft", sync: "sync", report: "report", delivery: "delivery" } }));

let org: Organization, admin: User, member: User, viewer: User, monitor: Monitor;
const extraOrgs: string[] = [];
const content = {
  title: "A script", concept: "Test", hooks: [{ text: "Hello", on_screen: "Hello", why: "Direct" }],
  beats: [{ start: 0, duration: 10, vo: "Hello", onScreen: "Hello", visual: "A person", shot: 1 }],
  shots: [{ n: 1, type: "MEDIUM", description: "Person", location: "Studio", props: "None", talent: "Host", duration: 10, notes: "" }],
  edit: { music: "None", pacing: "Calm", transitions: [], captions_style: "Plain", sfx: [] },
  caption: "Caption", hashtags: [], cta: "Read more", compliance: { status: "REVIEW", notes: [] }, voice_match: { score: 80, notes: "Clear" },
};
async function actAs(user: User) {
  const token = randomUUID();
  await db.session.create({ data: { id: createHash("sha256").update(token).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
  setSession(token);
}
const draft = () => db.contentDraft.create({ data: { organizationId: org.id, title: "Test", brief: "Test", goal: "awareness", status: "DRAFT", content } });
const post = (externalId: string, extra: object = {}) => ({ organizationId: org.id, monitorId: monitor.id, platform: "X" as const, externalId, text: externalId, publishedAt: new Date(Date.now() - 60_000), ...extra });
beforeEach(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("ANTHROPIC_AUTH_TOKEN", ""); vi.stubEnv("MONID_API_KEY", ""); vi.stubEnv("SMTP_URL", "");
  org = await db.organization.create({ data: { name: "Regression test", slug: randomUUID(), timezone: "UTC" } });
  const createUser = (role: "ADMIN" | "ANALYST" | "VIEWER") => db.user.create({ data: { organizationId: org.id, role, name: role, email: `${randomUUID()}@example.invalid`, passwordHash: "unusable-test-hash" } });
  admin = await createUser("ADMIN"); member = await createUser("ANALYST"); viewer = await createUser("VIEWER");
  monitor = await db.monitor.create({ data: { organizationId: org.id, name: "Brand", type: "KEYWORD", platforms: ["X"], terms: ["brand"], languages: [], excludeTerms: [], status: "PAUSED" } });
  await actAs(admin);
});
afterEach(async () => { setSession(null); vi.restoreAllMocks(); vi.unstubAllEnvs(); await db.organization.deleteMany({ where: { id: { in: [org.id, ...extraOrgs.splice(0)] } } }); });
afterAll(() => db.$disconnect());

it("rejects nested Prisma role updates, extra fields, Owner promotion and insufficient roles", async () => {
  for (const change of [{ role: { set: "OWNER" } }, { role: "OWNER" }, { active: true, passwordHash: "replacement" }, { organizationId: "other" }]) {
    await expect(actions.updateMember(member.id, change)).rejects.toThrow();
  }
  await actions.updateMember(member.id, { role: "VIEWER" });
  expect((await db.user.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("VIEWER");
  await actAs(viewer);
  await expect(actions.updateMember(member.id, { role: "ADMIN" })).rejects.toThrow("FORBIDDEN");
  setSession(null);
  await expect(actions.updateMember(member.id, { active: false })).rejects.toThrow("REDIRECT");
});
it("keeps protected targets and other organizations out of member updates and revokes deactivated sessions", async () => {
  const other = await db.organization.create({ data: { name: "Other", slug: randomUUID() } }); extraOrgs.push(other.id);
  const outsider = await db.user.create({ data: { organizationId: other.id, name: "Other", email: `${randomUUID()}@example.invalid`, passwordHash: "unusable" } });
  await expect(actions.updateMember(outsider.id, { active: false })).rejects.toThrow("FORBIDDEN");
  await expect(actions.updateMember(admin.id, { role: "VIEWER" })).rejects.toThrow("FORBIDDEN");
  await actAs(member); await actAs(admin);
  await actions.updateMember(member.id, { active: false });
  expect(await db.session.count({ where: { userId: member.id } })).toBe(0);
});
it.each(["OWNER", "ADMIN", "ANALYST", "VIEWER"] as const)("checks member-update authority for %s", async role => {
  await db.user.update({ where: { id: admin.id }, data: { role } });
  if (role === "OWNER" || role === "ADMIN") {
    await actions.updateMember(member.id, { role: "ADMIN" });
    expect((await db.user.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("ADMIN");
  } else await expect(actions.updateMember(member.id, { role: "ADMIN" })).rejects.toThrow("FORBIDDEN");
  await db.user.update({ where: { id: member.id }, data: { role: "OWNER" } });
  await expect(actions.updateMember(member.id, { active: false })).rejects.toThrow("FORBIDDEN");
});
it("keeps the same handle on different platforms as separate accounts", async () => {
  await db.mention.createMany({ data: [post("x-account", { authorHandle: "same", authorFollowers: 100 }), post("ig-account", { platform: "INSTAGRAM", authorHandle: "same", authorFollowers: 200 })] });
  const authors = await getTopAuthors({ orgId: org.id, days: 7 });
  expect(authors.map(a => [a.platform, a.mentions])).toEqual([["INSTAGRAM", 1], ["X", 1]]);
});
it("records failed live trend collection without moving its last success or adding demo posts", async () => {
  const lastScanAt = new Date("2020-01-01T00:00:00Z");
  const w = await db.trendWatch.create({ data: { organizationId: org.id, name: "Test watch", platforms: ["X"], seeds: ["brand"], accounts: [], lastScanAt } });
  await expect(scanWatch(w.id)).rejects.toThrow("configure Monid");
  expect(await db.trendWatch.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ lastScanAt, lastScanError: expect.stringContaining("configure Monid") });
  expect(await db.trendPost.count({ where: { organizationId: org.id } })).toBe(0);
});
it("keeps personal notifications private and broadcast read receipts independent", async () => {
  const base = { organizationId: org.id, titleEn: "Notice", titleAr: "تنبيه", bodyEn: "Test", bodyAr: "اختبار" };
  const personal = await db.notification.create({ data: { ...base, userId: member.id } });
  const shared = await db.notification.create({ data: base });
  await actions.markNotificationsRead();
  expect(await db.notificationRead.count({ where: { notificationId: personal.id } })).toBe(0);
  expect(await db.notificationRead.count({ where: { notificationId: shared.id, userId: member.id } })).toBe(0);
  await actAs(member); await actions.markNotificationsRead();
  expect(await db.notificationRead.count({ where: { notificationId: shared.id } })).toBe(2);
  expect(await db.notificationRead.count({ where: { notificationId: personal.id, userId: member.id } })).toBe(1);
});
it("enforces review then approval then publication, with actual session roles", async () => {
  const d = await draft(); await actAs(member);
  await expect(actions.setDraftStatus(d.id, "PUBLISHED", 0)).rejects.toThrow("DRAFT_CONFLICT");
  await actions.setDraftStatus(d.id, "IN_REVIEW", 0);
  await expect(actions.setDraftStatus(d.id, "APPROVED", 0)).rejects.toThrow("FORBIDDEN");
  await actAs(admin); await actions.setDraftStatus(d.id, "APPROVED", 0);
  const approved = await db.contentDraft.findUniqueOrThrow({ where: { id: d.id }, include: { versions: true } });
  expect(approved.approvedRevision).toBe(0); expect(approved.versions[0].content).toEqual(content);
  await actAs(member); await actions.setDraftStatus(d.id, "PUBLISHED", 0);
  expect((await db.contentDraft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PUBLISHED");
});
it("invalidates approval on editing and restoring, and rejects stale saves", async () => {
  const d = await draft(); await actions.setDraftStatus(d.id, "IN_REVIEW", 0); await actions.setDraftStatus(d.id, "APPROVED", 0);
  await actAs(member);
  expect(await actions.saveDraftContent(d.id, { ...content, caption: "Changed" }, 0)).toMatchObject({ ok: true, revision: 1 });
  const saved = await db.contentDraft.findUniqueOrThrow({ where: { id: d.id } });
  expect(saved).toMatchObject({ status: "DRAFT", approvedById: null, approvedRevision: null, approvedAt: null });
  await expect(actions.saveDraftContent(d.id, content, 0)).rejects.toThrow("DRAFT_CONFLICT");
  await actions.setDraftStatus(d.id, "IN_REVIEW", 1); await actAs(admin); await actions.setDraftStatus(d.id, "APPROVED", 1);
  await restoreDraftVersion(d.id, 1, 1);
  expect(await db.contentDraft.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ status: "DRAFT", revision: 2, approvedById: null });
});
it("commits only one of two concurrent edits and keeps history in the same transaction", async () => {
  const d = await draft();
  const results = await Promise.allSettled(["first", "second"].map((caption) => writeDraftContent({ id: d.id, orgId: org.id, revision: 0, content: { ...content, caption }, kind: "EDIT" })));
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const saved = await db.contentDraft.findUniqueOrThrow({ where: { id: d.id }, include: { versions: true } });
  expect(saved.revision).toBe(1); expect(saved.versions).toHaveLength(1); expect(saved.versions[0].content).toEqual(saved.content);
});
it("never leaves changed content approved when approval races an edit", async () => {
  const d = await draft(); await actions.setDraftStatus(d.id, "IN_REVIEW", 0);
  await Promise.allSettled([actions.setDraftStatus(d.id, "APPROVED", 0), writeDraftContent({ id: d.id, orgId: org.id, revision: 0, content: { ...content, caption: "Changed" }, kind: "EDIT" })]);
  expect(await db.contentDraft.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ status: "DRAFT", revision: 1, approvedById: null });
});
it("invalidates approval before rewriting and fences stale worker results", async () => {
  const d = await draft(); await actions.setDraftStatus(d.id, "IN_REVIEW", 0); await actions.setDraftStatus(d.id, "APPROVED", 0);
  await expect(actions.refineDraft(d.id, "Make it shorter", 0)).rejects.toThrow("AI_DISABLED");
  expect((await db.contentDraft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("APPROVED");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-not-a-real-key");
  await actions.refineDraft(d.id, "Make it shorter", 0);
  expect(await db.contentDraft.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ status: "GENERATING", revision: 1, approvedById: null });
  await expect(writeDraftContent({ id: d.id, orgId: org.id, revision: 0, content, kind: "REWRITE", generating: true })).rejects.toThrow("DRAFT_CONFLICT");
  await writeDraftContent({ id: d.id, orgId: org.id, revision: 1, content, kind: "REWRITE", generating: true });
  expect(await db.contentDraft.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ status: "DRAFT", revision: 2, approvedRevision: null });
});
it("uses the saved historical scope, including exclusive end boundaries, for every report part", async () => {
  await db.mention.createMany({ data: [
    post("historic", { publishedAt: new Date("2020-01-03T12:00:00Z"), sentiment: "NEGATIVE", topics: ["historic"] }),
    post("boundary", { publishedAt: new Date("2020-01-08T00:00:00Z") }), post("now-a"), post("now-b"),
  ] });
  const r = await db.report.create({ data: { organizationId: org.id, title: "January 2020", periodStart: new Date("2020-01-01T00:00:00Z"), periodEnd: new Date("2020-01-08T00:00:00Z") } });
  const data = await collectReportData(r.id);
  expect(data.stats.kpis.mentions).toBe(1); expect(data.sample.map((p) => p.text)).toEqual(["historic"]);
  expect(data.stats.topics.map((t) => t.key)).toEqual(["historic"]);
  expect(data.stats.series.points.reduce((sum, p) => sum + p.n, 0)).toBe(1);
  await db.mention.create({ data: post("late-arrival", { publishedAt: new Date("2020-01-04T12:00:00Z") }) });
  const retry = await collectReportData(r.id);
  expect(retry.stats).toEqual(data.stats);
  expect(retry.sample.map(p => p.text)).toEqual(["historic"]);
});
it("uses 08:00 local time for weekly reports in fractional-offset timezones", async () => {
  await db.organization.update({ where: { id: org.id }, data: { timezone: "Asia/Kolkata", weeklyReportEnabled: true, weeklyReportDay: 4, weeklyReportRecipients: ["test@example.invalid"] } });
  await runDueWeeklyReports(new Date("2026-11-12T04:15:00Z"), org.id);
  const r = await db.report.findFirstOrThrow({ where: { id: { not: "" }, organizationId: org.id } });
  expect(r.periodEnd.toISOString()).toBe("2026-11-12T02:30:00.000Z");
});
it("does not record unsent weekly mail as sent and retries the same report after recovery", async () => {
  const now = new Date("2026-11-12T09:00:00Z");
  await db.organization.update({ where: { id: org.id }, data: { weeklyReportEnabled: true, weeklyReportDay: 4, weeklyReportRecipients: ["test@example.invalid"] } });
  expect(await runDueWeeklyReports(now, org.id)).toEqual([]);
  expect((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).weeklyReportLastSentAt).toBeNull();
  const r = await db.report.findFirstOrThrow({ where: { organizationId: org.id }, include: { delivery: true } });
  expect(r.delivery?.status).toBe("FAILED");
  await db.report.update({ where: { id: r.id }, data: { status: "READY", content: { headline: "Ready", summary: "Summary", recommendations: [] } } });
  const send = vi.spyOn(email, "sendEmail").mockResolvedValue(true);
  expect(await runDueWeeklyReports(new Date(now.getTime() + 3600_000), org.id)).toEqual([org.slug]);
  expect(await db.report.count({ where: { organizationId: org.id } })).toBe(1); expect(send).toHaveBeenCalledTimes(1);
  expect((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).weeklyReportLastSentAt).not.toBeNull();
});
it("claims a delivery only once across concurrent workers and recovers an expired claim", async () => {
  const d = await db.delivery.create({ data: { organizationId: org.id, dedupeKey: randomUUID(), channel: "EMAIL", recipients: ["test@example.invalid"], subject: "Test", body: "Body" } });
  const send = vi.spyOn(email, "sendEmail").mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); return true; });
  await Promise.all([deliverPending(new Date(), org.id), deliverPending(new Date(), org.id)]);
  expect(send).toHaveBeenCalledTimes(1); expect((await db.delivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("SENT");
  await db.delivery.create({ data: { organizationId: org.id, dedupeKey: randomUUID(), channel: "EMAIL", recipients: ["test@example.invalid"], status: "SENDING", claimToken: "lost-worker", leaseUntil: new Date(0) } });
  await deliverPending(new Date(), org.id); expect(send).toHaveBeenCalledTimes(2);
});
it("keeps rejected mail failed and makes alert delivery independent of cooldown", async () => {
  await db.mention.create({ data: post("risk", { isRisk: true }) });
  await db.alertRule.create({ data: { organizationId: org.id, kind: "RISK", name: "Risk", emails: ["test@example.invalid"], notifyEmail: true } });
  await Promise.all([evaluateAlerts(org.id), evaluateAlerts(org.id)]);
  expect(await db.notification.count({ where: { organizationId: org.id } })).toBe(1);
  expect(await db.delivery.count({ where: { organizationId: org.id } })).toBe(1);
  vi.spyOn(email, "sendEmail").mockResolvedValue(false);
  await deliverPending(new Date(), org.id);
  expect(await db.delivery.findFirstOrThrow({ where: { organizationId: org.id } })).toMatchObject({ status: "FAILED", sentAt: null });
  expect(await evaluateAlerts(org.id)).toBe(0);
  await actions.retryDelivery((await db.delivery.findFirstOrThrow({ where: { organizationId: org.id } })).id);
  expect((await db.delivery.findFirstOrThrow({ where: { organizationId: org.id } })).status).toBe("PENDING");
});
it("never generates samples for a live workspace without a key", async () => {
  await db.monitor.update({ where: { id: monitor.id }, data: { status: "ACTIVE" } });
  await expect(syncMonitor(monitor.id)).rejects.toThrow("Collection incomplete");
  expect(await db.mention.count({ where: { organizationId: org.id } })).toBe(0);
  expect(await db.monitor.findUniqueOrThrow({ where: { id: monitor.id } })).toMatchObject({ lastSyncAt: null });
});
it("keeps demo workspaces demo with live credentials and rejects source/mode changes", async () => {
  const demo = await db.organization.create({ data: { name: "Demo", slug: randomUUID(), dataMode: "DEMO" } }); extraOrgs.push(demo.id);
  const m = await db.monitor.create({ data: { organizationId: demo.id, name: "Demo", type: "KEYWORD", platforms: ["X"], terms: ["test"], languages: [], excludeTerms: [], maxItemsPerRun: 2 } });
  const runAndWait = vi.fn(); vi.spyOn(MonidClient, "fromEnv").mockReturnValue({ runAndWait } as unknown as MonidClient);
  await syncMonitor(m.id); expect(runAndWait).not.toHaveBeenCalled();
  expect(await db.mention.count({ where: { organizationId: demo.id, source: "DEMO" } })).toBeGreaterThan(0);
  await expect(db.organization.update({ where: { id: demo.id }, data: { dataMode: "LIVE" } })).rejects.toThrow();
  await expect(db.mention.create({ data: post("forbidden-sample", { source: "DEMO" }) })).rejects.toThrow();
});
it("refreshes engagement without overwriting the team's work and preserves last success on failure", async () => {
  await db.monitor.update({ where: { id: monitor.id }, data: { status: "ACTIVE" } });
  let likes = 1;
  const fake = { runAndWait: vi.fn(async () => ({ runId: "r", status: "COMPLETED", output: [{ id: "post-1", text: "Brand", createdAt: new Date().toISOString(), likeCount: likes }] })) };
  vi.spyOn(MonidClient, "fromEnv").mockReturnValue(fake as unknown as MonidClient);
  await syncMonitor(monitor.id);
  const m = await db.mention.findFirstOrThrow({ where: { monitorId: monitor.id } });
  await db.mention.update({ where: { id: m.id }, data: { assignedToId: member.id, note: "Keep", sentiment: "NEGATIVE", repliedAt: new Date() } });
  likes = 900; await syncMonitor(monitor.id);
  expect(await db.mention.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ likes: 900, assignedToId: member.id, note: "Keep", sentiment: "NEGATIVE" });
  const second = await db.monitor.create({ data: { organizationId: org.id, name: "Overlapping monitor", type: "KEYWORD", platforms: ["X"], terms: ["brand"], languages: [], excludeTerms: [], status: "ACTIVE" } });
  likes = 950; await syncMonitor(second.id);
  const copy = await db.mention.findFirstOrThrow({ where: { monitorId: second.id } });
  expect(copy).toMatchObject({ likes: 950, assignedToId: member.id, repliedAt: expect.any(Date) });
  expect(await db.mention.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ likes: 950, assignedToId: member.id, note: "Keep", sentiment: "NEGATIVE" });
  const last = (await db.monitor.findUniqueOrThrow({ where: { id: monitor.id } })).lastSyncAt;
  fake.runAndWait.mockRejectedValue(new Error("Provider outage"));
  await expect(syncMonitor(monitor.id)).rejects.toThrow("Provider outage");
  expect((await db.monitor.findUniqueOrThrow({ where: { id: monitor.id } })).lastSyncAt).toEqual(last);
});
it("resumes a paid provider run after a retry instead of buying another", async () => {
  await db.monitor.update({ where: { id: monitor.id }, data: { status: "ACTIVE" } });
  const result = { runId: "paid-run", status: "COMPLETED", output: [{ id: "resumed", text: "Brand", createdAt: new Date().toISOString() }] };
  const fake = {
    runAndWait: vi.fn(async (_p: string, _e: string, _b: object, _t: number, started: (id: string) => Promise<void>) => { await started("paid-run"); throw new Error("Polling timed out"); }),
    getRun: vi.fn(async () => result), waitForRun: vi.fn(async () => result),
  };
  vi.spyOn(MonidClient, "fromEnv").mockReturnValue(fake as unknown as MonidClient);
  await expect(syncMonitor(monitor.id, "same-job")).rejects.toThrow("Polling timed out");
  expect(await syncMonitor(monitor.id, "same-job")).toBe(1);
  expect(fake.runAndWait).toHaveBeenCalledTimes(1); expect(fake.getRun).toHaveBeenCalledWith("paid-run");
});
it("applies the monthly collection allowance atomically across concurrent monitors", async () => {
  await db.organization.update({ where: { id: org.id }, data: { mentionQuota: 1 } });
  await db.monitor.update({ where: { id: monitor.id }, data: { status: "ACTIVE" } });
  const second = await db.monitor.create({ data: { organizationId: org.id, name: "Other", type: "KEYWORD", platforms: ["X"], terms: ["brand"], languages: [], excludeTerms: [] } });
  vi.spyOn(MonidClient, "fromEnv").mockReturnValue({ runAndWait: async () => ({ status: "COMPLETED", output: [{ id: "quota", text: "Brand", createdAt: new Date().toISOString() }] }) } as unknown as MonidClient);
  await Promise.allSettled([syncMonitor(monitor.id), syncMonitor(second.id)]);
  expect(await db.mention.count({ where: { organizationId: org.id } })).toBe(1);
});
it("keeps old urgent posts reachable, ranks before limiting, and pages the whole backlog", async () => {
  await db.mention.createMany({ data: Array.from({ length: 420 }, (_, i) => post(`question-${i}`, { intent: "QUESTION" })) });
  const old = await db.mention.create({ data: post("old-urgent", { intent: "CHURN_RISK", isRisk: true, authorFollowers: 1_000_000, publishedAt: new Date(Date.now() - 30 * 86400_000) }) });
  const first = await getInboxPage(org.id);
  expect(first.total).toBe(421); expect(first.items[0].id).toBe(old.id);
  const ids = new Set<string>();
  for (let page = 1; page <= first.pages; page++) for (const m of (await getInboxPage(org.id, { page })).items) ids.add(m.id);
  expect(ids.size).toBe(421);
  const competitor = await db.monitor.create({ data: { organizationId: org.id, name: "Competitor", type: "KEYWORD", platforms: [], terms: [], languages: [], excludeTerms: [], isCompetitor: true } });
  await db.mention.create({ data: post("competitor", { monitorId: competitor.id, intent: "COMPLAINT" }) });
  expect((await getInboxPage(org.id)).total).toBe(421);
  expect((await getInboxPage(org.id, { allMonitors: true })).total).toBe(422);
  await db.mention.update({ where: { id: old.id }, data: { repliedAt: new Date() } });
  expect((await getInboxPage(org.id)).total).toBe(420);
});
