import { redirect } from "next/navigation";
import type { MonitorType, Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { supportedPlatforms } from "@/lib/monid/sources";
import { PageHeader } from "@/components/ui";
import { MonitorWizard } from "./wizard";

export default async function NewMonitorPage() {
  const user = await requireUser();
  if (!hasRole(user, "ADMIN")) redirect("/monitors");
  const { t } = await getDict();
  const support = Object.fromEntries(
    (["KEYWORD", "HASHTAG", "PROFILE", "TOPIC"] as MonitorType[]).map((k) => [k, supportedPlatforms(k)]),
  ) as Record<MonitorType, Platform[]>;
  return (
    <>
      <PageHeader title={t.monitors.new} />
      <MonitorWizard t={t.monitors} platforms={t.platforms} common={t.common} support={support} />
    </>
  );
}
