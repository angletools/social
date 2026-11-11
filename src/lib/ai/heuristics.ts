import type { Dialect, Sentiment } from "@prisma/client";

// Lightweight fallback used only when no AI key is configured.
const POS = ["ممتاز", "رائع", "سهل", "شكرا", "شكرًا", "أفضل", "حلو", "جميل", "سريع", "مفيد", "great", "love", "easy", "fast", "best", "thanks", "awesome", "smooth", "excellent", "👏", "👍", "🔥", "❤️"];
const NEG = ["سيء", "تأخر", "مشكلة", "علّق", "علق", "احتيال", "نصب", "خسرت", "بطيء", "غير صحيح", "مخفية", "😡", "😤", "worst", "bad", "slow", "scam", "fraud", "crash", "froze", "broken", "terrible", "issue", "problem", "lost", "leaving"];
const RISK = ["احتيال", "نصب", "وهمي", "ينتحل", "اختراق", "scam", "fraud", "phishing", "hack", "impersonat", "otp", "lawsuit", "مضلل"];

export function heuristicSentiment(text: string): { sentiment: Sentiment; score: number; isRisk: boolean } {
  const t = text.toLowerCase();
  const p = POS.filter((w) => t.includes(w)).length;
  const n = NEG.filter((w) => t.includes(w)).length;
  const score = p + n === 0 ? 0 : (p - n) / (p + n);
  return {
    sentiment: score > 0.2 ? "POSITIVE" : score < -0.2 ? "NEGATIVE" : "NEUTRAL",
    score: Math.round(score * 100) / 100,
    isRisk: RISK.some((w) => t.includes(w)),
  };
}

const MARKERS: [Dialect, RegExp][] = [
  ["EGYPTIAN", /(عايز|عاوز|إزاي|ازاي|دلوقتي|أوي|اوي|بتاع|يسطا|كده|بجد)/],
  ["SAUDI", /(وش |ابغى|أبغى|ابي |مره |حيل|الحين|دحين|ذحين|كفو|تراه|هالشي|سالفة)/],
  ["KHALEEJI", /(وايد|واجد|يالس|خوش|شلونك| مب |عيل)/],
  ["LEVANTINE", /(هيك|هلق|هلأ|بدي|منيح)/],
  ["IRAQI", /(شكو|ماكو|هواية|اكو)/],
  ["MAGHREBI", /(بزاف|دابا|ديال|كيفاش|برشا)/],
];

/** Marker-word dialect guess used only without AI. */
export function heuristicDialect(text: string): Dialect {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (arabic === 0) return /\b\w*[2375679]\w*[a-z]\w*\b/i.test(text) && /\b(3a|7a|ma3|wallah|yalla|inshallah|7elw)/i.test(text) ? "ARABIZI" : latin ? "ENGLISH" : "OTHER";
  for (const [d, re] of MARKERS) if (re.test(` ${text} `)) return d;
  return "MSA";
}
