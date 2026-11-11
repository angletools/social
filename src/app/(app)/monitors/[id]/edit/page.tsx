import { notFound, redirect } from "next/navigation";
import type { MonitorType, Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { supportedPlatforms } from "@/lib/monid/sources";
import { MonitorWizard } from "../../new/wizard";

export default async function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!hasRole(user, "ADMIN")) redirect(`/monitors/${id}`);
  const m = await db.monitor.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!m) notFound();
  const { t, locale } = await getDict();
  const support = Object.fromEntries((["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"] as MonitorType[]).map((k) => [k, supportedPlatforms(k)])) as Record<MonitorType, Platform[]>;
  return (
    <MonitorWizard
      t={t.monitors}
      v2={t.monitorsV2}
      platforms={t.platforms}
      common={t.common}
      support={support}
      title={t.monitorsV2.detail.editTitle}
      locale={locale}
      initial={{
        id: m.id,
        name: m.name,
        type: m.type,
        terms: m.terms,
        excludeTerms: m.excludeTerms,
        description: m.description ?? "",
        languages: m.languages.filter((l): l is "ar" | "en" => l === "ar" || l === "en"),
        platforms: m.platforms,
        isCompetitor: m.isCompetitor,
        refreshMinutes: m.refreshMinutes,
      }}
    />
  );
}
