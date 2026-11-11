/**
 * Background worker: schedules monitor collection, runs AI enrichment,
 * evaluates alerts and writes reports. Run with `npm run worker`.
 */
import PgBoss from "pg-boss";
import { db } from "../lib/db";
import { QUEUES } from "../lib/queue";
import { syncMonitor } from "../lib/ingest/sync";
import { enrichPending } from "../lib/ai/enrich";
import { evaluateAlerts } from "../lib/alerts";
import { generateReport } from "../lib/ai/report";
import { scanWatch } from "../lib/trends/scan";
import { generateDraft } from "../lib/ai/studio";
import { workerBeat } from "../lib/system";
import { runDueWeeklyReports } from "../lib/weekly";

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });
  boss.on("error", (e) => console.error("[worker] pg-boss error", e));
  await boss.start();
  for (const q of Object.values(QUEUES)) await boss.createQueue(q);

  // Every minute: queue collection for monitors that are due.
  await boss.schedule(QUEUES.tick, "* * * * *");
  await boss.work(QUEUES.tick, async () => {
    const due = await db.monitor.findMany({
      where: { status: "ACTIVE", OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: new Date() } }] },
      select: { id: true },
      take: 100,
    });
    for (const m of due) {
      await boss.send(QUEUES.sync, { monitorId: m.id }, { singletonKey: m.id, singletonSeconds: 300, retryLimit: 2, retryDelay: 60 });
    }
  });

  await boss.work<{ monitorId: string }>(QUEUES.sync, { batchSize: 1 }, async ([job]) => {
    const n = await syncMonitor(job.data.monitorId);
    const m = await db.monitor.findUnique({ where: { id: job.data.monitorId }, select: { organizationId: true } });
    console.log(`[worker] synced ${job.data.monitorId}: ${n} new`);
    if (m) await boss.send(QUEUES.enrich, { organizationId: m.organizationId }, { singletonKey: m.organizationId, singletonSeconds: 30 });
  });

  await boss.work<{ organizationId: string }>(QUEUES.enrich, { batchSize: 1 }, async ([job]) => {
    let total = 0;
    for (;;) {
      const n = await enrichPending(job.data.organizationId, 200);
      total += n;
      if (n < 200) break;
    }
    if (total) console.log(`[worker] enriched ${total} for ${job.data.organizationId}`);
    await boss.send(QUEUES.alerts, { organizationId: job.data.organizationId });
  });

  await boss.work<{ organizationId: string }>(QUEUES.alerts, async ([job]) => {
    const fired = await evaluateAlerts(job.data.organizationId);
    if (fired) console.log(`[worker] ${fired} alert(s) for ${job.data.organizationId}`);
  });

  await boss.work<{ reportId: string }>(QUEUES.report, async ([job]) => {
    try {
      await generateReport(job.data.reportId);
    } catch (e) {
      await db.report.update({
        where: { id: job.data.reportId },
        data: { status: "FAILED", error: String((e as Error).message).slice(0, 500) },
      });
      throw e;
    }
  });

  // Daily at 05:00 Riyadh (02:00 UTC): scan every niche for viral formats.
  await boss.schedule(QUEUES.trendDaily, "0 2 * * *");
  await boss.work(QUEUES.trendDaily, async () => {
    const watches = await db.trendWatch.findMany({ where: { enabled: true }, select: { id: true } });
    for (const w of watches) await boss.send(QUEUES.trendScan, { watchId: w.id }, { singletonKey: w.id, singletonSeconds: 600 });
  });

  await boss.work<{ watchId: string }>(QUEUES.trendScan, async ([job]) => {
    const r = await scanWatch(job.data.watchId);
    console.log(`[worker] trend scan ${job.data.watchId}: ${r.posts} posts, ${r.formats} formats`);
  });

  await boss.work<{ draftId: string; instruction?: string }>(QUEUES.draft, async ([job]) => {
    try {
      await generateDraft(job.data.draftId, job.data.instruction);
    } catch (e) {
      const d = await db.contentDraft.findUnique({ where: { id: job.data.draftId } });
      await db.contentDraft.update({
        where: { id: job.data.draftId },
        // A failed revision keeps the previous version usable.
        data: { status: d?.content ? "DRAFT" : "FAILED", error: String((e as Error).message).slice(0, 500) },
      });
      throw e;
    }
  });

  // Hourly: send weekly reports that are due (08:00+ Riyadh on the chosen day).
  await boss.schedule(QUEUES.weekly, "5 * * * *");
  await boss.work(QUEUES.weekly, async () => {
    const sent = await runDueWeeklyReports();
    if (sent.length) console.log(`[worker] weekly reports sent: ${sent.join(", ")}`);
  });

  // Nightly housekeeping at 03:00 Riyadh (00:00 UTC).
  await boss.schedule(QUEUES.maintenance, "0 0 * * *");
  await boss.work(QUEUES.maintenance, async () => {
    const day = 86400_000;
    const [a, sess, n] = await Promise.all([
      db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - day) } } }),
      db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      db.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: new Date(Date.now() - 90 * day) } } }),
    ]);
    console.log(`[worker] maintenance: ${a.count} attempts, ${sess.count} sessions, ${n.count} notifications removed`);
  });

  // Heartbeat so the app can tell admins when background processing is down.
  await workerBeat();
  const beat = setInterval(() => workerBeat().catch((e) => console.error("[worker] heartbeat failed", e)), 30_000);

  console.log("[worker] running");
  const stop = async () => {
    clearInterval(beat);
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
