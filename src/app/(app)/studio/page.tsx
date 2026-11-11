import Link from "next/link";
import { Plus } from "lucide-react";
import type { Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import { TREND_PLATFORMS } from "@/lib/monid/sources";
import { HelpTip, Meter } from "@/components/ui";
import { PlatformIcon } from "@/components/platform";
import { Segmented } from "@/components/insight-ui";
import { viewsCurve } from "@/lib/insight";
import { ScanButton, VoiceList, WatchForm, WatchRow, LearnVoiceForm, VoiceForm } from "./studio-client";
import { FormatStudio, type FormatItem } from "./formats";

const TABS = ["formats", "posts", "drafts", "voice", "watches"] as const;
type Tab = (typeof TABS)[number];

const MOMENTUM_ORDER: Record<string, number> = { RISING: 0, NEW: 1, PEAKING: 2, FADING: 3 };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ tab?: string; f?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "formats";
  const orgId = user.organizationId;
  const s = t.studio;
  const canEdit = hasRole(user, "ANALYST");
  const isAdmin = hasRole(user, "ADMIN");

  const watches = await db.trendWatch.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  const lastScan = watches.map((w) => w.lastScanAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];

  const S2 = t.studio2;
  const niche = watches.length === 1 ? fmt(S2.trendingIn, { niche: watches[0].name }) : S2.trendingAll;
  const header = (
    <div key="studio-header" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold leading-tight">{s.title}</h1>
        <Segmented
          label={s.title}
          items={(["formats", "posts", "drafts"] as const).map((k) => ({ key: k, label: S2.views[k], href: k === "formats" ? "/studio" : `/studio?tab=${k}`, on: tab === k }))}
        />
      </header>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[15px] text-muted">{tab === "voice" ? s.tabs.voice : tab === "watches" ? s.tabs.watches : niche}</p>
        <nav aria-label={s.title} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
          {lastScan && <span className="text-faint">{`${s.lastScan}: ${timeAgo(lastScan, locale)}`}</span>}
          {canEdit && watches.length > 0 && <ScanButton ids={watches.map((w) => w.id)} label={s.scanNow} done={s.scanQueued} quiet />}
          {(["watches", "voice"] as const).map((k) => (
            <Link key={k} prefetch={false} href={`/studio?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("transition-colors hover:text-ink", tab === k ? "font-semibold text-ink" : "text-muted")}>
              {k === "watches" ? S2.niches : S2.voice}
            </Link>
          ))}
          {canEdit && tab !== "formats" && (
            <Link href="/studio/new" className="btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> {s.draft.new}
            </Link>
          )}
        </nav>
      </div>
    </div>
  );

  if (tab === "formats") {
    return <FormatsTab orgId={orgId} locale={locale} t={t} canEdit={canEdit} hasWatches={watches.length > 0} header={header} initialId={sp.f} />;
  }

  return (
    <div className="flex flex-col gap-7">
      {header}
      <div>
      {tab === "posts" && <PostsTab orgId={orgId} locale={locale} t={t} />}
      {tab === "drafts" && <DraftsTab orgId={orgId} locale={locale} t={t} />}
      {tab === "voice" && (
        <div className="space-y-6">
          {isAdmin && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card p-6">
                <h2 className="mb-1 font-semibold">{s.voice.learn}</h2>
                <p className="mb-4 text-sm text-muted">{s.voice.learnHint}</p>
                <LearnVoiceForm
                  monitors={(await db.monitor.findMany({ where: { organizationId: orgId, isCompetitor: false }, select: { id: true, name: true } }))}
                  labels={{ samples: s.voice.samples, fromMonitor: s.voice.fromMonitor, none: s.voice.none, submit: s.voice.learn, learning: s.voice.learning, aiOff: s.draft.aiOff }}
                  aiOn={aiEnabled()}
                />
              </section>
              <section className="card p-6">
                <h2 className="mb-4 font-semibold">{s.voice.new}</h2>
                <VoiceForm labels={s.voice} dialects={t.dialects} saveLabel={t.common.save} />
              </section>
            </div>
          )}
          <VoiceList
            voices={await db.brandVoice.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } })}
            labels={s.voice}
            dialects={t.dialects}
            canEdit={isAdmin}
            saveLabel={t.common.save}
            deleteLabel={t.common.delete}
            editLabel={t.common.edit}
          />
        </div>
      )}
      {tab === "watches" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="card divide-y divide-line">
            {watches.length === 0 && <p className="p-8 text-center text-sm text-muted">{s.watch.empty}</p>}
            {watches.map((w) => (
              <WatchRow
                key={w.id}
                id={w.id}
                canEdit={isAdmin}
                labels={{ scan: s.scanNow, done: s.scanQueued, delete: t.common.delete, confirm: t.common.confirmDelete }}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{w.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {w.seeds.map((x) => (
                      <span key={x} dir="auto" className="rounded-lg bg-canvas px-2 py-0.5 text-xs">#{x}</span>
                    ))}
                    {w.accounts.map((x) => (
                      <span key={x} className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs text-brand-700">@{x}</span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                    {w.platforms.map((p) => (
                      <PlatformIcon key={p} platform={p} size="sm" />
                    ))}
                    <span>≥ {formatNumber(w.minViews, locale)} {s.views}</span>
                    <span>· {s.lastScan}: {w.lastScanAt ? timeAgo(w.lastScanAt, locale) : t.common.never}</span>
                  </div>
                  {w.lastScanError && <p className="mt-1 text-xs text-neg" dir="ltr">{w.lastScanError}</p>}
                </div>
              </WatchRow>
            ))}
          </section>
          {isAdmin && (
            <section className="card h-fit p-6">
              <h2 className="mb-4 font-semibold">{s.watch.new}</h2>
              <WatchForm labels={s.watch} platformLabels={t.platforms} platforms={TREND_PLATFORMS} />
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

async function FormatsTab({
  orgId,
  locale,
  t,
  canEdit,
  hasWatches,
  header,
  initialId,
}: {
  orgId: string;
  locale: string;
  t: Awaited<ReturnType<typeof getDict>>["t"];
  canEdit: boolean;
  hasWatches: boolean;
  header: React.ReactNode;
  initialId?: string;
}) {
  const s = t.studio;
  const ar = locale === "ar";
  const [rows, voice] = await Promise.all([
    db.trendFormat.findMany({
      where: { organizationId: orgId, dismissed: false },
      include: { posts: { orderBy: { publishedAt: "asc" } } },
      take: 60,
    }),
    db.brandVoice.findFirst({ where: { organizationId: orgId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, dialect: true } }),
  ]);
  const formats = rows.sort((a, b) => Number(b.saved) - Number(a.saved) || MOMENTUM_ORDER[a.momentum] - MOMENTUM_ORDER[b.momentum] || b.score - a.score);

  if (formats.length === 0) {
    return (
      <div className="flex flex-col gap-7">
        {header}
        <div className="rounded-[20px] bg-surface p-10 text-center">
          <p className="text-sm text-muted">{s.noFormats}</p>
          {!aiEnabled() && <p className="mx-auto mt-3 max-w-lg text-xs text-sand-700">{s.needsAi}</p>}
          {!hasWatches && canEdit && (
            <Link href="/studio?tab=watches" className="btn-primary mt-5">
              <Plus className="h-4 w-4" /> {s.watch.new}
            </Link>
          )}
        </div>
      </div>
    );
  }

  const items: FormatItem[] = formats.map((f) => {
    const structure = (f.structure as { label: string; description: string; labelAr?: string; descriptionAr?: string }[]) ?? [];
    return {
      id: f.id,
      name: ar ? f.nameAr : f.nameEn,
      momentum: f.momentum,
      momentumLabel: s.momentum[f.momentum as keyof typeof s.momentum] ?? f.momentum,
      surfaces: (f.platforms as Platform[]).map((p) => t.studio2.surfaces[p]).join(" · "),
      views: fmt(t.studio2.viewsN, { n: formatNumber(f.totalViews, locale) }),
      summary: ar ? f.summaryAr : f.summaryEn,
      why: ar ? (f.whyItWorksAr ?? f.whyItWorks) : f.whyItWorks,
      hook: ar ? (f.hookPatternAr ?? f.hookPattern) : f.hookPattern,
      spark: viewsCurve(f.posts, 24),
      saved: f.saved,
      platforms: f.platforms as Platform[],
      structure: structure.map((b) => ({ label: ar ? (b.labelAr ?? b.label) : b.label, description: ar ? (b.descriptionAr ?? b.description) : b.description })),
      posts: [...f.posts]
        .sort((a, b) => b.viralityScore - a.viralityScore)
        .slice(0, 3)
        .map((p) => ({
          id: p.id,
          platform: p.platform,
          text: p.text,
          url: p.url,
          meta: `@${p.authorHandle ?? ""} · ${formatNumber(p.views, locale)} ${s.views} · ${p.outlierRatio}× · ${timeAgo(p.publishedAt, locale)}`,
        })),
    };
  });

  return (
    <FormatStudio
      formats={items}
      initialId={initialId}
      header={header}
      voice={voice}
      canEdit={canEdit}
      aiOn={aiEnabled()}
      dialects={t.dialects}
      labels={{
        makePost: t.studio2.makePost,
        about: t.studio2.about,
        aboutPh: t.studio2.aboutPh,
        dialect: t.studio2.dialect,
        length: t.studio2.length,
        write: t.studio2.write,
        writing: t.studio2.writing,
        moreOptions: t.studio2.moreOptions,
        aiOff: s.draft.aiOff,
        readOnly: t.studio2.readOnly,
        structure: s.structure,
        examples: s.examples,
        pickFormat: t.studio2.pickFormat,
        save: s.save,
        saved: s.saved,
        hide: s.hide,
        failed: t.common.failed,
      }}
    />
  );
}

async function PostsTab({ orgId, locale, t }: { orgId: string; locale: string; t: Awaited<ReturnType<typeof getDict>>["t"] }) {
  const s = t.studio;
  const posts = await db.trendPost.findMany({
    where: { organizationId: orgId, publishedAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
    orderBy: { viralityScore: "desc" },
    take: 50,
    include: { format: { select: { nameEn: true, nameAr: true } } },
  });
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-3 text-start font-medium">#</th>
            <th className="px-4 py-3 text-start font-medium" />
            <th className="px-4 py-3 text-start font-medium">{s.examples}</th>
            <th className="px-4 py-3 text-end font-medium">{s.views}</th>
            <th className="px-4 py-3 text-end font-medium">
              <span className="inline-flex items-center gap-1">{s.outlier} <HelpTip text={s.outlierHelp} /></span>
            </th>
            <th className="px-4 py-3 text-end font-medium">{s.virality}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {posts.map((p, i) => (
            <tr key={p.id} className="hover:bg-canvas">
              <td className="px-4 py-3 text-muted ltr-nums">{i + 1}</td>
              <td className="px-4 py-3"><PlatformIcon platform={p.platform} size="sm" /></td>
              <td className="max-w-md px-4 py-3">
                <p dir="auto" className="line-clamp-2">{p.text}</p>
                <p className="mt-1 text-xs text-muted">
                  <span className="ltr-nums">@{p.authorHandle} · {formatNumber(p.authorFollowers ?? 0, locale)}</span> · {timeAgo(p.publishedAt, locale)}
                  {p.format && <span className="ms-2 rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">{locale === "ar" ? p.format.nameAr : p.format.nameEn}</span>}
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="ms-2 text-brand-700">↗</a>}
                </p>
              </td>
              <td className="px-4 py-3 text-end ltr-nums">{formatNumber(p.views, locale)}</td>
              <td className={cn("px-4 py-3 text-end font-medium ltr-nums", p.outlierRatio >= 10 && "text-pos")}>{p.outlierRatio}×</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2.5">
                  <div className="w-16">
                    <Meter value={p.viralityScore} max={Math.max(1, ...posts.map((x) => x.viralityScore))} />
                  </div>
                  <span className="w-8 text-end ltr-nums">{p.viralityScore}</span>
                </div>
              </td>
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-muted">{t.common.noData}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

async function DraftsTab({ orgId, locale, t }: { orgId: string; locale: string; t: Awaited<ReturnType<typeof getDict>>["t"] }) {
  const s = t.studio;
  const drafts = await db.contentDraft.findMany({
    where: { organizationId: orgId },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: { format: { select: { nameEn: true, nameAr: true } } },
  });
  const tone: Record<string, string> = {
    GENERATING: "bg-sand-50 text-sand-700 animate-pulse",
    DRAFT: "bg-sunken text-ink/80",
    IN_REVIEW: "bg-info/[0.07] text-info",
    APPROVED: "bg-pos/[0.07] text-pos",
    PUBLISHED: "bg-brand-600 text-on-ink",
    FAILED: "bg-neg/[0.06] text-neg",
  };
  if (drafts.length === 0) return <p className="card p-10 text-center text-sm text-muted">{s.draft.empty}</p>;
  return (
    <ul className="card divide-y divide-line">
      {drafts.map((d) => (
        <li key={d.id}>
          <Link prefetch={false} href={`/studio/drafts/${d.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-canvas">
            <PlatformIcon platform={d.platform} />
            <div className="min-w-0 flex-1">
              <div dir="auto" className="truncate font-medium">{d.title}</div>
              <div className="text-xs text-muted">
                {d.format ? (locale === "ar" ? d.format.nameAr : d.format.nameEn) : s.draft.scratch} · {t.dialects[d.dialect]} · {fmt(s.draft.seconds, { n: d.durationSec })} · {timeAgo(d.updatedAt, locale)}
              </div>
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", tone[d.status])}>{s.draft.status[d.status as keyof typeof s.draft.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
