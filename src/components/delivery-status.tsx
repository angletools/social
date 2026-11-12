import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { retryDelivery } from "@/app/actions";

/** Delivery failures stay visible independently of alert cooldown/report generation. */
export async function DeliveryStatus({ orgId, weekly, canRetry }: { orgId: string; weekly: boolean; canRetry: boolean }) {
  const { locale } = await getDict();
  const ar = locale === "ar";
  const rows = await db.delivery.findMany({ where: { organizationId: orgId, channel: weekly ? "WEEKLY_REPORT" : { not: "WEEKLY_REPORT" } }, orderBy: { createdAt: "desc" }, take: 10, include: { report: { select: { title: true } }, notification: { select: { titleAr: true, titleEn: true } } } });
  if (!rows.length) return null;
  const labels: Record<string, string> = ar ? { PENDING: "بانتظار الإرسال", SENDING: "جارٍ الإرسال", SENT: "قبله مزوّد الإرسال", FAILED: "تعذّر الإرسال" } : { PENDING: "Queued", SENDING: "Sending", SENT: "Accepted by provider", FAILED: "Delivery failed" };
  return <section className="card mt-6 p-5">
    <h2 className="mb-3 text-base font-semibold">{ar ? "حالة الإرسال" : "Delivery status"}</h2>
    <ul className="divide-y divide-line">{rows.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1"><p dir="auto">{d.report?.title ?? (ar ? d.notification?.titleAr : d.notification?.titleEn) ?? d.subject}</p><p className={d.status === "FAILED" ? "text-neg" : "text-muted"}>{labels[d.status]}{d.status === "FAILED" ? (ar ? " · تحقق من الاتصال ثم أعد المحاولة" : " · Check the connection and retry") : ""}</p></div>
      {canRetry && d.status === "FAILED" && <form action={retryDelivery.bind(null, d.id)}><button className="btn-secondary text-sm">{ar ? "إعادة المحاولة" : "Retry delivery"}</button></form>}
    </li>)}</ul>
  </section>;
}
