export type DraftChange = { field: string; before: string; after: string };
/** Compare saved content, never a mutable editor buffer. Arrays retain their numbered order. */
export function draftDiff(before: unknown, after: unknown): { changes: DraftChange[]; total: number } {
  const changes: DraftChange[] = [];
  let total = 0;
  const text = (v: unknown) => v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v);
  const walk = (a: unknown, b: unknown, path: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
    } else {
      total++;
      if (changes.length < 40) changes.push({ field: path, before: text(a).slice(0, 2000), after: text(b).slice(0, 2000) });
    }
  };
  walk(before, after, "");
  return { changes, total };
}

export function draftFieldLabel(path: string, locale: string) {
  const labels: Record<string, [string, string]> = { title:["Title","العنوان"], concept:["Concept","الفكرة"], caption:["Caption","وصف المنشور"], cta:["Call to action","الدعوة للتفاعل"], hashtags:["Hashtags","الوسوم"], hooks:["Opening","المقدمة"], beats:["Script line","سطر النص"], shots:["Shot","اللقطة"], edit:["Edit direction","توجيه المونتاج"], vo:["Spoken line","النص المنطوق"], onScreen:["On-screen text","النص على الشاشة"], on_screen:["On-screen text","النص على الشاشة"], text:["Text","النص"], why:["Reason","السبب"], start:["Start","البداية"], duration:["Duration","المدة"], visual:["Visual","الصورة"], shot:["Shot number","رقم اللقطة"], compliance:["Review notes","ملاحظات المراجعة"], voice_match:["Voice match","توافق النبرة"], selected_hook:["Selected opening","المقدمة المختارة"], notes:["Notes","ملاحظات"], description:["Description","الوصف"], music:["Music","الموسيقى"], pacing:["Pacing","الإيقاع"], transitions:["Transitions","الانتقالات"], captions_style:["Subtitle style","أسلوب الترجمة"], sfx:["Sound effects","المؤثرات الصوتية"] };
  return path.split(".").map(key => /^\d+$/.test(key) ? String(Number(key) + 1) : labels[key]?.[locale === "ar" ? 1 : 0] ?? key.replaceAll("_", " ")).join(" · ");
}
