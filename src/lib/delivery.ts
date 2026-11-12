import { randomUUID } from "node:crypto";
import { db } from "./db";
import { sendEmail } from "./email";
import { postWebhook } from "./webhooks";
import { generateReport } from "./ai/report";

const LEASE_MS = 15 * 60_000;
export const MAX_DELIVERY_ATTEMPTS = 8;

/** Durable retries. Only the worker holding the claim can record a result. */
export async function deliverPending(now = new Date(), organizationId?: string, channel?: string) {
  const due = await db.delivery.findMany({
    where: {
      ...(organizationId && { organizationId }), ...(channel && { channel }),
      attempts: { lt: MAX_DELIVERY_ATTEMPTS }, nextAttemptAt: { lte: now },
      OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "SENDING", leaseUntil: { lt: now } }],
    }, orderBy: { nextAttemptAt: "asc" }, take: 50,
  });
  const sent: string[] = [];
  for (const delivery of due) {
    const token = randomUUID();
    const claimed = await db.delivery.updateMany({
      where: { id: delivery.id, attempts: delivery.attempts, OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "SENDING", leaseUntil: { lt: now } }] },
      data: { status: "SENDING", claimToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    const heartbeat = setInterval(() => { void db.delivery.updateMany({ where: { id: delivery.id, claimToken: token }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => undefined); }, 30_000);
    const assertClaim = async () => {
      if (!await db.delivery.count({ where: { id: delivery.id, claimToken: token, status: "SENDING", leaseUntil: { gt: new Date() } } })) throw new Error("Delivery claim expired");
    };
    try {
      let accepted = false;
      if (delivery.channel === "WEEKLY_REPORT" && delivery.reportId) {
        const org = await db.organization.findUniqueOrThrow({ where: { id: delivery.organizationId } });
        if (!org.weeklyReportEnabled) throw new Error("Weekly delivery is disabled");
        let report = await db.report.findUniqueOrThrow({ where: { id: delivery.reportId } });
        if (report.status !== "READY") {
          await generateReport(report.id);
          report = await db.report.findUniqueOrThrow({ where: { id: report.id } });
        }
        if (report.status !== "READY") throw new Error("Report generation failed; delivery will retry");
        const { sendWeeklyEmail } = await import("./weekly");
        await assertClaim();
        accepted = await sendWeeklyEmail(report.id);
      } else if (delivery.channel === "EMAIL") {
        await assertClaim();
        accepted = await sendEmail(delivery.recipients, delivery.subject ?? "", delivery.body ?? "", delivery.sender ?? undefined, delivery.id);
      } else if (delivery.channel === "WEBHOOK" && delivery.webhookUrl) {
        await assertClaim();
        await postWebhook(delivery.webhookUrl, delivery.body ?? "");
        accepted = true;
      }
      if (!accepted) throw new Error("Delivery unavailable or rejected; check the connection and recipients");
      const acceptedAt = new Date();
      await db.$transaction(async (tx) => {
        const done = await tx.delivery.updateMany({ where: { id: delivery.id, claimToken: token, status: "SENDING" }, data: { status: "SENT", sentAt: acceptedAt, error: null, leaseUntil: null, claimToken: null } });
        if (!done.count) throw new Error("Delivery claim expired");
        if (delivery.channel === "WEEKLY_REPORT") await tx.organization.updateMany({ where: { id: delivery.organizationId, OR: [{ weeklyReportLastSentAt: null }, { weeklyReportLastSentAt: { lt: acceptedAt } }] }, data: { weeklyReportLastSentAt: acceptedAt } });
      });
      sent.push(delivery.id);
    } catch (error) {
      await db.delivery.updateMany({ where: { id: delivery.id, claimToken: token }, data: {
        status: "FAILED", error: delivery.channel === "WEBHOOK" ? "Webhook delivery failed. Check the connection and retry." : String((error as Error).message).slice(0, 300),
        leaseUntil: null, claimToken: null,
        nextAttemptAt: new Date(now.getTime() + Math.min(6 * 3600_000, 60_000 * 2 ** delivery.attempts)),
      } });
    } finally { clearInterval(heartbeat); }
  }
  return sent;
}
