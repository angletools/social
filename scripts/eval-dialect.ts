/** Paid provider evaluation. Use an independent held-out set for release decisions. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { CLASSIFIER_SYSTEM, CLASSIFIER_VERSION, classifyBatch } from "../src/lib/ai/enrich";
import { AI_ENRICH_MODEL, aiEnabled } from "../src/lib/ai/client";
import { scoreClassifications, type PredictedPost } from "../src/lib/ai/evaluation";
import { db } from "../src/lib/db";
const SetSchema = z.array(z.object({ text: z.string().min(1).max(5000), dialect: z.enum(["SAUDI", "KHALEEJI", "EGYPTIAN", "LEVANTINE", "IRAQI", "MAGHREBI", "MSA", "ARABIZI", "ENGLISH", "OTHER"]), sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]), intent: z.enum(["COMPLAINT", "QUESTION", "PRAISE", "PURCHASE_INTENT", "CHURN_RISK", "SUGGESTION", "OTHER"]), sarcasm: z.boolean() })).min(1).max(1000);
async function main() {
  if (!process.env.EVAL_ORG_ID || !aiEnabled()) throw new Error("Set EVAL_ORG_ID to a test workspace and configure AI. Evaluation uses its monthly allowance.");
  const input = process.env.EVAL_DATASET ?? "evals/dialect-set.json";
  const raw = fs.readFileSync(input, "utf8"), set = SetSchema.parse(JSON.parse(raw));
  const predictions: PredictedPost[] = [];
  for (let offset = 0; offset < set.length; offset += 25) {
    const batch = set.slice(offset, offset + 25);
    const evidence = JSON.stringify(batch.map((p,i) => ({ n:i+1, platform:"X", monitored:"our brand", text:p.text })));
    const out = await classifyBatch([{ type: "text", text: CLASSIFIER_SYSTEM }], evidence, batch.length, process.env.EVAL_ORG_ID);
    if (!out) throw new Error("Model refused a batch");
    for (const r of out.results) { if (r.n > batch.length) throw new Error("INVALID_PREDICTION_INDEX"); predictions.push({ ...r, n: r.n + offset }); }
  }
  const result = scoreClassifications(set, predictions);
  const threshold = z.coerce.number().min(0).max(1).parse(process.env.EVAL_MIN_ACCURACY ?? "0.8");
  const pass = result.missing === 0 && Object.values(result.accuracy).every(n => n >= threshold);
  const output = { at: new Date().toISOString(), model: AI_ENRICH_MODEL, classifierVersion: CLASSIFIER_VERSION, datasetSHA256: createHash("sha256").update(raw).digest("hex"), threshold, pass, independentValidation: false, note: "Independence and reviewer agreement must be established separately; built-in examples are a smoke set, not release-quality evidence.", ...result };
  fs.writeFileSync(process.env.EVAL_OUTPUT ?? "/tmp/rasd-dialect-evaluation.json", JSON.stringify(output,null,2)+"\n");
  console.log(JSON.stringify(output,null,2));
  if (!pass) process.exitCode = 1;
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
