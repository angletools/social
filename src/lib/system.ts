import { db } from "./db";

const HEARTBEAT = "worker.heartbeat";
const STALE_MS = 3 * 60_000;

/** Called by the worker every 30s. */
export async function workerBeat(info: Record<string, unknown> = {}) {
  const value = { ...info, pid: process.pid, at: new Date().toISOString() };
  await db.appState.upsert({ where: { key: HEARTBEAT }, create: { key: HEARTBEAT, value }, update: { value } });
}

export async function getWorkerStatus() {
  const row = await db.appState.findUnique({ where: { key: HEARTBEAT } });
  const lastBeat = row?.updatedAt ?? null;
  return { alive: Boolean(lastBeat && Date.now() - lastBeat.getTime() < STALE_MS), lastBeat };
}

export const emailConfigured = () => Boolean(process.env.SMTP_URL);
