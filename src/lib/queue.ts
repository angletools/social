import PgBoss from "pg-boss";

export const QUEUES = {
  tick: "scheduler-tick",
  sync: "sync-monitor",
  enrich: "enrich-org",
  alerts: "evaluate-alerts",
  report: "generate-report",
} as const;

const g = globalThis as unknown as { __boss?: Promise<PgBoss> };

/**
 * Producer-only pg-boss instance for the web app (no maintenance / cron).
 * The worker process (src/worker/index.ts) owns scheduling and job handling.
 */
export function getQueue(): Promise<PgBoss> {
  g.__boss ??= (async () => {
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, supervise: false, schedule: false });
    boss.on("error", (e) => console.error("pg-boss", e));
    await boss.start();
    for (const q of Object.values(QUEUES)) await boss.createQueue(q);
    return boss;
  })();
  return g.__boss;
}

export async function enqueue(queue: (typeof QUEUES)[keyof typeof QUEUES], data: object, singletonKey?: string) {
  const boss = await getQueue();
  return boss.send(queue, data, singletonKey ? { singletonKey, singletonSeconds: 60 } : {});
}
