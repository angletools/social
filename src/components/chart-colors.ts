/** Shared series colours so chart legends rendered on the server match the client charts. */
const NEUTRAL_SERIES = ["var(--color-ink)", "var(--color-faint)", "var(--color-line-strong)", "var(--color-muted)"];

export function sovColors(items: { isCompetitor: boolean }[]) {
  let k = 0;
  return items.map((d) => (d.isCompetitor ? NEUTRAL_SERIES[k++ % NEUTRAL_SERIES.length] : "var(--chart-1)"));
}
