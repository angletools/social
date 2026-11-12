export type VolumePoint = { t: string; total: number; positive: number; negative: number; neutral: number };
export function aggregateVolume(points: VolumePoint[], hours = 4): VolumePoint[] {
  const groups = new Map<string, VolumePoint>();
  for (const p of points) {
    const date = new Date(`${p.t}Z`);
    date.setUTCHours(Math.floor(date.getUTCHours() / hours) * hours, 0, 0, 0);
    const key = date.toISOString().slice(0, 19);
    const item = groups.get(key) ?? { t: key, total: 0, positive: 0, negative: 0, neutral: 0 };
    for (const k of ["total", "positive", "negative", "neutral"] as const) item[k] += p[k];
    groups.set(key, item);
  }
  return [...groups.values()].sort((a,b) => a.t.localeCompare(b.t));
}
