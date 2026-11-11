/**
 * Virality scoring for trend discovery.
 *
 * Raw views favour big accounts. What content teams want is formats that
 * outperform: posts that reached far more people than the creator normally
 * does. The score blends:
 *   - outlier ratio  = views / followers (how far beyond the usual audience it went)
 *   - engagement rate = (likes + comments + shares) / views
 *   - velocity        = views per hour since posting (log-scaled)
 * Each part is log-scaled so a single mega-post doesn't dominate.
 */
export type PostMetrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number | null;
  publishedAt: Date;
};

export function outlierRatio(m: Pick<PostMetrics, "views" | "followers">) {
  return m.views / Math.max(m.followers ?? 0, 1000);
}

export function viralityScore(m: PostMetrics, now = Date.now()) {
  const views = Math.max(m.views, 0);
  if (views === 0) return 0;
  const ageH = Math.max(1, (now - m.publishedAt.getTime()) / 3600_000);
  const er = Math.min(0.5, (m.likes + m.comments + m.shares * 2) / views);
  const outlier = Math.log10(1 + outlierRatio(m)); // 0..~3
  const velocity = Math.log10(1 + views / ageH); // 0..~6
  const engagement = Math.sqrt(er) * 4; // 0..~2.8
  return Math.round((outlier * 4 + velocity * 1.5 + engagement * 2) * 10) / 10;
}

export type Momentum = "NEW" | "RISING" | "PEAKING" | "FADING";

/**
 * Momentum of a format from the views of its posts over time:
 * compares the last 3 days to the 4 days before.
 */
export function momentum(posts: { publishedAt: Date; views: number }[], firstSeenAt: Date, now = Date.now()): Momentum {
  const day = 86400_000;
  if (now - firstSeenAt.getTime() < 2 * day) return "NEW";
  const recent = posts.filter((p) => now - p.publishedAt.getTime() <= 3 * day).reduce((a, p) => a + p.views, 0) / 3;
  const prior =
    posts.filter((p) => now - p.publishedAt.getTime() > 3 * day && now - p.publishedAt.getTime() <= 7 * day).reduce((a, p) => a + p.views, 0) / 4;
  if (prior === 0) return recent > 0 ? "RISING" : "FADING";
  if (recent > prior * 1.3) return "RISING";
  if (recent < prior * 0.6) return "FADING";
  return "PEAKING";
}

/** Rough-cut timeline helpers shared by the server (export) and the browser editor. */
export type Beat = { start: number; duration: number; vo: string; onScreen: string; visual: string; shot: number };

/** Re-flows beat start times from durations so the timeline is always contiguous. */
export function reflowBeats(beats: Beat[]): Beat[] {
  let t = 0;
  return beats.map((b) => {
    const duration = Math.min(30, Math.max(0.5, Number(b.duration) || 2));
    const out = { ...b, start: Math.round(t * 10) / 10, duration };
    t += duration;
    return out;
  });
}

function srtTime(sec: number) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** SubRip captions from the voice-over (falls back to on-screen text). */
export function toSrt(beats: Beat[]) {
  return reflowBeats(beats)
    .filter((b) => (b.vo || b.onScreen).trim())
    .map((b, i) => `${i + 1}\n${srtTime(b.start)} --> ${srtTime(b.start + b.duration)}\n${(b.vo || b.onScreen).trim()}\n`)
    .join("\n");
}
