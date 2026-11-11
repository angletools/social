import { redirect } from "next/navigation";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { aiEnabled } from "@/lib/ai/client";
import { PageHeader } from "@/components/ui";
import { NewDraftForm } from "./form";

export default async function NewDraftPage({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
  const user = await requireUser();
  if (!hasRole(user, "ANALYST")) redirect("/studio");
  const { t, locale } = await getDict();
  const { format: formatId } = await searchParams;
  const [formats, voices] = await Promise.all([
    db.trendFormat.findMany({ where: { organizationId: user.organizationId, dismissed: false }, orderBy: { score: "desc" }, take: 50 }),
    db.brandVoice.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader title={t.studio.draft.new} />
      <NewDraftForm
        t={t.studio.draft}
        dialects={t.dialects}
        platforms={t.platforms}
        aiOn={aiEnabled()}
        initialFormat={formatId}
        formats={formats.map((f) => ({
          id: f.id,
          name: locale === "ar" ? f.nameAr : f.nameEn,
          summary: locale === "ar" ? f.summaryAr : f.summaryEn,
          hook: locale === "ar" ? f.hookPatternAr ?? f.hookPattern : f.hookPattern,
          platforms: f.platforms,
        }))}
        voices={voices.map((v) => ({ id: v.id, name: v.name, dialect: v.dialect, isDefault: v.isDefault }))}
      />
    </>
  );
}
