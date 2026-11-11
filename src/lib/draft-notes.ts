/** Pure helpers for draft compliance notes; safe in client components. */

export type BeatText = { start: number; duration: number; vo: string; onScreen: string };

/**
 * Finds the script beat a compliance note talks about, so "Go to line" can
 * jump there. Notes usually quote the line ("…", «…», "…") or give a time ("at 17s").
 * Returns -1 when the note doesn't point at one line.
 */
export function beatForNote(note: string, beats: BeatText[]): number {
  const quotes = [...note.matchAll(/[“"«„‘']([^”"»‘’']{2,})[”"»’']/g)].map((m) => m[1].trim()).filter((q) => q.length >= 2);
  for (const q of quotes) {
    const i = beats.findIndex((b) => b.vo.includes(q) || b.onScreen.includes(q));
    if (i !== -1) return i;
  }
  const t = note.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|ث|ثانية)/i);
  if (t) {
    const sec = Number(t[1]);
    const i = beats.findIndex((b) => sec >= b.start && sec < b.start + b.duration);
    if (i !== -1) return i;
  }
  return -1;
}
