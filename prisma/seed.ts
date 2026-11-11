/**
 * Seeds a demo organization with an owner account, monitors, alert rules and
 * 30 days of sample mentions. Safe to re-run.
 *   npm run db:seed
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { syncMonitor } from "../src/lib/ingest/sync";
import { evaluateAlerts } from "../src/lib/alerts";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL ?? "admin@rasd.local";
  const password = process.env.SEED_PASSWORD ?? "rasd-demo-2026";

  const org = await db.organization.upsert({
    where: { slug: "demo" },
    create: {
      name: "Nakhla Invest (Demo)",
      slug: "demo",
      plan: "ENTERPRISE",
      subscriptionStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
      monitorLimit: 50,
      seatLimit: 25,
      brandContext:
        "Nakhla Invest is a fictional Saudi fintech app (CMA-licensed) for investing in Saudi (Tadawul) and US stocks, with Shariah-compliant filters, IPO subscriptions and low fees.",
    },
    update: {},
  });

  await db.user.upsert({
    where: { email },
    create: { organizationId: org.id, email, name: "Demo Admin", role: "OWNER", locale: "ar", passwordHash: await bcrypt.hash(password, 12) },
    update: {},
  });

  const existing = await db.monitor.count({ where: { organizationId: org.id } });
  if (existing === 0) {
    const all = ["X", "INSTAGRAM", "TIKTOK", "YOUTUBE"] as const;
    const brand = await db.monitor.create({
      data: { organizationId: org.id, name: "Nakhla Invest", type: "KEYWORD", platforms: [...all], terms: ["Nakhla Invest", "نخلة"], excludeTerms: ["تمر"], languages: [], refreshMinutes: 60 },
    });
    await db.monitor.create({
      data: { organizationId: org.id, name: "Raya Trade", type: "KEYWORD", platforms: ["X", "INSTAGRAM", "TIKTOK"], terms: ["Raya Trade", "راية"], languages: [], isCompetitor: true, refreshMinutes: 180 },
    });
    await db.monitor.create({
      data: { organizationId: org.id, name: "Dana Capital", type: "KEYWORD", platforms: ["X", "TIKTOK"], terms: ["Dana Capital", "دانة"], languages: [], isCompetitor: true, refreshMinutes: 180 },
    });
    await db.monitor.create({
      data: {
        organizationId: org.id, name: "Trading-app complaints", type: "TOPIC", platforms: ["X"], terms: ["تطبيق تداول", "trading app"], languages: [],
        description: "People complaining about stock trading apps in Saudi Arabia: outages, slow orders, fees, support.", refreshMinutes: 120,
      },
    });
    await db.alertRule.createMany({
      data: [
        { organizationId: org.id, monitorId: brand.id, name: "Negative spike", kind: "NEGATIVE_SPIKE", threshold: 35, windowMinutes: 1440 },
        { organizationId: org.id, name: "Fraud & scam risk", kind: "RISK" },
        { organizationId: org.id, monitorId: brand.id, name: "Influencer mention", kind: "HIGH_REACH", threshold: 50000 },
      ],
    });
  }

  for (const m of await db.monitor.findMany({ where: { organizationId: org.id } })) {
    const n = await syncMonitor(m.id);
    console.log(`  ${m.name}: ${n} mentions`);
  }
  await evaluateAlerts(org.id);
  console.log(`\nSeeded. Sign in with ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
