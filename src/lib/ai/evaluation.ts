export type LabeledPost = { text: string; dialect: string; sentiment: string; intent: string; sarcasm: boolean };
export type PredictedPost = Omit<LabeledPost, "text"> & { n: number };
export function scoreClassifications(gold: LabeledPost[], predictions: PredictedPost[]) {
  const keys = ["dialect", "sentiment", "intent", "sarcasm"] as const;
  const used = new Set<number>();
  const correct = { dialect: 0, sentiment: 0, intent: 0, sarcasm: 0 };
  const slices: Record<string, { n: number; sentimentCorrect: number }> = {};
  for (const g of gold) (slices[g.dialect] ??= { n: 0, sentimentCorrect: 0 }).n++;
  for (const p of predictions) {
    if (!Number.isInteger(p.n) || !gold[p.n - 1] || used.has(p.n)) throw new Error("INVALID_PREDICTION_INDEX");
    used.add(p.n); const g = gold[p.n - 1];
    for (const k of keys) if (g[k] === p[k]) correct[k]++;
    if (g.sentiment === p.sentiment) slices[g.dialect].sentimentCorrect++;
  }
  return { total: gold.length, answered: used.size, missing: gold.length - used.size, accuracy: Object.fromEntries(keys.map(k => [k, gold.length ? correct[k] / gold.length : 0])) as Record<typeof keys[number], number>, dialectSlices: slices };
}
