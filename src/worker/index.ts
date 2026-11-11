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

  console.log("[worker] running");
  const stop = async () => {
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
