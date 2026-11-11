import type { Platform } from "@prisma/client";

/** Pre-written formats for demo mode (no AI key). Creators and posts are fictional. */
export const DEMO_FORMATS = [
  {
    key: "salary-day-vs-month-end",
    nameEn: "Salary day vs. end of month",
    nameAr: "يوم الراتب ضد نهاية الشهر",
    summaryEn: "Split-screen contrast: the creator living large on salary day, then surviving on crumbs on the 20th. Ends with the tip that fixes it.",
    summaryAr: "مقارنة بشاشة مقسومة: صانع المحتوى يعيش ملكًا يوم الراتب، ثم يصارع البقاء يوم ٢٠ في الشهر. ينتهي بنصيحة تحل المشكلة.",
    hookPatternAr: 'على الشاشة: «أنا يوم ٢٧ 💸» ← قطع مفاجئ إلى «أنا يوم ٢٠ 🥲»',
    whyItWorksAr: 'ألم مشترك وسعودي جدًا مرتبط بموعد الراتب؛ يُعرف من أول ثانية، والنصيحة في النهاية تجعل الناس يحفظونه.',
    hookPattern: "On-screen: “Me on the 27th 💸” → hard cut to “Me on the 20th 🥲”",
    whyItWorks: "Universal, very Saudi pain point tied to the payday calendar; instant recognition in the first second; the tip at the end makes it saveable.",
    structure: [
      { label: "Hook", description: "Salary-day self: confident walk, coffee, shopping bags (1–2s)", labelAr: 'الافتتاحية', descriptionAr: 'صانع المحتوى يوم الراتب: مشية واثقة، قهوة، أكياس تسوق (١–٢ ث)' },
      { label: "Turn", description: "Hard cut to end-of-month self counting coins, sad music (2–3s)", labelAr: 'التحول', descriptionAr: 'قطع مفاجئ لنفسه نهاية الشهر يعدّ الريالات مع موسيقى حزينة (٢–٣ ث)' },
      { label: "Escalation", description: "2–3 quick relatable moments of the month going wrong", labelAr: 'التصعيد', descriptionAr: '٢–٣ لحظات سريعة مألوفة لشهر يخرب' },
      { label: "Fix", description: "One simple money habit on screen (e.g. auto-invest a % on payday)", labelAr: 'الحل', descriptionAr: 'عادة مالية بسيطة على الشاشة (مثل استثمار نسبة تلقائيًا يوم الراتب)' },
      { label: "CTA", description: "“Save this for the 27th” + brand moment", labelAr: 'الدعوة', descriptionAr: '«احفظه ليوم ٢٧» + لحظة العلامة' },
    ],
    captions: [
      "أنا يوم ٢٧ 💸 vs أنا يوم ٢٠ 🥲 #الراتب #نهاية_الشهر",
      "Me on salary day vs me on the 20th 😭 #saudi #salaryday",
      "كل شهر نفس القصة 😂 الحل في آخر الفيديو #ادخار",
    ],
    platforms: ["TIKTOK", "INSTAGRAM"] as Platform[],
    momentum: "RISING",
  },
  {
    key: "three-mistakes",
    nameEn: "“3 mistakes beginners make” countdown",
    nameAr: "«٣ أخطاء يقع فيها المبتدئ» بالعد التنازلي",
    summaryEn: "Talking-head listicle with big numbered on-screen cards; the creator points at each mistake. The third mistake is the surprising one.",
    summaryAr: "قائمة يقدمها صانع المحتوى أمام الكاميرا مع أرقام كبيرة على الشاشة، والخطأ الثالث هو المفاجأة.",
    hookPatternAr: '«وقّف تسوي كذا بأول ١٠٠٠ ريال ✋»',
    whyItWorksAr: 'فجوة فضول (الناس تشوف إذا كانوا يسوونه)، إيقاع سريع، ويُحفظ ويُرسل للأصدقاء المبتدئين.',
    hookPattern: "“Stop doing this with your first 1,000 riyals ✋”",
    whyItWorks: "Curiosity gap (people watch to check if they're guilty), fast pacing, highly saveable and shareable to friends who are starting out.",
    structure: [
      { label: "Hook", description: "Direct warning to camera with hand gesture", labelAr: 'الافتتاحية', descriptionAr: 'تحذير مباشر للكاميرا مع إشارة يد' },
      { label: "Mistake 3", description: "Common one, quick", labelAr: 'الخطأ ٣', descriptionAr: 'خطأ شائع وسريع' },
      { label: "Mistake 2", description: "Relatable story", labelAr: 'الخطأ ٢', descriptionAr: 'قصة مألوفة' },
      { label: "Mistake 1", description: "Counter-intuitive one, the payoff", labelAr: 'الخطأ ١', descriptionAr: 'الخطأ غير المتوقع — الذروة' },
      { label: "CTA", description: "“Follow for part 2” / save", labelAr: 'الدعوة', descriptionAr: '«تابع للجزء الثاني» / احفظ' },
    ],
    captions: [
      "٣ أخطاء سويتها في أول سنة استثمار 😅 #استثمار #مبتدئين",
      "3 mistakes I made with my first SAR 1,000 #investing #saudi",
      "الخطأ الثالث محد يتكلم عنه 👀 #الأسهم_السعودية",
    ],
    platforms: ["TIKTOK", "YOUTUBE", "INSTAGRAM"] as Platform[],
    momentum: "PEAKING",
  },
  {
    key: "greenscreen-myth-bust",
    nameEn: "Green-screen myth bust",
    nameAr: "تفنيد إشاعة بالشاشة الخضراء",
    summaryEn: "Creator stands in front of a screenshot of a viral claim (“guaranteed 20% a month!”) and calmly takes it apart.",
    summaryAr: "صانع المحتوى أمام لقطة شاشة لادعاء منتشر («أرباح مضمونة ٢٠٪ شهريًا!») ويفنّده بهدوء.",
    hookPatternAr: 'لقطة شاشة لادعاء جريء + «خلونا نتكلم عن هذا 👇»',
    whyItWorksAr: 'يركب موجة جدل قائم، يبني ثقة بصانع المحتوى، والتعليقات تمتلئ بالنقاش.',
    hookPattern: "Screenshot of a bold claim + “Let's talk about this 👇”",
    whyItWorks: "Rides an existing controversy, positions the creator as trustworthy, and comment sections fill with debate.",
    structure: [
      { label: "Hook", description: "Viral claim screenshot behind the creator", labelAr: 'الافتتاحية', descriptionAr: 'لقطة الادعاء خلف صانع المحتوى' },
      { label: "Reaction", description: "Short, honest reaction", labelAr: 'ردة الفعل', descriptionAr: 'ردة فعل قصيرة وصادقة' },
      { label: "Facts", description: "2–3 plain-language facts on screen", labelAr: 'الحقائق', descriptionAr: '٢–٣ حقائق بلغة بسيطة على الشاشة' },
      { label: "How to check", description: "What viewers should look for (e.g. licensing)", labelAr: 'كيف تتأكد', descriptionAr: 'ما يجب أن يبحث عنه المشاهد (مثل الترخيص)' },
      { label: "CTA", description: "“Send this to someone who needs it”", labelAr: 'الدعوة', descriptionAr: '«أرسله لأحد يحتاجه»' },
    ],
    captions: ["هذا الكلام غلط ولازم ينقال 🚩 #احتيال #توعية_مالية", "Guaranteed returns? Let's talk 🚩 #scamalert", "لا تصدق كل إعلان تشوفه 👇"],
    platforms: ["TIKTOK", "INSTAGRAM"] as Platform[],
    momentum: "RISING",
  },
  {
    key: "day-in-the-life-riyadh",
    nameEn: "Day in the life + one money tip",
    nameAr: "يوم في حياتي + نصيحة مالية",
    summaryEn: "Fast vlog of a young Riyadh professional's day (commute, karak, office, gym) with one money habit woven in naturally.",
    summaryAr: "فلوق سريع ليوم موظف شاب في الرياض (الطريق، الكرك، الدوام، النادي) مع عادة مالية واحدة بشكل طبيعي.",
    hookPatternAr: '«٥:٣٠ الفجر في الرياض، عمري ٢٦ وأدخر لبيت»',
    whyItWorksAr: 'طموح لكنه قريب من الناس؛ النصيحة تبدو من صديق وليست إعلانًا.',
    hookPattern: "“5:30am in Riyadh as a 26-year-old saving for a house”",
    whyItWorks: "Aspirational but relatable; the money tip feels like advice from a peer rather than an ad.",
    structure: [
      { label: "Hook", description: "Alarm + specific identity line", labelAr: 'الافتتاحية', descriptionAr: 'منبّه + جملة تعريف محددة' },
      { label: "Montage", description: "6–8 one-second clips of the day", labelAr: 'مونتاج', descriptionAr: '٦–٨ لقطات بثانية لكل جزء من اليوم' },
      { label: "Tip moment", description: "Phone screen: the habit in action", labelAr: 'لحظة النصيحة', descriptionAr: 'شاشة الجوال: العادة أثناء التنفيذ' },
      { label: "Wrap", description: "Evening reflection + CTA", labelAr: 'الختام', descriptionAr: 'تأمل مسائي + دعوة' },
    ],
    captions: ["يومي كموظف في الرياض وأدخر لبيت 🏠 #فلوق", "A day in my life in Riyadh 🇸🇦 #dayinmylife", "روتيني اليومي + أهم عادة مالية"],
    platforms: ["TIKTOK", "INSTAGRAM", "YOUTUBE"] as Platform[],
    momentum: "PEAKING",
  },
  {
    key: "street-question",
    nameEn: "Street question: “What would you do with 1,000 riyals?”",
    nameAr: "سؤال الشارع: «وش تسوي لو معك ١٠٠٠ ريال؟»",
    summaryEn: "Quick vox-pop at a mall or Boulevard; funny and honest answers, ending with a smart answer that sets up the product.",
    summaryAr: "مقابلات سريعة في مول أو بوليفارد؛ إجابات طريفة وصادقة، وتنتهي بإجابة ذكية تمهد للمنتج.",
    hookPatternAr: 'الميكروفون في الكادر + السؤال كنص على الشاشة',
    whyItWorksAr: 'وجوه ولهجات محلية حقيقية، ردود فعل صادقة، وكل مشاهد يجاوب في نفسه.',
    hookPattern: "Mic in frame + the question as on-screen text",
    whyItWorks: "Real local faces and dialects, genuine reactions, and every viewer silently answers the question too.",
    structure: [
      { label: "Hook", description: "Question on screen + first funny answer", labelAr: 'الافتتاحية', descriptionAr: 'السؤال على الشاشة + أول إجابة طريفة' },
      { label: "Answers", description: "4–5 fast answers, mixed ages", labelAr: 'الإجابات', descriptionAr: '٤–٥ إجابات سريعة لأعمار مختلفة' },
      { label: "Twist", description: "One surprisingly smart answer", labelAr: 'المفاجأة', descriptionAr: 'إجابة ذكية غير متوقعة' },
      { label: "CTA", description: "“What would YOU do? Comment 👇”", labelAr: 'الدعوة', descriptionAr: '«وأنت وش بتسوي؟ علّق 👇»' },
    ],
    captions: ["سألنا الناس في البوليفارد 😂 #سؤال_الشارع", "What would you do with SAR 1,000? 👀", "الجواب الأخير صدمنا 😳"],
    platforms: ["TIKTOK", "INSTAGRAM", "YOUTUBE"] as Platform[],
    momentum: "NEW",
  },
  {
    key: "pov-cash-friend",
    nameEn: "POV skit: the friend who keeps cash under the mattress",
    nameAr: "مشهد POV: الخويّ اللي يخبي فلوسه تحت المرتبة",
    summaryEn: "Two-character comedy skit (both played by the creator) — the old-school saver vs. the friend who invests. Warm, not preachy.",
    summaryAr: "مشهد كوميدي بشخصيتين (يؤديهما صانع المحتوى) — المدّخر التقليدي ضد الخويّ اللي يستثمر. خفيف ومن غير وعظ.",
    hookPatternAr: '«POV: خويك للحين يحط راتبه في كرتون جزمة»',
    whyItWorksAr: 'الكوميديا بالشخصيات وباللهجة المحلية أكثر شكل يُشارك في المنطقة؛ الرسالة تمشي مع الضحكة.',
    hookPattern: "“POV: your friend still keeps his salary in a shoebox”",
    whyItWorks: "Character comedy in local dialect is the most shared format in the region; the message rides on the laugh.",
    structure: [
      { label: "Setup", description: "POV text + character A doing the old-school thing", labelAr: 'التمهيد', descriptionAr: 'نص POV + الشخصية الأولى تسوي الشيء التقليدي' },
      { label: "Conflict", description: "Character B reacts, banter", labelAr: 'الصراع', descriptionAr: 'الشخصية الثانية تتفاعل، مناوشة' },
      { label: "Punchline", description: "Unexpected twist", labelAr: 'القفلة', descriptionAr: 'تحوّل غير متوقع' },
      { label: "Soft message", description: "One line of the actual point", labelAr: 'الرسالة', descriptionAr: 'سطر واحد للفكرة الأساسية' },
    ],
    captions: ["كلنا عندنا هالخويّ 😂 #POV #ادخار", "POV: your friend still keeps cash at home 😭", "منشن خويك اللي كذا 👇"],
    platforms: ["TIKTOK", "INSTAGRAM"] as Platform[],
    momentum: "FADING",
  },
] as const;

const CREATORS = [
  { handle: "money.with.ahmed", followers: 412_000 },
  { handle: "reem.invests", followers: 88_000 },
  { handle: "riyadh.finance", followers: 23_000 },
  { handle: "fahad.daily", followers: 6_400 },
  { handle: "sara.saves", followers: 154_000 },
  { handle: "khalid_explains", followers: 1_200_000 },
  { handle: "nouf.money", followers: 9_800 },
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Demo viral posts for a niche, spread over the last 10 days, tagged with their demo format key. */
export function generateDemoTrendPosts(watchId: string, platforms: Platform[], seed: number) {
  const rand = rng(seed);
  const out: {
    formatKey: string;
    platform: Platform;
    externalId: string;
    text: string;
    authorHandle: string;
    authorFollowers: number;
    publishedAt: Date;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    durationSec: number;
  }[] = [];
  for (const f of DEMO_FORMATS) {
    const n = f.momentum === "FADING" ? 4 : f.momentum === "NEW" ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const platform = f.platforms.filter((p) => platforms.includes(p))[i % f.platforms.length] ?? platforms[0];
      const creator = CREATORS[Math.floor(rand() * CREATORS.length)];
      // Momentum shapes recency: rising formats are recent, fading ones older.
      const ageDays = f.momentum === "RISING" ? rand() * 3 : f.momentum === "FADING" ? 4 + rand() * 6 : f.momentum === "NEW" ? rand() * 1.5 : rand() * 7;
      const outlier = 2 + rand() * (f.momentum === "RISING" ? 25 : 10);
      const views = Math.round(Math.max(20_000, creator.followers * outlier * (creator.followers > 500_000 ? 0.2 : 1)));
      const likes = Math.round(views * (0.04 + rand() * 0.08));
      out.push({
        formatKey: f.key,
        platform,
        externalId: `demo-trend-${watchId.slice(-6)}-${f.key}-${i}`,
        text: f.captions[i % f.captions.length],
        authorHandle: creator.handle,
        authorFollowers: creator.followers,
        publishedAt: new Date(Date.now() - ageDays * 86400_000),
        views,
        likes,
        comments: Math.round(likes * (0.03 + rand() * 0.08)),
        shares: Math.round(likes * (0.05 + rand() * 0.25)),
        durationSec: 15 + Math.round(rand() * 45),
      });
    }
  }
  return out;
}
