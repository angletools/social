/**
 * Seeds a demo organization with an owner account, monitors, alert rules and
 * 30 days of sample mentions. Safe to re-run.
 *   npm run db:seed
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { syncMonitor } from "../src/lib/ingest/sync";
import { evaluateAlerts } from "../src/lib/alerts";
import { scanWatch } from "../src/lib/trends/scan";
import { reflowBeats } from "../src/lib/trends/score";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL ?? "admin@rasd.local";
  const password = process.env.SEED_PASSWORD ?? "rasd-demo-2026";

  const existingOrg = await db.organization.findUnique({ where: { slug: "demo" } });
  if (existingOrg && existingOrg.dataMode !== "DEMO") throw new Error("Refusing to seed a live workspace");
  const org = await db.organization.upsert({
    where: { slug: "demo" },
    create: {
      name: "Nakhla Invest (Demo)",
      slug: "demo",
      dataMode: "DEMO",
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

  // Two teammates so assignment and roles can be demoed.
  for (const [name, mail, role] of [
    ["Noura Al-Harbi", "noura@rasd.local", "ANALYST"],
    ["Omar Saleh", "omar@rasd.local", "VIEWER"],
  ] as const) {
    await db.user.upsert({
      where: { email: mail },
      create: { organizationId: org.id, email: mail, name, role, locale: "ar", passwordHash: await bcrypt.hash(password, 12) },
      update: {},
    });
  }

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
  await seedDialectAndStudio(org.id);
  console.log(`\nSeeded. Sign in with ${email} / ${password}`);
}

async function seedDialectAndStudio(organizationId: string) {
  await db.organization.update({
    where: { id: organizationId },
    data: {
      complianceRules:
        "CMA marketing rules apply. Never promise or imply guaranteed returns. Promotional content must say that investing involves risk (الاستثمار ينطوي على مخاطر). No personalised investment advice or specific stock recommendations in public. Never ask for OTP, passwords or ID numbers in public; direct customers to the in-app chat or 8001234567.",
    },
  });

  const terms: { term: string; meaning: string; dialect?: "SAUDI" | "EGYPTIAN"; sentimentHint?: "POSITIVE" | "NEGATIVE" | "NEUTRAL" }[] = [
    { term: "نخلة", meaning: "Customers' short name for our brand Nakhla Invest — not the palm tree (unless the post is about dates or farming)." },
    { term: "يوم ٢٧", meaning: "Salary day in Saudi Arabia (government payday). Peak time for deposits and investing.", dialect: "SAUDI" },
    { term: "التعليق", meaning: "In our context: the app freezing or hanging, not a comment.", sentimentHint: "NEGATIVE" },
    { term: "النخلاويين", meaning: "Playful name for our loyal users (community nickname).", dialect: "SAUDI", sentimentHint: "POSITIVE" },
    { term: "الاستثمار التلقائي", meaning: "Our Auto-invest feature: invests a set % of salary on payday." },
  ];
  for (const t of terms) {
    await db.lexiconTerm.upsert({
      where: { organizationId_term: { organizationId, term: t.term } },
      create: { organizationId, ...t },
      update: {},
    });
  }

  // Reply history so response-time metrics have data.
  if ((await db.replyDraft.count({ where: { organizationId } })) === 0) {
    const replies = [
      "نعتذر لك عن الإزعاج 🙏 فريقنا يتابع مشكلة التعليق الحين، ممكن تراسلنا على الخاص عشان نتابع حالتك بالتفصيل؟",
      "حياك الله، طلبات السحب عادة تكتمل خلال يوم عمل. أرسل لنا رقم الطلب في المحادثة داخل التطبيق ونتابعه معك فورًا.",
      "سلامات! نعتذر عن التأخير، تواصلوا معنا عبر المحادثة في التطبيق وبنخدمكم بأسرع وقت.",
    ];
    const complaints = await db.mention.findMany({
      where: { organizationId, intent: { in: ["COMPLAINT", "QUESTION"] }, publishedAt: { lt: new Date(Date.now() - 3 * 86400_000) } },
      take: 24,
      orderBy: { publishedAt: "desc" },
    });
    for (const [i, m] of complaints.entries()) {
      const repliedAt = new Date(m.publishedAt.getTime() + (15 + ((i * 37) % 160)) * 60_000);
      await db.replyDraft.create({
        data: { organizationId, mentionId: m.id, text: replies[i % replies.length], dialect: "SAUDI", status: "POSTED", postedAt: repliedAt, approach: "Apologize and move to DM" },
      });
      await db.mention.update({ where: { id: m.id }, data: { repliedAt, status: "REVIEWED" } });
    }
  }

  // Assign a few urgent posts to the analyst.
  const analyst = await db.user.findUnique({ where: { email: "noura@rasd.local" } });
  if (analyst && (await db.mention.count({ where: { organizationId, assignedToId: { not: null } } })) === 0) {
    const urgent = await db.mention.findMany({
      where: { organizationId, intent: "CHURN_RISK", repliedAt: null },
      orderBy: { publishedAt: "desc" },
      take: 4,
      select: { id: true },
    });
    await db.mention.updateMany({ where: { id: { in: urgent.map((u) => u.id) } }, data: { assignedToId: analyst.id } });
  }

  let voice = await db.brandVoice.findFirst({ where: { organizationId } });
  voice ??= await db.brandVoice.create({
    data: {
      organizationId,
      isDefault: true,
      name: "Nakhla — friendly expert",
      summary:
        "Nakhla talks like a smart, well-informed friend from Riyadh: warm Saudi white dialect, short sentences, light humour drawn from everyday Saudi life (salary day, istiraha nights, traffic on King Fahd Road). It makes investing feel approachable without hype, explains one idea at a time, and always respects people's money and beliefs.",
      dialect: "SAUDI",
      traits: ["Friendly", "Clear", "Reassuring", "Lightly witty", "Never preachy"],
      dos: [
        "Open with a relatable everyday moment",
        "One idea per post, explained in plain words",
        "Use digits for numbers and percentages",
        "End with a soft, specific CTA",
        "Add the risk line on promotional posts",
      ],
      donts: ["Promise returns or 'easy money'", "Shame people for spending", "Use heavy slang or mock other dialects", "Recommend specific stocks"],
      bannedWords: ["مضمون", "اغتنِ بسرعة", "guaranteed", "to the moon"],
      audience: "Saudi professionals 22–40, new or casual investors",
      ctaStyle: "Soft and practical: 'احفظه'، 'جرّبها من التطبيق'، 'شاركه مع خويك'",
      emojiPolicy: "0–2 per post, warm ones (🙌 😌 📌); never 🚀 or 💰💰",
      examples: [
        "الراتب نزل؟ قبل لا تفتح تطبيقات التوصيل… خلّ ١٠٪ تروح لمستقبلك أول 😌",
        "ما تحتاج تكون خبير عشان تبدأ. تحتاج بس تبدأ صح 📌",
        "سؤال اليوم من النخلاويين: وش الفرق بين السهم والصندوق؟ الجواب في ٣٠ ثانية 👇",
      ],
    },
  });

  let watch = await db.trendWatch.findFirst({ where: { organizationId } });
  if (!watch) {
    watch = await db.trendWatch.create({
      data: {
        organizationId,
        name: "Personal finance — Saudi",
        seeds: ["ادخار", "استثمار", "الراتب", "personal finance saudi", "الأسهم_السعودية"],
        accounts: ["money.with.ahmed", "reem.invests"],
        platforms: ["TIKTOK", "INSTAGRAM", "YOUTUBE"],
        minViews: 20000,
      },
    });
    const r = await scanWatch(watch.id);
    console.log(`  Trend scan: ${r.posts} viral posts`);
  }

  if ((await db.contentDraft.count({ where: { organizationId } })) === 0) {
    const format = await db.trendFormat.findFirst({ where: { organizationId, nameEn: "Salary day vs. end of month" } });
    const beats = reflowBeats([
      { start: 0, duration: 2, shot: 1, onScreen: "أنا يوم ٢٧ 💸", vo: "", visual: "Creator struts out of an office tower in sunglasses, iced coffee in hand, slow motion." },
      { start: 0, duration: 2, shot: 2, onScreen: "أنا يوم ٢٠ 🥲", vo: "", visual: "Hard cut: same creator on the majlis floor counting coins, sad oud sting." },
      { start: 0, duration: 5, shot: 3, onScreen: "وين راحت الفلوس؟", vo: "كل شهر نفس السالفة… الراتب ينزل، وفي أسبوع يختفي", visual: "Fast montage: delivery bags at the door, coffee receipts, event tickets." },
      { start: 0, duration: 6, shot: 4, onScreen: "الحل؟ ادفع لنفسك أول", vo: "اللي غيّر شهري: أول ما ينزل الراتب، جزء منه يروح للاستثمار قبل لا ألمسه", visual: "Creator talks to camera from the driver's seat, parked, confident." },
      { start: 0, duration: 7, shot: 5, onScreen: "١٠٪ تلقائي يوم الراتب", vo: "في نخلة فعّلت الاستثمار التلقائي يوم ٢٧… أحدد النسبة وخلاص، ما أفكر فيها", visual: "Screen recording: Auto-invest settings, choosing 10% on the 27th." },
      { start: 0, duration: 5, shot: 6, onScreen: "يوم ٢٠ صار غير 😌", vo: "والحين يوم ٢٠ صار يوم عادي، مو يوم أزمة", visual: "Day 20: creator relaxed at an istiraha with friends, smiles at camera." },
      { start: 0, duration: 3, shot: 7, onScreen: "احفظه ليوم ٢٧ 📌", vo: "احفظ الفيديو وذكّر نفسك يوم الراتب. الاستثمار ينطوي على مخاطر.", visual: "End card: Nakhla logo, 'Save for the 27th', small risk disclaimer." },
    ]);
    const content = {
      title: "يوم ٢٧ ضد يوم ٢٠ — الاستثمار التلقائي",
      concept: "The salary-day vs month-end contrast every Saudi viewer recognises, resolved by Nakhla's Auto-invest: pay yourself first, automatically, on the 27th.",
      hooks: [
        { text: "أنا يوم ٢٧ ضد أنا يوم ٢٠ 😂", on_screen: "أنا يوم ٢٧ 💸 / أنا يوم ٢٠ 🥲", why: "Instant recognition of the payday cycle in the first second." },
        { text: "إذا راتبك يختفي قبل نص الشهر… هذا لك", on_screen: "راتبك يختفي؟ 👀", why: "Direct call-out that makes the right viewer stop." },
        { text: "أكبر غلطة تسويها يوم الراتب", on_screen: "غلطة يوم الراتب ❌", why: "Curiosity gap; promises a single fix." },
      ],
      beats,
      shots: [
        { n: 1, type: "WIDE", description: "Slow-motion walk out of an office tower, sunglasses, iced coffee", location: "KAFD or any modern office exterior", props: "Sunglasses, iced coffee", talent: "Creator, smart casual thobe or shirt", duration: 4, notes: "Shoot at 60fps for slow motion" },
        { n: 2, type: "MEDIUM", description: "Sitting on the majlis floor counting a few coins, exaggerated sad face", location: "Home majlis", props: "Coins, empty wallet", talent: "Creator", duration: 4, notes: "Same outfit as shot 1 for the contrast" },
        { n: 3, type: "B_ROLL", description: "Delivery bags at the door, stack of coffee receipts, ticket on phone", location: "Home entrance, car", props: "Delivery bags, receipts", talent: "Hands only", duration: 6, notes: "3 x 1.5s clips" },
        { n: 4, type: "CLOSE_UP", description: "Talking to camera from the driver's seat, parked", location: "Car, daytime", props: "Phone mount", talent: "Creator", duration: 8, notes: "Natural light from side window" },
        { n: 5, type: "SCREEN_RECORDING", description: "Auto-invest flow: choose 10%, choose day 27, confirm", location: "App (demo account)", props: "—", talent: "—", duration: 8, notes: "Use a demo account; blur balances" },
        { n: 6, type: "MEDIUM", description: "Relaxed at an istiraha with friends, coffee, laughing", location: "Istiraha / outdoor majlis, evening", props: "Dallah, finjan", talent: "Creator + 2 friends", duration: 6, notes: "Warm golden-hour light" },
        { n: 7, type: "TEXT_CARD", description: "End card with logo, 'احفظه ليوم ٢٧' and risk line", location: "Graphics", props: "—", talent: "—", duration: 3, notes: "Risk line legible for at least 2s" },
      ],
      edit: {
        music: "Upbeat Khaleeji-pop instrumental for shot 1, sudden cut to a slow oud sting for shot 2, back to light lo-fi from shot 4. Royalty-free.",
        pacing: "Very fast first 4 seconds (hard cuts on the beat), then calmer for the explanation.",
        transitions: ["Hard cut with record-scratch between shots 1 and 2", "Whip pan into shot 4", "Match cut phone-to-screen into shot 5"],
        captions_style: "Bold white cards with dark text at the top third; burnt-in Arabic subtitles at the bottom.",
        sfx: ["Cash register 'ka-ching' on shot 1", "Record scratch", "Soft notification ping on Auto-invest confirm"],
      },
      caption: "يوم ٢٧ كلنا ملوك… ويوم ٢٠ قصة ثانية 😂 جرّب تدفع لنفسك أول مع الاستثمار التلقائي في نخلة 📌 الاستثمار ينطوي على مخاطر.",
      hashtags: ["الراتب", "نهاية_الشهر", "ادخار", "استثمار", "نخلة"],
      cta: "احفظ الفيديو وفعّل الاستثمار التلقائي من التطبيق",
      compliance: {
        status: "REVIEW",
        notes: ["Risk disclaimer is present in VO, caption and end card.", "No return promises or stock recommendations.", "Screen recording must use a demo account with balances hidden — confirm before publishing."],
      },
      voice_match: { score: 91, notes: "Relatable Saudi payday humour, one clear idea, soft CTA and risk line — matches the voice. Emoji count in the caption is at the limit." },
    };
    await db.contentDraft.create({
      data: {
        organizationId,
        formatId: format?.id,
        voiceId: voice.id,
        title: content.title,
        brief: "Promote the Auto-invest feature: invest a % of salary automatically on payday.",
        goal: "downloads",
        platform: "TIKTOK",
        dialect: "SAUDI",
        durationSec: 30,
        status: "IN_REVIEW",
        content,
        versions: { create: { n: 1, kind: "GENERATED", content } },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
