import Link from "next/link";
import { Bookmark, Eye, Flame, Plus, TrendingDown, TrendingUp, Sparkle, Mountain } from "lucide-react";
import type { Platform } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { aiEnabled } from "@/lib/ai/client";
import { TREND_PLATFORMS } from "@/lib/monid/sources";
import { HelpTip, PageHeader, Meter } from "@/components/ui";
import { PlatformIcon } from "@/components/platform";
import { FormatActions, ScanButton, VoiceList, WatchForm, WatchRow, LearnVoiceForm, VoiceForm } from "./studio-client";

const TABS = ["formats", "posts", "drafts", "voice", "watches"] as const;
type Tab = (typeof TABS)[number];

const MOMENTUM_ORDER: Record<string, number> = { RISING: 0, NEW: 1, PEAKING: 2, FADING: 3 };

function MomentumBadge({ m, label }: { m: string; label: string }) {
  const Icon = m === "RISING" ? TrendingUp : m === "FADING" ? TrendingDown : m === "NEW" ? Sparkle : Mountain;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium",
        m === "RISING" && "bg-pos/10 text-pos",
        m === "NEW" && "bg-info/[0.08] text-info",
        m === "PEAKING" && "bg-sand-50 text-sand-700",
        m === "FADING" && "bg-sunken text-muted",
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
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

  return (
    <>
      <PageHeader
        title={s.title}
        actions={
          <>
            {lastScan && <span className="text-xs text-muted">{s.lastScan}: {timeAgo(lastScan, locale)}</span>}
            {canEdit && watches.length > 0 && <ScanButton ids={watches.map((w) => w.id)} label={s.scanNow} done={s.scanQueued} />}
            {canEdit && (
              <Link href="/studio/new" className="btn-primary">
                <Plus className="h-4 w-4" /> {s.draft.new}
              </Link>
            )}
          </>
        }
      />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((k) => (
          <Link
            key={k} prefetch={false} href={`/studio?tab=${k}`}
            className={cn("whitespace-nowrap border-b-2 px-4 py-2.5 text-sm", tab === k ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {s.tabs[k]}
          </Link>
        ))}
      </nav>

      {tab === "formats" && <FormatsTab orgId={orgId} locale={locale} t={t} canEdit={canEdit} hasWatches={watches.length > 0} />}
      {tab === "posts" && <PostsTab orgId={orgId} locale={locale} t={t} />}
      {tab === "drafts" && <DraftsTab orgId={orgId} locale={locale} t={t} />}
      {tab === "voice" && (
        <div className="space-y-6">
          {isAdmin && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card p-5">
                <h2 className="mb-1 font-semibold">{s.voice.learn}</h2>
                <p className="mb-4 text-sm text-muted">{s.voice.learnHint}</p>
                <LearnVoiceForm
                  monitors={(await db.monitor.findMany({ where: { organizationId: orgId, isCompetitor: false }, select: { id: true, name: true } }))}
                  labels={{ samples: s.voice.samples, fromMonitor: s.voice.fromMonitor, none: s.voice.none, submit: s.voice.learn, learning: s.voice.learning, aiOff: s.draft.aiOff }}
                  aiOn={aiEnabled()}
                />
              </section>
              <section className="card p-5">
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
            <section className="card h-fit p-5">
              <h2 className="mb-4 font-semibold">{s.watch.new}</h2>
              <WatchForm labels={s.watch} platformLabels={t.platforms} platforms={TREND_PLATFORMS} />
            </section>
          )}
        </div>
      )}
    </>
  );
}

async function FormatsTab({ orgId, locale, t, canEdit, hasWatches }: { orgId: string; locale: string; t: Awaited<ReturnType<typeof getDict>>["t"]; canEdit: boolean; hasWatches: boolean }) {
  const s = t.studio;
  const formats = (
    await db.trendFormat.findMany({
      where: { organizationId: orgId, dismissed: false },
      include: { posts: { orderBy: { viralityScore: "desc" }, take: 3 } },
      take: 60,
    })
  ).sort((a, b) => Number(b.saved) - Number(a.saved) || MOMENTUM_ORDER[a.momentum] - MOMENTUM_ORDER[b.momentum] || b.score - a.score);

  if (formats.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-muted">{s.noFormats}</p>
        {!aiEnabled() && <p className="mx-auto mt-3 max-w-lg text-xs text-sand-700">{s.needsAi}</p>}
        {!hasWatches && canEdit && (
          <Link href="/studio?tab=watches" className="btn-primary mt-5">
            <Plus className="h-4 w-4" /> {s.watch.new}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {formats.map((f) => {
        const maxScore = Math.max(1, ...formats.map((x) => x.score));
        const structure = f.structure as { label: string; description: string; labelAr?: string; descriptionAr?: string }[];
        const ar = locale === "ar";
        return (
          <article key={f.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <MomentumBadge m={f.momentum} label={s.momentum[f.momentum as keyof typeof s.momentum]} />
                  {f.saved && <Bookmark className="h-4 w-4 fill-brand-600 text-brand-600" />}
                  <span className="flex gap-1">
                    {f.platforms.map((p) => (
                      <PlatformIcon key={p} platform={p as Platform} size="sm" />
                    ))}
                  </span>
                </div>
                <h3 className="text-lg font-semibold leading-snug">{locale === "ar" ? f.nameAr : f.nameEn}</h3>
              </div>
              <div className="shrink-0 text-end">
                <div className="flex items-center gap-1 text-lg font-semibold ltr-nums">
                  <Flame className="h-4 w-4 text-sand-500" />
                  {f.score.toFixed(0)}
                </div>
                <div className="text-xs text-muted ltr-nums">
                  {f.postCount} {s.posts} · {formatNumber(f.totalViews, locale)} {s.views}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Meter value={f.score} max={maxScore} color={f.momentum === "FADING" ? "var(--color-faint)" : "var(--color-chart)"} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/80">{locale === "ar" ? f.summaryAr : f.summaryEn}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="rounded-xl bg-canvas px-3 py-2">
                <dt className="text-xs font-medium text-muted">{s.hookPattern}</dt>
                <dd dir="auto" className="mt-0.5">{ar ? f.hookPatternAr ?? f.hookPattern : f.hookPattern}</dd>
              </div>
              <div className="rounded-xl bg-canvas px-3 py-2">
                <dt className="text-xs font-medium text-muted">{s.whyItWorks}</dt>
                <dd dir="auto" className="mt-0.5">{ar ? f.whyItWorksAr ?? f.whyItWorks : f.whyItWorks}</dd>
              </div>
            </dl>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-brand-700">{s.structure} · {s.examples}</summary>
              <ol className="mt-2 space-y-1.5">
                {structure.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">{i + 1}</span>
                    <span dir="auto">
                      <b>{ar ? b.labelAr ?? b.label : b.label}</b> — {ar ? b.descriptionAr ?? b.description : b.description}
                    </span>
                  </li>
                ))}
              </ol>
              <ul className="mt-3 space-y-2">
                {f.posts.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 rounded-xl border border-line p-2.5">
                    <PlatformIcon platform={p.platform} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p dir="auto" className="line-clamp-2 text-xs">{p.text}</p>
                      <p className="mt-1 text-[11px] text-muted ltr-nums">
                        @{p.authorHandle} · <Eye className="inline h-3 w-3" /> {formatNumber(p.views, locale)} · {p.outlierRatio}× · {timeAgo(p.publishedAt, locale)}
                      </p>
                    </div>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">↗</a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
              {canEdit && (
                <Link prefetch={false} href={`/studio/new?format=${f.id}`} className="btn-primary">
                  {s.useFormat}
                </Link>
              )}
              {canEdit && <FormatActions id={f.id} saved={f.saved} labels={{ save: s.save, saved: s.saved, hide: s.hide }} />}
            </div>
          </article>
        );
      })}
    </div>
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
          <Link prefetch={false} href={`/studio/drafts/${d.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-canvas">
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
