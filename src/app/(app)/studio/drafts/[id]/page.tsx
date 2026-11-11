import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import type { DraftContent } from "@/lib/ai/studio";
import { PlatformIcon } from "@/components/platform";
import { AutoRefresh } from "@/components/auto-refresh";
import { DraftEditor } from "./editor";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { id } = await params;
  const d = await db.contentDraft.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { format: { select: { id: true, nameEn: true, nameAr: true } }, voice: { select: { name: true } } },
  });
  if (!d) notFound();
  const s = t.studio;
  const history = (Array.isArray(d.history) ? d.history : []) as { at: string; instruction: string | null }[];

  return (
    <>
      <AutoRefresh active={d.status === "GENERATING"} every={4000} maxMs={300_000} />
      <Link href="/studio?tab=drafts" className="btn-ghost mb-3 -ms-3">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {s.tabs.drafts}
      </Link>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <PlatformIcon platform={d.platform} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 dir="auto" className="text-2xl font-semibold tracking-tight">{d.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {d.format ? (
              <>
                {s.draft.basedOn}: <Link href={`/studio?tab=formats`} className="text-brand-700 hover:underline">{locale === "ar" ? d.format.nameAr : d.format.nameEn}</Link> ·{" "}
              </>
            ) : null}
            {t.dialects[d.dialect]} · {fmt(s.draft.seconds, { n: d.durationSec })} · {s.draft.goals[d.goal as keyof typeof s.draft.goals] ?? d.goal}
            {d.voice && <> · {d.voice.name}</>} · {timeAgo(d.updatedAt, locale)}
          </p>
          <p dir="auto" className="mt-2 max-w-3xl text-sm text-muted">{d.brief}</p>
        </div>
      </div>

      {d.status === "GENERATING" && !d.content && (
        <div className="card flex flex-col items-center px-6 py-20 text-center">
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-brand-600" />
          <p className="font-medium">{s.draft.generating}</p>
        </div>
      )}
      {d.status === "FAILED" && !d.content && (
        <div className="card p-8 text-center text-sm text-neg">
          {t.reports.failed}
          {d.error && <p className="mt-2 text-xs" dir="ltr">{d.error}</p>}
        </div>
      )}
      {d.content && (
        <DraftEditor
          id={d.id}
          status={d.status}
          error={d.error}
          content={d.content as unknown as DraftContent}
          title={d.title}
          canEdit={hasRole(user, "ANALYST")}
          canApprove={hasRole(user, "ADMIN")}
          versions={history.map((h) => ({ when: timeAgo(h.at, locale), instruction: h.instruction }))}
          t={s}
          roughT={s.rough}
          common={{ delete: t.common.delete, confirm: t.common.confirmDelete }}
        />
      )}
    </>
  );
}
