import type { Dialect, Intent, Monitor, Platform, Sentiment } from "@prisma/client";
import type { NormalizedPost } from "../monid/normalize";

/**
 * Sample data used only in explicitly DEMO workspaces, so the product can be
 * demoed end-to-end. All brands, people and posts here are fictional.
 */

type Template = {
  ar?: string;
  en?: string;
  dialect?: Dialect; // dialect of the `ar` text (default SAUDI)
  sentiment: Sentiment;
  intent: Intent;
  topics: [string, string, string][]; // key, en, ar
  risk?: string;
  emotion: string;
  slang?: [string, string][]; // term, gloss (for the `ar` text)
  sarcasm?: boolean;
};

const T = {
  onboarding: ["account-opening", "Account opening", "فتح الحساب"],
  app: ["app-performance", "App performance", "أداء التطبيق"],
  fees: ["fees-pricing", "Fees & pricing", "الرسوم والأسعار"],
  support: ["customer-support", "Customer support", "خدمة العملاء"],
  us: ["us-stocks", "US stocks", "الأسهم الأمريكية"],
  tadawul: ["saudi-market", "Saudi market", "السوق السعودي"],
  ipo: ["ipo", "IPOs", "الاكتتابات"],
  withdraw: ["withdrawals", "Withdrawals & deposits", "السحب والإيداع"],
  shariah: ["shariah-compliance", "Shariah compliance", "التوافق الشرعي"],
  fraud: ["fraud-scam", "Fraud & scams", "الاحتيال"],
  education: ["investor-education", "Investor education", "التثقيف الاستثماري"],
  ux: ["ease-of-use", "Ease of use", "سهولة الاستخدام"],
  promo: ["promotions", "Promotions & rewards", "العروض والمكافآت"],
} satisfies Record<string, [string, string, string]>;

const TEMPLATES: Template[] = [
  { ar: "فتحت حسابي في {brand} خلال ٥ دقائق بس 👌 التجربة سهلة مره", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.onboarding, T.ux], emotion: "joy", slang: [["مره", "very (Saudi)"]] },
  { en: "Opened a {brand} account in under 5 minutes. Smoothest onboarding of any Saudi broker I've tried.", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.onboarding, T.ux], emotion: "joy" },
  { ar: "التطبيق علّق وقت افتتاح السوق ومافي أي تحديث للأسعار 😡 {brand} وش السالفة؟", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.app, T.tadawul], emotion: "anger", slang: [["علّق", "froze (app)"], ["وش السالفة", "what's going on? (Saudi)"]] },
  { en: "{brand} app froze right at market open again. Lost a good entry because orders wouldn't go through.", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.app], emotion: "anger" },
  { ar: "رسوم التداول في {brand} أقل من البنوك بكثير، خصوصًا على الأسهم الأمريكية", dialect: "MSA", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.fees, T.us], emotion: "satisfaction" },
  { en: "Anyone compared {brand} fees vs {competitor}? Trying to decide where to move my US portfolio.", sentiment: "NEUTRAL", intent: "QUESTION", topics: [T.fees, T.us], emotion: "curiosity" },
  { ar: "صار لي ٣ أيام أنتظر رد من خدمة عملاء {brand} على طلب سحب 😤", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.support, T.withdraw], emotion: "frustration" },
  { en: "Shoutout to {brand} support — fixed my verification issue in 10 minutes over chat.", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.support, T.onboarding], emotion: "gratitude" },
  { ar: "هل الأسهم المتاحة في {brand} متوافقة مع الشريعة؟ أحد عنده معلومة؟", sentiment: "NEUTRAL", intent: "QUESTION", topics: [T.shariah], emotion: "curiosity" },
  { ar: "ميزة فلتر الأسهم الشرعية في {brand} كفو وتوفر علي وقت كثير 👏", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.shariah, T.ux], emotion: "joy", slang: [["كفو", "well done / respect (Saudi)"]] },
  { ar: "انتبهوا! فيه حساب وهمي ينتحل اسم {brand} ويطلب تحويل فلوس على الخاص ⚠️", sentiment: "NEGATIVE", intent: "OTHER", topics: [T.fraud], risk: "Impersonation scam using the brand name", emotion: "fear" },
  { en: "Got a WhatsApp message claiming to be from {brand} asking for my OTP. Is this a scam?? @{brandHandle}", sentiment: "NEGATIVE", intent: "QUESTION", topics: [T.fraud, T.support], risk: "Phishing attempt impersonating the brand", emotion: "fear" },
  { ar: "اكتتاب جديد في السوق السعودي، هل بيكون متاح عن طريق {brand}؟", sentiment: "NEUTRAL", intent: "QUESTION", topics: [T.ipo, T.tadawul], emotion: "anticipation" },
  { en: "Subscribed to the IPO through {brand} in two taps. This is how investing should feel.", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.ipo, T.ux], emotion: "joy" },
  { ar: "المحتوى التعليمي اللي ينشره {brand} عن الاستثمار طويل المدى مفيد جدًا للمبتدئين", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.education], emotion: "gratitude" },
  { ar: "الإيداع تأخر يوم كامل وما وصلني إشعار، {brand} الله يهديكم حسّنوا هالنقطة", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.withdraw, T.app], emotion: "frustration", slang: [["الله يهديكم", "mild rebuke: 'please, sort yourselves out'"]] },
  { en: "{brand} referral promo is actually decent — free US stock for both of us.", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.promo, T.us], emotion: "joy" },
  { ar: "جربت {competitor} و {brand}، الثاني أسرع في تنفيذ الأوامر بصراحة", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.app, T.tadawul], emotion: "satisfaction" },
  { en: "Thinking of leaving {brand}. The app keeps logging me out and support just sends canned replies.", sentiment: "NEGATIVE", intent: "CHURN_RISK", topics: [T.app, T.support], risk: "Customer churn signal with public complaint", emotion: "frustration" },
  { ar: "وش رأيكم في {brand} للمبتدئين؟ ابغى أبدأ بمبلغ بسيط", sentiment: "NEUTRAL", intent: "PURCHASE_INTENT", topics: [T.education, T.onboarding], emotion: "curiosity", slang: [["ابغى", "I want (Gulf)"]] },
  { ar: "أخيرًا {brand} أضافوا الأوامر المحددة على الأسهم الأمريكية 🔥 خطيرين", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.us, T.ux], emotion: "excitement", slang: [["خطيرين", "amazing (slang, positive)"]] },
  { en: "Is {brand} licensed by the CMA? Want to make sure before depositing.", sentiment: "NEUTRAL", intent: "PURCHASE_INTENT", topics: [T.shariah, T.onboarding], emotion: "caution" },
  { ar: "الرسوم المخفية على تحويل العملة في {brand} مو واضحة أبدًا", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.fees, T.us], emotion: "distrust", slang: [["مو", "not (Gulf negation)"]] },
  { ar: "تحديث {brand} الأخير خلّى الواجهة أنظف وأسرع، شغل حلو 👍", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.app, T.ux], emotion: "satisfaction" },
  { ar: "أحد جرب يسحب أرباحه من {brand}؟ كم ياخذ وقت؟", sentiment: "NEUTRAL", intent: "QUESTION", topics: [T.withdraw], emotion: "curiosity" },
  { ar: "شخص في تيك توك يقول إن {brand} يضمن أرباح ٢٠٪ شهريًا — هذا كلام غير صحيح ومضلل", dialect: "MSA", sentiment: "NEGATIVE", intent: "OTHER", topics: [T.fraud, T.education], risk: "Misleading guaranteed-returns claim attributed to the brand", emotion: "distrust" },
  { en: "{competitor} just launched fractional shares. Hope {brand} follows soon.", sentiment: "NEUTRAL", intent: "SUGGESTION", topics: [T.us, T.promo], emotion: "anticipation" },
  // Sarcasm: looks like praise, reads as a complaint.
  { ar: "ما شاء الله عليكم يا {brand} 🙂 ثالث مرة هالأسبوع التطبيق يطلعني وقت التداول، مبدعين", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.app], emotion: "frustration", sarcasm: true, slang: [["ما شاء الله عليكم", "sarcastic 'well done' here"], ["مبدعين", "'so creative' — sarcastic"]] },
  { ar: "يعطيكم العافية على خدمة العملاء الرهيبة 😂 ساعة انتظار عشان يقولي جرب تحدّث التطبيق", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.support], emotion: "mockery", sarcasm: true, slang: [["يعطيكم العافية", "thanks for your effort — sarcastic here"]] },
  { ar: "حسبي الله ونعم الوكيل، فلوسي معلقة من أسبوع ومحد يرد علي", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.withdraw, T.support], risk: "Severe grievance about withheld funds", emotion: "anger", slang: [["حسبي الله ونعم الوكيل", "strong grievance: 'God is my judge against you'"]] },
  { ar: "خلاص بسكّر حسابي في {brand} ورايح لـ {competitor}، طفشت من التعليق", sentiment: "NEGATIVE", intent: "CHURN_RISK", topics: [T.app], risk: "Customer publicly announcing switch to a competitor", emotion: "frustration", slang: [["بسكّر", "I'll close (Gulf)"], ["طفشت", "fed up (Gulf)"]] },
  // Egyptian
  { ar: "هو {brand} ده متاح في مصر ولا للسعودية بس؟ عايز أستثمر في الأسهم الأمريكية", dialect: "EGYPTIAN", sentiment: "NEUTRAL", intent: "PURCHASE_INTENT", topics: [T.us, T.onboarding], emotion: "curiosity", slang: [["عايز", "I want (Egyptian)"]] },
  { ar: "التطبيق بتاع {brand} جامد أوي بجد، الواجهة سهلة ومش محتاجة شرح", dialect: "EGYPTIAN", sentiment: "POSITIVE", intent: "PRAISE", topics: [T.ux], emotion: "joy", slang: [["جامد", "great (Egyptian slang)"], ["أوي", "very (Egyptian)"]] },
  { ar: "يا حلاوة يا {brand} 😂 الفلوس بقالها يومين ما وصلتش", dialect: "EGYPTIAN", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.withdraw], emotion: "mockery", sarcasm: true, slang: [["يا حلاوة", "'how lovely' — sarcastic (Egyptian)"], ["بقالها", "it's been (Egyptian)"]] },
  // Gulf (non-Saudi)
  { ar: "{brand} وايد زين للمبتدئين بس ابا خيار الصناديق بعد", dialect: "KHALEEJI", sentiment: "POSITIVE", intent: "SUGGESTION", topics: [T.ux, T.education], emotion: "satisfaction", slang: [["وايد", "very / a lot (Gulf)"], ["ابا", "I want (Gulf)"]] },
  { ar: "شو السالفة مع التحويل؟ يالس انطر من الصبح", dialect: "KHALEEJI", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.withdraw], emotion: "frustration", slang: [["يالس", "sitting / been (Emirati)"], ["انطر", "waiting (Gulf)"]] },
  // Arabizi
  { ar: "{brand} el app 7elw bas el fees 3ala US stocks ghalya shway", dialect: "ARABIZI", sentiment: "NEUTRAL", intent: "COMPLAINT", topics: [T.fees, T.us], emotion: "mixed", slang: [["7elw", "nice (Arabizi)"], ["ghalya shway", "a bit expensive"]] },
  { ar: "wallah {brand} support ma yrd 3ala el DM, 2 days now", dialect: "ARABIZI", sentiment: "NEGATIVE", intent: "COMPLAINT", topics: [T.support], emotion: "frustration", slang: [["ma yrd", "doesn't reply"]] },
];

const AUTHORS: { handle: string; name: string; followers: number; verified?: boolean }[] = [
  { handle: "saud_invests", name: "سعود | استثمار", followers: 184_000, verified: true },
  { handle: "noura.finance", name: "نورة المالية", followers: 92_300, verified: true },
  { handle: "riyadh_trader", name: "متداول الرياض", followers: 12_400 },
  { handle: "fahad_k", name: "Fahad K.", followers: 860 },
  { handle: "mona_alq", name: "منى", followers: 2_150 },
  { handle: "techreview_sa", name: "Tech Review KSA", followers: 341_000, verified: true },
  { handle: "abdullah1990", name: "عبدالله", followers: 420 },
  { handle: "sara.m", name: "Sara M", followers: 5_600 },
  { handle: "khalid_markets", name: "خالد | أسواق", followers: 47_800 },
  { handle: "jeddah_dev", name: "Jeddah Dev", followers: 1_900 },
  { handle: "reem_saves", name: "ريم تدّخر", followers: 23_000 },
  { handle: "omar.trades", name: "Omar", followers: 310 },
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type DemoPost = NormalizedPost & {
  enrichment: {
    sentiment: Sentiment;
    sentimentScore: number;
    topics: [string, string, string][];
    isRisk: boolean;
    riskReason: string | null;
    emotion: string;
    dialect: Dialect;
    intent: Intent;
    sarcasm: boolean;
    slang: { term: string; gloss: string }[];
  };
};

/**
 * Generates `count` posts for a monitor/platform between `from` and `to`.
 * Deterministic for a given seed so re-runs dedupe naturally.
 */
export function generateDemoPosts(
  monitor: Pick<Monitor, "id" | "name" | "terms" | "isCompetitor" | "languages">,
  platform: Platform,
  opts: { count: number; from: Date; to: Date; seed?: number },
): DemoPost[] {
  const rand = rng(opts.seed ?? hash(monitor.id + platform + opts.to.toISOString().slice(0, 13)));
  const brand = monitor.terms.find((t) => /[A-Za-z]/.test(t))?.replace(/^[#@]/, "") ?? monitor.name;
  const brandAr = monitor.terms.find((t) => /[؀-ۿ]/.test(t))?.replace(/^[#@]/, "") ?? brand;
  const competitor = monitor.isCompetitor ? "Nakhla Invest" : "Raya Trade";
  const wantAr = monitor.languages.length === 0 || monitor.languages.includes("ar");
  const wantEn = monitor.languages.length === 0 || monitor.languages.includes("en");
  const pool = TEMPLATES.filter((t) => (t.ar && wantAr) || (t.en && wantEn));
  const span = opts.to.getTime() - opts.from.getTime();

  const posts: DemoPost[] = [];
  for (let i = 0; i < opts.count; i++) {
    // Competitors skew a little more negative so share-of-voice charts look realistic.
    let tpl = pool[Math.floor(rand() * pool.length)];
    if (monitor.isCompetitor && tpl.sentiment === "POSITIVE" && rand() < 0.3) {
      tpl = pool.find((t) => t.sentiment === "NEGATIVE") ?? tpl;
    }
    const isAr = Boolean(tpl.ar && (!tpl.en || rand() < 0.7));
    const textTpl = (isAr ? tpl.ar : tpl.en)!;
    const author = AUTHORS[Math.floor(Math.pow(rand(), 1.6) * AUTHORS.length)];
    const text = textTpl
      .replaceAll("{brand}", isAr ? brandAr : brand)
      .replaceAll("{brandHandle}", brand.toLowerCase().replace(/\s+/g, ""))
      .replaceAll("{competitor}", competitor);
    // Recent hours get more volume, with a bump in the last 3 days.
    const t = opts.from.getTime() + span * Math.pow(rand(), 0.75);
    const reachFactor = Math.max(1, author.followers / 2000);
    const likes = Math.round(rand() * 40 * reachFactor);
    const id = `demo-${platform}-${hash(monitor.id + i + textTpl + t)}`;
    const score =
      tpl.sentiment === "POSITIVE" ? 0.4 + rand() * 0.6 : tpl.sentiment === "NEGATIVE" ? -0.4 - rand() * 0.6 : rand() * 0.4 - 0.2;

    posts.push({
      externalId: id,
      url: null,
      text,
      publishedAt: new Date(t),
      authorHandle: author.handle,
      authorName: author.name,
      authorAvatar: null,
      authorFollowers: author.followers,
      authorVerified: Boolean(author.verified),
      likes,
      comments: Math.round(likes * (0.05 + rand() * 0.2)),
      shares: Math.round(likes * rand() * 0.3),
      views: platform === "TIKTOK" || platform === "YOUTUBE" ? Math.round(likes * (20 + rand() * 60)) : Math.round(likes * (8 + rand() * 20)),
      lang: isAr ? "ar" : "en",
      mediaUrl: null,
      durationSec: null,
      enrichment: {
        sentiment: tpl.sentiment,
        sentimentScore: Math.round(score * 100) / 100,
        topics: tpl.topics,
        isRisk: Boolean(tpl.risk),
        riskReason: tpl.risk ?? null,
        emotion: tpl.emotion,
        dialect: isAr ? (tpl.dialect ?? "SAUDI") : "ENGLISH",
        intent: tpl.intent,
        sarcasm: Boolean(isAr && tpl.sarcasm),
        slang: isAr ? (tpl.slang ?? []).map(([term, gloss]) => ({ term, gloss })) : [],
      },
    });
  }
  return posts;
}
