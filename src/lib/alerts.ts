import type { AlertRule, Severity } from "@prisma/client";
import { db } from "./db";
import { sendEmail } from "./email";
import { postWebhook } from "./webhooks";

type Hit = { severity: Severity; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string; link: string };

async function check(rule: AlertRule): Promise<Hit | null> {
  const since = new Date(Date.now() - rule.windowMinutes * 60_000);
  // Only consider mentions created after the last trigger to avoid repeat alerts on the same posts.
  const createdAfter = rule.lastTriggeredAt && rule.lastTriggeredAt > since ? rule.lastTriggeredAt : since;
  const base = {
    organizationId: rule.organizationId,
    relevant: true,
    ...(rule.monitorId && { monitorId: rule.monitorId }),
  };
  const link = rule.monitorId ? `/mentions?monitor=${rule.monitorId}` : "/mentions";

  switch (rule.kind) {
    case "VOLUME_SPIKE": {
      const n = await db.mention.count({ where: { ...base, publishedAt: { gte: since } } });
      if (n <= rule.threshold) return null;
      return {
        severity: "WARNING",
        titleEn: `${rule.name}: ${n} mentions`,
        titleAr: `${rule.name}: ${n} إشارة`,
        bodyEn: `Mentions reached ${n} in the last ${rule.windowMinutes / 60}h (limit ${rule.threshold}).`,
        bodyAr: `وصلت الإشارات إلى ${n} خلال آخر ${rule.windowMinutes / 60} ساعة (الحد ${rule.threshold}).`,
        link,
      };
    }
    case "NEGATIVE_SPIKE": {
      const [total, neg] = await Promise.all([
        db.mention.count({ where: { ...base, publishedAt: { gte: since }, sentiment: { not: null } } }),
        db.mention.count({ where: { ...base, publishedAt: { gte: since }, sentiment: "NEGATIVE" } }),
      ]);
      if (total < 5) return null; // too little data to call a spike
      const pct = Math.round((neg / total) * 100);
      if (pct <= rule.threshold) return null;
      return {
        severity: pct >= rule.threshold * 1.5 ? "CRITICAL" : "WARNING",
        titleEn: `${rule.name}: ${pct}% negative`,
        titleAr: `${rule.name}: ${pct}% سلبي`,
        bodyEn: `${neg} of ${total} recent mentions are negative.`,
        bodyAr: `${neg} من أصل ${total} إشارة حديثة سلبية.`,
        link: `${link}${link.includes("?") ? "&" : "?"}sentiment=NEGATIVE`,
      };
    }
    case "KEYWORD": {
      if (!rule.keyword) return null;
      const hits = await db.mention.findMany({
        where: { ...base, createdAt: { gte: createdAfter }, text: { contains: rule.keyword, mode: "insensitive" } },
        take: 3,
        orderBy: { publishedAt: "desc" },
      });
      if (hits.length === 0) return null;
      return {
        severity: "WARNING",
        titleEn: `"${rule.keyword}" mentioned`,
        titleAr: `ذُكرت كلمة «${rule.keyword}»`,
        bodyEn: hits[0].text.slice(0, 200),
        bodyAr: hits[0].text.slice(0, 200),
        link: `/mentions?q=${encodeURIComponent(rule.keyword)}`,
      };
    }
    case "HIGH_REACH": {
      const hit = await db.mention.findFirst({
        where: { ...base, createdAt: { gte: createdAfter }, authorFollowers: { gte: Math.round(rule.threshold) } },
        orderBy: { authorFollowers: "desc" },
      });
      if (!hit) return null;
      const who = `@${hit.authorHandle} (${hit.authorFollowers?.toLocaleString("en")})`;
      return {
        severity: hit.sentiment === "NEGATIVE" ? "CRITICAL" : "INFO",
        titleEn: `Influential mention by ${who}`,
        titleAr: `إشارة مؤثرة من ${who}`,
        bodyEn: hit.text.slice(0, 200),
        bodyAr: hit.text.slice(0, 200),
        link: `/mentions?q=${encodeURIComponent(hit.authorHandle ?? "")}`,
      };
    }
    case "RISK": {
      const hit = await db.mention.findFirst({
        where: { ...base, createdAt: { gte: createdAfter }, isRisk: true },
        orderBy: { publishedAt: "desc" },
      });
      if (!hit) return null;
      return {
        severity: "CRITICAL",
        titleEn: `Risk detected: ${hit.riskReason ?? "review needed"}`.slice(0, 140),
        titleAr: `رُصد خطر محتمل يحتاج مراجعة`,
        bodyEn: hit.text.slice(0, 200),
        bodyAr: hit.text.slice(0, 200),
        link: "/mentions?risk=1",
      };
    }
  }
}

/** Evaluates all enabled rules for an org and records notifications. */
export async function evaluateAlerts(organizationId: string) {
  const rules = await db.alertRule.findMany({ where: { organizationId, enabled: true } });
  let fired = 0;
  for (const rule of rules) {
    if (rule.lastTriggeredAt && Date.now() - rule.lastTriggeredAt.getTime() < rule.cooldownMinutes * 60_000) continue;
    const hit = await check(rule);
    if (!hit) continue;
    fired++;
    await db.$transaction([
      db.notification.create({ data: { organizationId, ruleId: rule.id, ...hit } }),
      db.alertRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: new Date() } }),
    ]);
    if (rule.webhookUrl) {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const icon = hit.severity === "CRITICAL" ? "🔴" : hit.severity === "WARNING" ? "🟠" : "🔵";
      await postWebhook(rule.webhookUrl, `${icon} *${hit.titleEn}*\n${hit.titleAr}\n> ${hit.bodyEn.replace(/\n/g, " ")}\n${appUrl}${hit.link}`).catch((e) =>
        console.error("alert webhook failed", e),
      );
    }
    if (rule.notifyEmail && rule.emails.length) {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      await sendEmail(
        rule.emails,
        `[angle social] ${hit.titleEn}`,
        `${hit.titleAr}\n${hit.bodyAr}\n\n${hit.titleEn}\n${hit.bodyEn}\n\n${appUrl}${hit.link}`,
      ).catch((e) => console.error("alert email failed", e));
    }
  }
  return fired;
}
