/**
 * Measures the classifier on a hand-labelled set of regional posts
 * (dialect, sentiment, intent, sarcasm). Uses the real model: costs a few cents.
 *   npm run eval:dialect
 * Edit evals/dialect-set.json to add your own customers' posts.
 */
import fs from "node:fs";
import path from "node:path";
import { CLASSIFIER_SYSTEM, classifyBatch } from "../src/lib/ai/enrich";
import { AI_ENRICH_MODEL, aiEnabled } from "../src/lib/ai/client";

type Item = { text: string; dialect: string; sentiment: string; intent: string; sarcasm: boolean };

async function main() {
  if (!aiEnabled()) {
    console.error("Set ANTHROPIC_API_KEY first.");
    process.exit(1);
  }
  const set: Item[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "evals/dialect-set.json"), "utf8"));
  const xml = set.map((x, i) => `<post n="${i + 1}" platform="X" monitored="keyword: our brand">\n${x.text}\n</post>`).join("\n");
  const out = await classifyBatch([{ type: "text", text: CLASSIFIER_SYSTEM }], xml, set.length);
  if (!out) throw new Error("Model refused the batch");

  const score = { dialect: 0, sentiment: 0, intent: 0, sarcasm: 0 };
  const misses: string[] = [];
  for (const r of out.results) {
    const gold = set[r.n - 1];
    if (!gold) continue;
    const hit = {
      dialect: r.dialect === gold.dialect,
      sentiment: r.sentiment === gold.sentiment,
      intent: r.intent === gold.intent,
      sarcasm: r.sarcasm === gold.sarcasm,
    };
    for (const k of Object.keys(score) as (keyof typeof score)[]) if (hit[k]) score[k]++;
    const wrong = (Object.keys(hit) as (keyof typeof hit)[]).filter((k) => !hit[k]);
    if (wrong.length) misses.push(`#${r.n} ${gold.text.slice(0, 60)}\n    ${wrong.map((k) => `${k}: got ${String(r[k])}, want ${String(gold[k])}`).join("; ")}`);
  }
  const pct = (n: number) => `${Math.round((n / set.length) * 100)}%`;
  console.log(`Model: ${AI_ENRICH_MODEL}  ·  ${set.length} posts`);
  console.log(`dialect ${pct(score.dialect)} · sentiment ${pct(score.sentiment)} · intent ${pct(score.intent)} · sarcasm ${pct(score.sarcasm)}`);
  if (misses.length) console.log(`\nMisses:\n${misses.join("\n")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
