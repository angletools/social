import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import type { DraftContent } from "@/lib/ai/studio";
import { AutoRefresh } from "@/components/auto-refresh";
import { DraftEditor, type VersionRow } from "./editor";
import { ClipsProvider } from "./rough-cut";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { id } = await params;
  const d = await db.contentDraft.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { format: { select: { id: true, nameEn: true, nameAr: true } }, versions: { orderBy: { n: "desc" }, take: 30, select: { id: true, n: true, kind: true, instruction: true, createdById: true, createdAt: true } } },
  });
  if (!d) notFound();
  const P = t.draftPage;
  const formatName = d.format ? (locale === "ar" ? d.format.nameAr : d.format.nameEn) : null;
  const authors = new Map(
    (await db.user.findMany({ where: { id: { in: [...new Set(d.versions.map((v) => v.createdById).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name.split(" ")[0]]),
  );
  const versions: VersionRow[] = d.versions.map((v) => ({
    n: v.n,
    when: timeAgo(v.createdAt, locale),
    what:
      v.kind === "GENERATED"
        ? formatName && v.n === 1
          ? fmt(P.firstFrom, { format: formatName })
          : P.firstDraft
        : v.kind === "REWRITE"
          ? `“${v.instruction ?? ""}”`
          : v.kind === "RESTORE"
            ? fmt(P.restored, { n: v.instruction ?? "?" })
            : v.createdById && authors.get(v.createdById)
              ? fmt(P.editedBy, { name: authors.get(v.createdById)! })
              : P.manualEdits,
    quoted: v.kind === "REWRITE",
  }));

  const back = (
    <Link key="back" href="/studio?tab=drafts" className="-ms-1.5 inline-flex h-9 items-center gap-1.5 rounded-[10px] ps-1.5 pe-2.5 text-[14px] text-muted transition-colors hover:text-ink max-md:h-11">
      <ChevronLeft aria-hidden className="h-4 w-4 rtl:rotate-180" strokeWidth={1.7} />
      {P.back}
    </Link>
  );

  return (
    <>
      <AutoRefresh active={d.status === "GENERATING"} every={4000} maxMs={300_000} />
      {d.content ? (
        <ClipsProvider>
          <DraftEditor
            id={d.id}
            versionKey={`${d.versions[0]?.id ?? "none"}:${d.status}`}
            status={d.status}
            error={d.error}
            content={d.content as unknown as DraftContent}
            title={d.title}
            meta={{
              format: formatName,
              platform: t.platforms[d.platform].replace(/ \(.*\)$/, ""),
              dialect: t.dialects[d.dialect],
              seconds: fmt(t.studio.draft.seconds, { n: d.durationSec }),
              edited: fmt(P.edited, { when: timeAgo(d.updatedAt, locale) }),
            }}
            back={back}
            canEdit={hasRole(user, "ANALYST")}
            canApprove={hasRole(user, "ADMIN")}
            versions={versions}
            locale={locale}
            P={P}
            S={t.studio.draft}
            unsupported={t.studio.rough.unsupported}
          />
        </ClipsProvider>
      ) : (
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
          {back}
          <h1 dir="auto" className="text-[24px] leading-[1.3] font-semibold md:text-[28px]">{d.title}</h1>
          {d.status === "FAILED" ? (
            <div className="card p-8 text-center text-[14px] text-neg">
              {t.reports.failed}
              {d.error && <p className="mt-2 text-xs" dir="ltr">{d.error}</p>}
            </div>
          ) : (
            <div className="card flex flex-col items-center px-6 py-20 text-center" aria-busy>
              <Loader2 className="mb-4 h-7 w-7 animate-spin text-muted motion-reduce:animate-none" />
              <p className="text-[15px] font-medium">{t.studio.draft.generating}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
