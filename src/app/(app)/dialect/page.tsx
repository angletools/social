import Link from "next/link";
import { Languages, MessageSquareWarning, Smile } from "lucide-react";
import { hasRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { getDialectBreakdown, getIntentBreakdown, getTopSlang, parseDays } from "@/lib/analytics";
import { Card, KpiCard, PageHeader } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { SentimentBar } from "@/components/sentiment";
import { DIALECT_COLORS } from "@/components/dialect-badges";
import { Glossary } from "./glossary";

export default async function DialectPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const days = parseDays((await searchParams).days);
  const scope = { orgId: user.organizationId, days };
  const [dialects, intents, slang, terms] = await Promise.all([
    getDialectBreakdown(scope),
    getIntentBreakdown(scope),
    getTopSlang(scope, 14),
    db.lexiconTerm.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
  ]);

  const total = dialects.reduce((a, d) => a + d.count, 0);
  const arabic = dialects.filter((d) => d.dialect !== "ENGLISH" && d.dialect !== "OTHER").reduce((a, d) => a + d.count, 0);
  const sarcasm = dialects.reduce((a, d) => a + d.sarcasm, 0);
  const churn = intents.find((i) => i.intent === "CHURN_RISK")?.count ?? 0;
  const maxD = Math.max(1, ...dialects.map((d) => d.count));
  const maxI = Math.max(1, ...intents.map((d) => d.count));
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <>
      <PageHeader title={t.dialectPage.title} subtitle={t.dialectPage.subtitle} actions={<RangeTabs days={days} labels={t.common.range} basePath="/dialect" />} />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label={t.dialectPage.dialectsDetected} value={String(dialects.filter((d) => d.dialect !== "OTHER").length)} icon={<Languages className="h-4 w-4" />} />
          <KpiCard label={t.dialectPage.arabicShare} value={`${pct(arabic)}%`} />
          <KpiCard label={t.dialectPage.sarcasm} value={formatNumber(sarcasm, locale)} help={t.dialectPage.sarcasmHelp} icon={<Smile className="h-4 w-4" />} />
          <KpiCard label={t.intents.CHURN_RISK} value={formatNumber(churn, locale)} icon={<MessageSquareWarning className="h-4 w-4" />} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t.dialectPage.byDialect}>
            <ul className="space-y-3">
              {dialects.map((d) => (
                <li key={d.dialect}>
                  <Link prefetch={false} href={`/mentions?dialect=${d.dialect}&days=${days}`} className="group block">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium group-hover:text-brand-700">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIALECT_COLORS[d.dialect] }} />
                        {t.dialects[d.dialect]}
                      </span>
                      <span className="text-muted ltr-nums">
                        {formatNumber(d.count, locale)} · {pct(d.count)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-sunken">
                      <div className="h-1.5 rounded-full" style={{ width: `${(d.count / maxD) * 100}%`, background: DIALECT_COLORS[d.dialect] }} />
                    </div>
                  </Link>
                </li>
              ))}
              {dialects.length === 0 && <p className="text-sm text-muted">{t.common.noData}</p>}
            </ul>
          </Card>
          <Card title={t.dialectPage.sentimentByDialect} help={t.sentiment.help}>
            <ul className="space-y-3.5">
              {dialects.map((d) => (
                <li key={d.dialect}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{t.dialects[d.dialect]}</span>
                    <span className={`font-semibold ltr-nums ${d.netSentiment >= 0 ? "text-pos" : "text-neg"}`}>
                      {d.netSentiment > 0 ? "+" : ""}
                      {d.netSentiment}
                      {d.sarcasm > 0 && <span className="ms-2 text-xs font-normal text-plum">🙃 {d.sarcasm}</span>}
                    </span>
                  </div>
                  <SentimentBar pos={d.positive} neg={d.negative} neu={d.count - d.positive - d.negative} />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card title={t.dialectPage.byIntent}>
            <ul className="space-y-3">
              {intents.map((i) => (
                <li key={i.intent}>
                  <Link prefetch={false} href={`/mentions?intent=${i.intent}&days=${days}`} className="group block">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="group-hover:text-brand-700">{t.intents[i.intent]}</span>
                      <span className="text-muted ltr-nums">{formatNumber(i.count, locale)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-sunken">
                      <div
                        className={`h-2 rounded-full ${i.intent === "CHURN_RISK" ? "bg-neg" : i.intent === "COMPLAINT" ? "bg-warn" : i.intent === "PURCHASE_INTENT" ? "bg-brand-700" : "bg-brand-500"}`}
                        style={{ width: `${(i.count / maxI) * 100}%` }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t.dialectPage.slang} help={t.dialectPage.slangHelp} bodyClassName="p-0">
            {slang.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t.dialectPage.noSlang}</p>
            ) : (
              <ul className="divide-y divide-line">
                {slang.map((s) => (
                  <li key={s.term}>
                    <Link prefetch={false} href={`/mentions?q=${encodeURIComponent(s.term)}&days=${days}`} className="flex items-center gap-4 px-5 py-2.5 hover:bg-canvas">
                      <b dir="auto" className="w-36 shrink-0 text-base">{s.term}</b>
                      <span dir="ltr" className="flex-1 text-start text-sm text-muted">{s.gloss}</span>
                      {s.dialect && <span className="hidden text-xs text-muted sm:inline">{t.dialects[s.dialect]}</span>}
                      <span className="w-20">
                        <SentimentBar pos={s.positive} neg={s.negative} neu={s.count - s.positive - s.negative} />
                      </span>
                      <span className="w-10 text-end text-sm text-muted ltr-nums">{s.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title={t.dialectPage.glossary}>
          <Glossary
            terms={terms}
            canEdit={hasRole(user, "ANALYST")}
            t={t.dialectPage}
            dialects={t.dialects}
            sentiments={{ POSITIVE: t.sentiment.POSITIVE, NEUTRAL: t.sentiment.NEUTRAL, NEGATIVE: t.sentiment.NEGATIVE }}
            addLabel={t.dialectPage.add}
          />
        </Card>
      </div>
    </>
  );
}
