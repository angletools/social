import type { AlertRule, Severity } from "@prisma/client";
import { db } from "./db";
import { sendEmail } from "./email";
import { postWebhook } from "./webhooks";

type Hit = { severity: Severity; titleEn: string; titleAr: string; bodyEn: string; bodyAr: string; link: string };

/** Checks one rule against recent mentions. Returns the notification to send, or null. */
export async function checkRule(rule: AlertRule): Promise<Hit | null> {
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
      // Several words can be watched at once: "احتيال، نصب، hack".
      const words = (rule.keyword ?? "").split(/[,،]/).map((w) => w.trim()).filter(Boolean);
      if (words.length === 0) return null;
      const hits = await db.mention.findMany({
        where: { ...base, createdAt: { gte: createdAfter }, OR: words.map((w) => ({ text: { contains: w, mode: "insensitive" as const } })) },
        take: 3,
        orderBy: { publishedAt: "desc" },
      });
      if (hits.length === 0) return null;
      const matched = words.find((w) => hits[0].text.toLowerCase().includes(w.toLowerCase())) ?? words[0];
      return {
        severity: "WARNING",
        titleEn: `"${matched}" mentioned`,
        titleAr: `ذُكرت كلمة «${matched}»`,
        bodyEn: hits[0].text.slice(0, 200),
        bodyAr: hits[0].text.slice(0, 200),
        link: `/mentions?q=${encodeURIComponent(matched)}`,
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
    case "CHURN_RISK": {
      // "May leave us": people saying they'll close their account or move to a competitor.
      // Counts posts in the window that were classified since the last alert, so the same
      // posts don't fire twice once the cooldown ends.
      const where = {
        ...base,
        intent: "CHURN_RISK" as const,
        publishedAt: { gte: since },
        OR: [{ enrichedAt: { gte: createdAfter } }, { enrichedAt: null, createdAt: { gte: createdAfter } }],
      };
      const n = await db.mention.count({ where });
      if (n <= rule.threshold) return null;
      const top = await db.mention.findFirst({ where, orderBy: [{ authorFollowers: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }] });
      const hours = Math.round(rule.windowMinutes / 60);
      return {
        severity: n >= Math.max(3, rule.threshold * 2) ? "CRITICAL" : "WARNING",
        titleEn: n === 1 ? `Someone says they may leave us` : `${n} people say they may leave us`,
        titleAr: n === 1 ? `عميل يقول إنه قد يغادر` : `${n} أشخاص يقولون إنهم قد يغادرون`,
        bodyEn: top ? top.text.slice(0, 200) : `${n} churn-risk posts in the last ${hours}h (limit ${rule.threshold}).`,
        bodyAr: top ? top.text.slice(0, 200) : `${n} منشورات عن نية المغادرة خلال آخر ${hours} ساعة (الحد ${rule.threshold}).`,
        link: `${link}${link.includes("?") ? "&" : "?"}intent=CHURN_RISK`,
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
    const hit = await checkRule(rule);
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
