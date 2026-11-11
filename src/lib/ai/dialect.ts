import type { Dialect } from "@prisma/client";
import { db } from "../db";

export const DIALECTS: Dialect[] = ["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"];

/**
 * Regional language guide shared by every Arabic-facing prompt. It is static
 * (cached across requests) and kept separate from per-organization context.
 */
export const DIALECT_GUIDE = `<arabic_dialect_guide>
Identifying the dialect (pick the most specific one the text supports):
- SAUDI: وش / ايش، ابغى / ابي، مره (= very)، حيل (Najdi "very")، كذا، زين، الحين، دحين / ذحين (Hijazi "now")، إيوه (Hijazi "yes")، ترا / تراه، عاد، هالشي، سالفة، يبيله، مافي، كفو، يعطيك العافية. Saudi context also counts: ريال amounts, Riyadh / Jeddah / Dammam, Absher, Tadawul, Saudi banks and telcos.
- KHALEEJI (UAE, Kuwait, Qatar, Bahrain, Oman): وايد / واجد (= a lot)، شو (Emirati)، يالس، خوش (Kuwaiti/Bahraini "good")، شلونك (Kuwaiti)، مب (Emirati negation)، عيل، the letter چ. Saudi and other Gulf speech overlap heavily: choose SAUDI only with a Saudi-specific marker or Saudi context, otherwise KHALEEJI.
- EGYPTIAN: عايز / عاوز، إزاي، كده، أوي، بجد، دلوقتي، مش، ده / دي، بتاع، يا عم، يسطا، جامد (= great)، خالص، إمبارح، جنيه.
- LEVANTINE: هيك، هلق / هلأ، بدي، منيح، كتير، شو (with Levantine grammar)، كيفك.
- IRAQI: شكو ماكو، اكو، هواية (= a lot)، شلون، چا.
- MAGHREBI: بزاف، واش، دابا، ديال، كيفاش، برشا (Tunisian).
- ARABIZI: Arabic written in Latin letters with digits — 2=ء، 3=ع، 5 or 7'=خ، 7=ح، 6=ط، 9=ص/ق (e.g. "7elw", "3ala", "ma3a", "yalla", "wallah"). Classify as ARABIZI but read it as Arabic for sentiment.
- MSA: formal grammar, سوف، لقد، إنّ، news or corporate register. ENGLISH: English text, even with an Arabic word or two.

Reading sentiment correctly:
- Sarcasm is common and usually looks like praise next to a problem: "ما شاء الله عليكم"، "مبدعين"، "تبارك الله"، "يعطيكم العافية على الخدمة الرهيبة"، "يا حلاوة" (Egyptian)، "عاش" with a complaint, or praise followed by 🙂 🙃 😂 🤡. Sarcasm → sarcasm=true and sentiment NEGATIVE.
- 😂 or 🤣 next to a brand failure is mockery (negative). 🙂 in Gulf usage is often passive-aggressive.
- Religious and politeness formulas are neutral on their own: الحمدلله، بسم الله، جزاكم الله خير (sincere thanks → positive)، إن شاء الله (can signal doubt: "إن شاء الله ترجع فلوسي" is skeptical). "الله يهديكم" is a mild rebuke (negative). "حسبي الله ونعم الوكيل" and "الله لا يوفقكم" are strong grievance or anger (very negative, usually worth flagging).
- Positive slang: كفو، خطير / خطيرين (= amazing)، نار / 🔥، يجنن، فلة، توب، جامد، مية مية، أسطورة، ابطال، عز الله (Najdi emphasis).
- Negative slang: زفت، خايس، تعبان (= lousy)، بايخ، طفش / طفشت، قرف، مقلب، نصابين، حرامية، سرقة، مضيعة وقت، فاشل، مو صاحي.
- Intensifiers: مره، حيل، وايد، أوي، جامد، بزاف، هواية. Negators: مو، مب، مش، ماهو، ما فيه.
- Finance and app vocabulary: "التطبيق علّق / معلق" = app froze (not "comment"); التنفيذ = order execution; الاكتتاب = IPO; التحويل / الإيداع / السحب = transfers; الرسوم / العمولة = fees; رمز التحقق / OTP requests = likely phishing; اختراق / تهكير = hack; هيئة السوق المالية = CMA (regulator); حلال / حرام / شرعي = Shariah-compliance concern.

Intent:
- CHURN_RISK: leaving or threatening to leave — "بسكّر / بقفّل حسابي"، "ما عاد أتعامل معكم"، "رايح لـ…"، "هسحب فلوسي"، "آخر مرة".
- PURCHASE_INTENT: wants to sign up, buy or start — "ودي أفتح حساب"، "كيف أشترك"، "أبغى أبدأ استثمر".
- COMPLAINT, QUESTION, PRAISE, SUGGESTION, OTHER as usual. A question asked angrily is a COMPLAINT.

Slang: list up to 3 dialect-specific words or expressions that a non-native reader would miss, each with a short English gloss (e.g. {"term":"كفو","gloss":"well done / respect (Saudi)"}). Skip common words and MSA.
</arabic_dialect_guide>`;

export const REPLY_GUIDE = `<reply_guide>
- Match the commenter: reply in their language. For Arabic, use a light, polite version of their dialect: Saudi "white dialect" (اللهجة البيضاء) for Saudi and Gulf commenters, light Egyptian for Egyptian commenters, and Saudi white dialect for Arabizi or MSA unless the brand voice says otherwise. Never overdo slang or imitate a dialect mockingly.
- Gender: if the commenter's gender is not obvious, use respectful plural or neutral address (حياكم، نعتذر لكم، تواصلوا معنا) instead of guessing.
- Warm local openers are welcome when natural: حياك الله، أهلًا فيك، سلامات، يعطيك العافية; Egyptian: أهلًا بحضرتك، نعتذر جدًا لحضرتك.
- Complaints: acknowledge, apologize once, give a concrete next step, and move account details to private messages or official support channels.
- Safety and compliance: never ask for passwords, OTP codes, card or ID numbers in public. Never promise returns, profits or timelines you can't guarantee. Never give personalised investment advice. Don't admit legal liability. For fraud, impersonation or security claims, warn users to use official channels only and escalate.
- Keep replies short and native to the platform (X: under 260 characters). No hashtags in replies. At most one emoji, and only if the brand voice allows it.
</reply_guide>`;

/** Organization glossary formatted for prompts. */
export async function lexiconPrompt(organizationId: string) {
  const terms = await db.lexiconTerm.findMany({ where: { organizationId }, orderBy: { term: "asc" }, take: 300 });
  if (terms.length === 0) return "";
  return `<organization_glossary>\nTerms specific to this organization and its customers:\n${terms
    .map((t) => `- ${t.term}: ${t.meaning}${t.dialect ? ` [${t.dialect}]` : ""}${t.sentimentHint ? ` (usually ${t.sentimentHint.toLowerCase()})` : ""}`)
    .join("\n")}\n</organization_glossary>`;
}

/** How to write native-sounding scripts for the region. Used by the content studio. */
export const WRITING_GUIDE = `<regional_writing_guide>
Writing spoken dialect that sounds native, not translated:
- SAUDI (default "white dialect" اللهجة البيضاء — understood across the Kingdom): use spoken forms like وش، ليش، الحين، مره، يعني، كذا، ترا، خلاص، عاد، يا جماعة، صراحة. Avoid MSA connectors (لذلك، حيث، إذ، سوف، لقد) and English-shaped sentences. Najdi or Hijazi flavour only when asked.
- KHALEEJI: وايد، شو / شنو، الحين، زين، يالله. EGYPTIAN: كده، أوي، عايز، إزاي، بجد، يعني إيه، خلّي بالك. MSA: only for formal or corporate pieces.
- Mixed Arabic-English ("code-switching") is natural for young Saudi audiences in finance and tech ("الـ app"، "portfolio") — use it lightly where it feels real.
- Short-form video craft: the hook lands in the first 1–2 seconds (visual + on-screen text, not a logo); on-screen text is at most 6 words per card; one idea per beat; numbers as digits; end with a single clear CTA. Write the voice-over exactly as it should be spoken, in dialect.
- Cultural calendar and references the audience recognises: salary day (يوم الراتب, around the 27th), end-of-month squeeze (نهاية الشهر), Ramadan and Eid, Saudi National Day (23 Sep), Founding Day (22 Feb), summer travel, back to school, Riyadh Season, family gatherings (الاستراحة، القهوة، المجلس), Vision 2030.
- Sensitivities: no gambling or "get rich quick" vibes, no alcohol, nightlife or immodest scenes, no jokes about religion, the royal family or government, no mocking other dialects or nationalities. Humour is welcome when it's warm and relatable.
- Financial content (follow strictly): never promise or imply guaranteed returns; don't recommend specific stocks or tell people what to buy; promotional content mentions that investing involves risk; don't present past performance as a promise; respect Shariah-compliance sensitivities.
</regional_writing_guide>`;
