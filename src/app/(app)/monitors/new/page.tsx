import { redirect } from "next/navigation";
import type { MonitorType, Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { supportedPlatforms } from "@/lib/monid/sources";
import { MonitorWizard } from "./wizard";

function platformSupport() {
  return Object.fromEntries((["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"] as MonitorType[]).map((k) => [k, supportedPlatforms(k)])) as Record<MonitorType, Platform[]>;
}

export default async function NewMonitorPage() {
  const user = await requireUser();
  if (!hasRole(user, "ADMIN")) redirect("/monitors");
  const { t, locale } = await getDict();
  return <MonitorWizard t={t.monitors} v2={t.monitorsV2} platforms={t.platforms} common={t.common} support={platformSupport()} title={t.monitors.new} locale={locale} />;
}
