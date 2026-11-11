import Link from "next/link";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { Database, Hash, Mail, MessageSquare, Sparkle } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, getDict } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/en";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { aiEnabled, AI_MODEL } from "@/lib/ai/client";
import { MonidClient } from "@/lib/monid/client";
import { emailConfigured, getWorkerStatus } from "@/lib/system";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { maskSecret, maskWebhook, monthStart, parseRules, senderFor, usageBand } from "@/lib/workspace";
import { DotBar } from "@/components/dots";
import { SettingsNav } from "./nav";
import { SECTIONS, S, type Section } from "./styles";
import { BrandContextForm, ChannelCard, ComplianceRules, IntegrationHead, OrgForm, PasswordForm, ProfileForm, TeamPanel, WeeklyForm, type MemberRow } from "./forms";

export const metadata = { title: "Settings" };

type User = Awaited<ReturnType<typeof requireUser>>;
type Ctx = { user: User; t: Dict; locale: "ar" | "en"; isAdmin: boolean };

const ZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Kuwait", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "Africa/Cairo", "Asia/Amman", "Asia/Beirut", "Asia/Baghdad", "Africa/Casablanca", "Europe/London", "Europe/Paris", "America/New_York", "Asia/Singapore", "UTC"];
const nf = (locale: string) => new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
const intlLocale = (locale: string) => (locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB");

function gmtOffset(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "Today, 9:42 AM" / "Yesterday, 4:30 PM" / "Sun 8 Nov, 8:00 AM" in the org's timezone. */
function dayTime(d: Date, locale: string, tz: string, labels: { today: string; yesterday: string }) {
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  const time = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(d);
  if (day(d) === day(new Date())) return fmt(labels.today, { time });
  if (day(d) === day(new Date(Date.now() - 86400_000))) return fmt(labels.yesterday, { time });
  const date = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(d);
  return `${date}${locale === "ar" ? "،" : ","} ${time}`;
}

function H2({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1">
      <h2 className="text-[20px] font-semibold">{children}</h2>
      {aside && <span className="ms-auto">{aside}</span>}
    </div>
  );
}

function Dot({ tone, children }: { tone: "pos" | "warn" | "faint" | "neg"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-[7px] whitespace-nowrap", { pos: "text-pos", warn: "text-warn", faint: "text-faint", neg: "text-neg" }[tone])}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Badge({ tone, children }: { tone: "pos" | "warn" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-lg px-[9px] text-[12.5px] font-semibold",
        tone === "pos" ? "bg-pos/[0.11] text-pos" : tone === "warn" ? "bg-warn/[0.13] text-warn" : "bg-sunken text-muted",
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const { section: raw } = await searchParams;
  const section: Section = (SECTIONS as readonly string[]).includes(raw ?? "") ? (raw as Section) : "general";
  const isAdmin = hasRole(user, "ADMIN");
  const org = user.organization;
  const p = t.settingsPage;
  const worker = await getWorkerStatus();
  const integrationsNeedWork = !process.env.MONID_API_KEY || !aiEnabled() || (!org.slackWebhookUrl && !org.teamsWebhookUrl);

  const ctx: Ctx = { user, t, locale, isAdmin };
  const body = await {
    general: General,
    team: Team,
    voice: Voice,
    integrations: Integrations,
    weekly: Weekly,
    compliance: Compliance,
    plan: Plan,
    system: System,
  }[section](ctx, worker);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:gap-8">
      <h1 className="text-[24px] leading-tight font-semibold md:text-[28px]">{t.settings.title}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <SettingsNav
          current={section}
          label={p.navLabel}
          items={SECTIONS.filter((k) => k !== "weekly" || isAdmin).map((k) => ({
            key: k,
            label: p.nav[k],
            rule: k === "plan",
            dot: k === "integrations" && integrationsNeedWork ? "warn" : k === "system" ? (worker.alive ? "pos" : "warn") : undefined,
            dotLabel: k === "system" ? (worker.alive ? p.system.everything : p.system.attention) : p.needsAttention,
          }))}
        />
        <div className="flex min-w-0 flex-col gap-5">{body}</div>
      </div>
    </div>
  );
}

// ---------- sections ----------

async function General({ user, t, locale, isAdmin }: Ctx) {
  const p = t.settingsPage;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const org = user.organization;
  const zones = [...new Set([...ZONES, org.timezone])].map((id) => ({ id, label: p.cities[id] ?? id.split("/").pop()!.replace(/_/g, " "), offset: gmtOffset(id) }));
  return (
    <>
      <H2>{p.nav.general}</H2>
      <ProfileForm
        name={user.name}
        email={user.email}
        locale={locale}
        theme={theme}
        heading={fmt(p.general.roleAt, { role: t.settings.roles[user.role], org: org.name })}
        labels={{ ...p.general, save: t.common.save }}
      />
      <PasswordForm labels={{ ...p.general, wrong: t.profile.wrong, short: t.profile.short }} />
      <OrgForm name={org.name} timezone={org.timezone} zones={zones} disabled={!isAdmin} labels={{ ...p.general, save: t.common.save, saved: t.common.saved, adminOnly: p.adminOnly }} />
    </>
  );
}

async function Team({ user, t, locale, isAdmin }: Ctx) {
  const p = t.settingsPage;
  const members = await db.user.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  const RANK: Record<Role, number> = { OWNER: 0, ADMIN: 1, ANALYST: 2, VIEWER: 3 };
  members.sort((a, b) => Number(b.active) - Number(a.active) || RANK[a.role] - RANK[b.role]);
  const seen = (d: Date | null, active: boolean) => (!active ? p.team.deactivated : !d ? p.team.never : Date.now() - d.getTime() < 120_000 ? p.team.now : timeAgo(d, locale));
  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    active: m.active,
    you: m.id === user.id,
    editable: m.role !== "OWNER" && m.id !== user.id,
    seen: m.id === user.id ? p.team.now : seen(m.lastLoginAt, m.active),
  }));
  const used = members.filter((m) => m.active).length;
  return (
    <TeamPanel
      members={rows}
      seats={fmt(p.team.seats, { used: nf(locale).format(used), limit: nf(locale).format(user.organization.seatLimit) })}
      canManage={isAdmin}
      roles={t.settings.roles}
      labels={{ ...p.team, title: p.nav.team, you: t.common.you }}
    />
  );
}

async function Voice({ user, t, isAdmin }: Ctx) {
  const p = t.settingsPage;
  const v = p.voice;
  const voice =
    (await db.brandVoice.findFirst({ where: { organizationId: user.organizationId, isDefault: true } })) ??
    (await db.brandVoice.findFirst({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } }));
  const col = "flex min-w-0 flex-col gap-2.5";
  const k = "text-[13px] text-faint";
  const item = "text-[14.5px] leading-normal [overflow-wrap:anywhere]";
  return (
    <>
      <H2>{p.nav.voice}</H2>
      <BrandContextForm value={user.organization.brandContext ?? ""} disabled={!isAdmin} labels={{ ...v, save: t.common.save, saved: t.common.saved, adminOnly: p.adminOnly }} />
      {voice ? (
        <section className={S.panel}>
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-2.5">
                <span dir="auto" className="text-[16px] font-semibold">{voice.name}</span>
                {voice.isDefault && <Badge tone="pos">{v.defaultVoice}</Badge>}
              </span>
              <span dir="auto" className="text-[14.5px] leading-relaxed text-muted">{voice.summary}</span>
            </span>
            <Link href="/studio?tab=voice" className={S.line}>{v.editInStudio}</Link>
          </div>
          <div className="grid gap-6 border-t border-sunken pt-5 sm:grid-cols-3">
            <div className={col}>
              <span className={k}>{v.dialect}</span>
              <span className={item}>{t.dialects[voice.dialect]}</span>
              <span className={cn(k, "mt-1.5")}>{v.emoji}</span>
              <span dir="auto" className={item}>{voice.emojiPolicy || v.none}</span>
            </div>
            <div className={col}>
              <span className={k}>{v.always}</span>
              {voice.dos.slice(0, 4).map((x) => <span key={x} dir="auto" className={item}>{x}</span>)}
              {voice.dos.length === 0 && <span className={cn(item, "text-faint")}>{v.none}</span>}
            </div>
            <div className={col}>
              <span className={k}>{v.never}</span>
              {voice.donts.slice(0, 3).map((x) => <span key={x} dir="auto" className={item}>{x}</span>)}
              {voice.bannedWords.length > 0 && (
                <span className="mt-0.5 flex flex-wrap gap-1.5">
                  {voice.bannedWords.slice(0, 8).map((w) => (
                    <span key={w} dir="auto" className="inline-flex h-[26px] items-center rounded-lg bg-neg/[0.11] px-[9px] text-[13px] font-medium text-neg">{w}</span>
                  ))}
                </span>
              )}
              {voice.donts.length === 0 && voice.bannedWords.length === 0 && <span className={cn(item, "text-faint")}>{v.none}</span>}
            </div>
          </div>
        </section>
      ) : (
        <section className={cn(S.panel, "items-start")}>
          <span className={S.title}>{v.noVoice}</span>
          <span className={S.sub}>{v.noVoiceBody}</span>
          <Link href="/studio?tab=voice" className={S.line}>{v.setUp}</Link>
        </section>
      )}
    </>
  );
}

async function Integrations({ user, t, locale, isAdmin }: Ctx) {
  const p = t.settingsPage;
  const L = p.integrations;
  const org = user.organization;
  const monid = MonidClient.fromEnv();
  let balance: string | null = null;
  if (monid && isAdmin) {
    try {
      const b = await Promise.race([monid.balance(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]);
      const amount = (b as { balance?: unknown; available?: unknown; amount?: unknown })?.balance ?? (b as { available?: unknown })?.available ?? (b as { amount?: unknown })?.amount;
      if (typeof amount === "number") balance = fmt(L.balance, { n: nf(locale).format(amount) });
    } catch {
      balance = null;
    }
  }
  const ai = aiEnabled();
  const icon = "h-[19px] w-[19px]";
  const keyCard = (name: string, Icon: React.ElementType, on: boolean, key: string | undefined, meta: string, off: string) => (
    <section className="card flex min-w-0 flex-col gap-[18px] p-5 sm:p-6">
      <IntegrationHead icon={<Icon className={icon} strokeWidth={1.6} />} name={name} on={on} labels={L} />
      {on && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] text-faint">{L.apiKey}</span>
          <span dir="ltr" className="flex h-10 items-center overflow-hidden rounded-[10px] bg-canvas px-3 font-mono text-[12.5px] whitespace-nowrap text-muted">
            <span className="truncate">{isAdmin ? maskSecret(key) : "••••••••••••"}</span>
          </span>
        </div>
      )}
      <span className="text-[13px] leading-normal text-muted">{on ? meta : off}</span>
      <span className="mt-auto text-[12.5px] text-faint">{L.envManaged}</span>
    </section>
  );
  return (
    <>
      <H2>{p.nav.integrations}</H2>
      <div className="flex flex-col gap-3">
        <span className="text-[13.5px] text-faint">{L.dataAi}</span>
        <div className="grid gap-5 md:grid-cols-2">
          {keyCard(L.monid, Database, Boolean(monid), process.env.MONID_API_KEY, [L.monidMeta, balance].filter(Boolean).join(" "), L.monidOff)}
          {keyCard(L.anthropic, Sparkle, ai, process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN, fmt(L.anthropicMeta, { model: AI_MODEL }), L.anthropicOff)}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-3">
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13.5px] text-faint">
          <span>{L.delivery}</span>
          <span className="text-[12.5px]">{L.deliveryHint}</span>
        </span>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <ChannelCard kind="slack" icon={<Hash className={icon} strokeWidth={1.6} />} name={L.slack} value={org.slackWebhookUrl} display={maskWebhook(org.slackWebhookUrl)} canManage={isAdmin} labels={L} />
          <ChannelCard kind="teams" icon={<MessageSquare className={icon} strokeWidth={1.6} />} name={L.teams} value={org.teamsWebhookUrl} display={maskWebhook(org.teamsWebhookUrl)} canManage={isAdmin} labels={L} />
          <ChannelCard
            kind="email"
            icon={<Mail className={icon} strokeWidth={1.6} />}
            name={L.email}
            value={org.emailFrom}
            display={senderFor(org)}
            canManage={isAdmin}
            ready={emailConfigured()}
            readyNote={L.emailOff}
            selfEmail={user.email}
            labels={L}
          />
        </div>
      </div>
    </>
  );
}

async function Weekly({ user, t, locale, isAdmin }: Ctx) {
  const p = t.settingsPage;
  const org = user.organization;
  if (!isAdmin) return <p className="text-[14px] text-muted">{p.adminOnly}</p>;
  const last = org.weeklyReportLastSentAt;
  return (
    <>
      <H2>{p.weekly.title}</H2>
      <WeeklyForm
        enabled={org.weeklyReportEnabled}
        day={org.weeklyReportDay}
        locale={org.weeklyReportLocale === "en" ? "en" : "ar"}
        recipients={org.weeklyReportRecipients}
        lastSent={last ? fmt(p.weekly.lastSent, { when: dayTime(last, locale, org.timezone, p.system) }) : p.weekly.neverSent}
        labels={{ ...p.weekly, save: t.common.save }}
      />
    </>
  );
}

async function Compliance({ user, t, locale, isAdmin }: Ctx) {
  const p = t.settingsPage;
  const since = new Date(Date.now() - 30 * 86400_000);
  const [drafts, risky] = await Promise.all([
    db.contentDraft.findMany({ where: { organizationId: user.organizationId, updatedAt: { gte: since } }, select: { content: true } }),
    db.mention.count({ where: { organizationId: user.organizationId, isRisk: true, createdAt: { gte: since } } }),
  ]);
  const checked = drafts.filter((d) => (d.content as { compliance?: unknown } | null)?.compliance);
  const flagged = checked.filter((d) => (d.content as { compliance: { status?: string } }).compliance.status !== "PASS").length;
  const stats = [
    { label: p.compliance.scriptsFlagged, n: flagged },
    { label: p.compliance.scriptsChecked, n: checked.length },
    { label: p.compliance.riskPosts, n: risky },
  ];
  return (
    <>
      <H2>{p.nav.compliance}</H2>
      <ComplianceRules rules={parseRules(user.organization.complianceRules)} canManage={isAdmin} labels={{ ...p.compliance, adminOnly: p.adminOnly }} />
      <section className="card grid gap-6 p-5 sm:grid-cols-3 sm:p-6">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5">
            <span className="text-[13.5px] text-muted">{s.label}</span>
            <span className="text-[28px] leading-tight font-semibold tracking-[-0.02em] ltr-nums">{nf(locale).format(s.n)}</span>
            <span className="text-[13px] text-faint">{p.compliance.last30}</span>
          </div>
        ))}
      </section>
    </>
  );
}

async function Plan({ user, t, locale }: Ctx) {
  const p = t.settingsPage;
  const L = p.plan;
  const org = user.organization;
  const tz = org.timezone;
  const start = monthStart(tz);
  const [mentions, monitors, seats, owner] = await Promise.all([
    db.mention.count({ where: { organizationId: org.id, createdAt: { gte: start } } }),
    db.monitor.count({ where: { organizationId: org.id } }),
    db.user.count({ where: { organizationId: org.id, active: true } }),
    db.user.findFirst({ where: { organizationId: org.id, role: { in: ["OWNER", "ADMIN"] }, active: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { email: true } }),
  ]);
  const N = nf(locale);
  const usage = [
    { label: L.mentions, used: mentions, limit: org.mentionQuota },
    { label: L.monitors, used: monitors, limit: org.monitorLimit },
    { label: L.seats, used: seats, limit: org.seatLimit },
  ].map((u) => ({ ...u, ...usageBand(u.used, u.limit) }));
  const mentionPct = usage[0].pct;
  const end = new Date(Date.UTC(new Date(start.getTime() + 3 * 86400_000).getUTCFullYear(), new Date(start.getTime() + 3 * 86400_000).getUTCMonth() + 1, 0, 12));
  const dayOnly = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", timeZone: "UTC" });
  const dayMonth = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long", timeZone: "UTC" });
  const firstDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 12));
  const color = { ok: "var(--color-chart)", warn: "var(--color-warn)", neg: "var(--color-neg)" };
  const ink = { ok: "text-ink", warn: "text-warn", neg: "text-neg" };
  const status = org.subscriptionStatus;
  const facts = [
    { k: status === "CANCELED" ? L.ends : L.renews, v: org.currentPeriodEnd ? formatDate(org.currentPeriodEnd, locale, undefined, tz) : "—" },
    { k: L.billing, v: owner?.email ?? "—", ltr: true },
    { k: L.timezone, v: `${p.cities[tz] ?? tz.split("/").pop()} · ${gmtOffset(tz)}` },
    { k: L.since, v: formatDate(org.createdAt, locale, { dateStyle: undefined, month: "long", year: "numeric" }, tz) },
  ];

  // Sample invoices: this quarter and the two before it, clearly labelled as examples.
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const amount = { STARTER: 3500, GROWTH: 12500, ENTERPRISE: 46500 }[org.plan];
  const invoices = [0, 1, 2].map((back) => {
    const qi = q - back;
    const year = now.getUTCFullYear() + Math.floor(qi / 4);
    const quarter = ((qi % 4) + 4) % 4;
    const due = new Date(Date.UTC(year, quarter * 3 + 1, 15, 12));
    return {
      period: `Q${quarter + 1} ${year}`,
      no: `INV-${year}-${String(412 - back * 105).padStart(4, "0")}`,
      amount: locale === "ar" ? new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(amount) : `SAR ${N.format(amount)}`,
      paid: back > 0,
      due: fmt(L.due, { date: new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(due) }),
    };
  });

  return (
    <>
      <H2>{p.nav.plan}</H2>
      <section className={cn(S.panel, "gap-6")}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-[26px] leading-tight font-semibold">{t.settings.plans[org.plan]}</span>
              <Badge tone={status === "ACTIVE" ? "pos" : status === "TRIALING" ? "neutral" : "warn"}>{L.status[status]}</Badge>
            </span>
            <span className="text-[14px] text-muted">{L.desc[status]}</span>
          </span>
          <a href={`mailto:${process.env.SUPPORT_EMAIL ?? "support@angle.social"}`} className={S.line}>{L.contact}</a>
        </div>
        <dl className="grid grid-cols-2 gap-6 border-t border-sunken pt-5 md:grid-cols-4">
          {facts.map((f) => (
            <div key={f.k} className="flex min-w-0 flex-col gap-1">
              <dt className="text-[13px] text-faint">{f.k}</dt>
              <dd dir={f.ltr ? "ltr" : undefined} className="truncate text-start text-[14.5px] font-medium rtl:text-end" title={f.v}>{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={S.panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className={S.title}>{L.usage}</span>
          <span className="text-[13px] text-faint">{fmt(L.period, { from: dayOnly.format(firstDay), to: dayMonth.format(end) })}</span>
        </div>
        {usage.map((u) => (
          <div key={u.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 sm:grid-cols-[160px_minmax(0,1fr)_140px]">
            <span className="text-[14.5px]">{u.label}</span>
            <span className="order-last col-span-2 sm:order-none sm:col-span-1">
              <DotBar segments={[{ value: u.pct, color: color[u.band] }]} max={100} label={`${u.label}: ${u.pct}%`} />
            </span>
            <span className="text-end text-[14px] text-muted ltr-nums">
              <span className={cn("font-semibold", ink[u.band])}>{N.format(u.used)}</span> / {N.format(u.limit)}
            </span>
          </div>
        ))}
        <span className="text-[13px] text-faint">{mentionPct > 70 ? fmt(L.near, { pct: mentionPct }) : L.fine}</span>
      </section>

      <section className="card px-5 pt-5 pb-2 sm:px-6 sm:pt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <span className={S.title}>{L.invoices}</span>
          <Badge tone="neutral">{L.sample}</Badge>
        </div>
        <p className="mb-3 text-[13px] text-faint">{L.sampleNote}</p>
        {invoices.map((v) => (
          <div key={v.no} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-sunken py-2 sm:grid-cols-[minmax(0,1fr)_140px_110px_88px]">
            <span className="flex flex-col gap-0.5">
              <span className="text-[14.5px] font-medium ltr-nums">{v.period}</span>
              <span className="text-[12.5px] text-faint ltr-nums">{v.no}</span>
            </span>
            <span className="text-end text-[14.5px] tnum sm:text-start">{v.amount}</span>
            <span className="text-[13.5px]">
              <Dot tone={v.paid ? "pos" : "warn"}>{v.paid ? L.paid : v.due}</Dot>
            </span>
            <button type="button" disabled title={L.sampleNote} className={cn(S.ghostSm, "justify-self-end sm:-me-3")}>{L.download}</button>
          </div>
        ))}
      </section>
    </>
  );
}

async function System({ user, t, locale, isAdmin }: Ctx, worker: Awaited<ReturnType<typeof getWorkerStatus>>) {
  const p = t.settingsPage;
  const L = p.system;
  const org = user.organization;
  const monid = Boolean(process.env.MONID_API_KEY?.trim());
  const ai = aiEnabled();
  const email = emailConfigured();
  const [lastSync, logs, members] = await Promise.all([
    db.monitor.aggregate({ where: { organizationId: org.id }, _max: { lastSyncAt: true } }),
    isAdmin ? db.auditLog.findMany({ where: { organizationId: org.id, action: { not: "auth.login" } }, orderBy: { createdAt: "desc" }, take: 15 }) : Promise.resolve([]),
    isAdmin ? db.user.findMany({ where: { organizationId: org.id }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
  ]);
  const synced = lastSync._max.lastSyncAt;
  const rows = [
    { label: L.worker, detail: worker.lastBeat ? fmt(L.workerSeen, { when: timeAgo(worker.lastBeat, locale) }) : L.workerNever, state: worker.alive ? L.running : L.offline, tone: worker.alive ? "pos" : "warn" },
    { label: L.monid, detail: monid ? (synced ? fmt(L.lastSync, { when: timeAgo(synced, locale) }) : L.noSync) : L.demo, state: monid ? L.connected : L.notSetUp, tone: monid ? "pos" : "faint" },
    { label: L.ai, detail: ai ? AI_MODEL : "", state: ai ? L.connected : L.notSetUp, tone: ai ? "pos" : "faint", ltr: true },
    { label: L.email, detail: email ? senderFor(org) : "", state: email ? L.configured : L.notSetUp, tone: email ? "pos" : "faint", ltr: true },
    { label: L.slack, detail: org.slackWebhookUrl ? maskWebhook(org.slackWebhookUrl) : L.noWebhook, state: org.slackWebhookUrl ? L.connected : L.notSetUp, tone: org.slackWebhookUrl ? "pos" : "faint", ltr: Boolean(org.slackWebhookUrl) },
    { label: L.teams, detail: org.teamsWebhookUrl ? maskWebhook(org.teamsWebhookUrl) : L.noWebhook, state: org.teamsWebhookUrl ? L.connected : L.notSetUp, tone: org.teamsWebhookUrl ? "pos" : "faint", ltr: Boolean(org.teamsWebhookUrl) },
  ] as const;
  const healthy = worker.alive && monid && ai;

  // Activity log, in sentences: "Faisal changed Omar Saleh's role to Analyst".
  const byId = new Map(members.map((m) => [m.id, m.name]));
  const byEmail = new Map(members.map((m) => [m.email, m.name]));
  const draftIds = [...new Set(logs.filter((l) => l.action.startsWith("draft.") && l.target).map((l) => l.target!))];
  const drafts = draftIds.length ? new Map((await db.contentDraft.findMany({ where: { id: { in: draftIds }, organizationId: org.id }, select: { id: true, title: true } })).map((d) => [d.id, d.title])) : new Map<string, string>();
  const lines = logs.map((l) => {
    const meta = (l.meta ?? {}) as { role?: Role; active?: boolean };
    let key = l.action;
    if (key === "member.update") key = meta.role ? "member.role" : meta.active === false ? "member.deactivate" : meta.active === true ? "member.reactivate" : key;
    const tpl = L.actions[key];
    const target = l.target ? (key.startsWith("member.") ? (byEmail.get(l.target) ?? l.target) : key.startsWith("draft.") ? `“${drafts.get(l.target) ?? "…"}”` : l.target) : "";
    const who = l.userId ? (byId.get(l.userId) ?? L.someone).split(" ")[0] : L.systemActor;
    return { id: l.id, when: dayTime(l.createdAt, locale, org.timezone, L), who, what: tpl ? fmt(tpl, { target, role: meta.role ? t.settings.roles[meta.role] : "" }) : null, code: l.action };
  });

  return (
    <>
      <H2 aside={<span className="text-[13.5px]"><Dot tone={healthy ? "pos" : "warn"}>{healthy ? L.everything : L.attention}</Dot></span>}>{p.nav.system}</H2>
      <section className="card px-5 py-2 sm:px-6">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-sunken py-2 first:border-0">
            <span className="min-w-0 flex-1 text-[14.5px]">{r.label}</span>
            <span dir={"ltr" in r && r.ltr ? "ltr" : undefined} className="order-last w-full truncate text-[13px] text-faint sm:order-none sm:w-auto sm:max-w-[45%]">{r.detail}</span>
            <span className="flex w-[120px] justify-end text-[13.5px]">
              <Dot tone={r.tone}>{r.state}</Dot>
            </span>
          </div>
        ))}
      </section>
      <div className="mt-3 flex items-baseline justify-between">
        <span className={S.title}>{L.activity}</span>
        <span className="text-[13px] text-faint">{L.adminsOnly}</span>
      </div>
      {isAdmin && (
        <section className="card px-5 py-2 sm:px-6">
          {lines.length === 0 && <p className="py-6 text-center text-[13.5px] text-muted">{L.noActivity}</p>}
          {lines.map((l) => (
            <div key={l.id} className="grid min-h-12 grid-cols-1 items-center gap-x-4 gap-y-0.5 border-t border-sunken py-2 first:border-0 sm:grid-cols-[136px_minmax(0,1fr)]">
              <span className="text-[13px] text-faint tnum">{l.when}</span>
              <span className="min-w-0 truncate text-[14px]">
                <span className="font-semibold" dir="auto">{l.who}</span>{" "}
                {l.what ? <span className="text-muted" dir="auto">{l.what}</span> : <code className="rounded bg-sunken px-1.5 py-0.5 text-[12px] text-muted">{l.code}</code>}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
