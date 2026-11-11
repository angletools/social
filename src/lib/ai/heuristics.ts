import type { Sentiment } from "@prisma/client";

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
