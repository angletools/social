import { expect, it } from "vitest";
import { draftDiff } from "@/lib/draft-diff";
import { aggregateVolume } from "@/lib/chart-buckets";
import { bucketHours } from "@/lib/report-series";
it("compares saved fields and ordered beats, including removals", () => {
  const result = draftDiff({ caption: "Old", beats: [{ vo: "First" }, { vo: "Second" }] }, { caption: "New", beats: [{ vo: "Second" }] });
  expect(result.total).toBe(3);
  expect(result.changes).toContainEqual({ field: "caption", before: "Old", after: "New" });
  expect(result.changes).toContainEqual({ field: "beats.1", before: '{"vo":"Second"}', after: "—" });
});
it("preserves every post while aggregating a dense phone chart", () => {
  const points = Array.from({ length: 24 }, (_, i) => ({ t: `2026-11-12T${String(i).padStart(2,"0")}:00:00`, total: i, positive: i, negative: 0, neutral: 0 }));
  const buckets = aggregateVolume(points);
  expect(buckets).toHaveLength(6); expect(buckets.reduce((n,p)=>n+p.total,0)).toBe(276); expect(points).toHaveLength(24);
});
it("keeps evidence in a partially completed final report bucket", () => {
  const result = bucketHours(new Map([["2026-11-12T20:00:00", 5]]), new Date("2026-11-12T00:00:00Z"), new Date("2026-11-12T20:30:00Z"), "4h");
  expect(result.points.at(-1)).toEqual({ t: "2026-11-12T20:00:00", n: 5 });
});

import { scoreClassifications } from "@/lib/ai/evaluation";
it("counts missing predictions as failures and rejects duplicate model indices", () => {
  const gold = [{ text:"جميل", dialect:"SAUDI", sentiment:"POSITIVE", intent:"PRAISE", sarcasm:false }, { text:"يا سلام على التأخير", dialect:"SAUDI", sentiment:"NEGATIVE", intent:"COMPLAINT", sarcasm:true }];
  const one = { ...gold[0], n:1 };
  expect(scoreClassifications(gold,[one])).toMatchObject({ answered:1, missing:1, accuracy:{ sentiment:0.5 } });
  expect(() => scoreClassifications(gold,[one,one])).toThrow("INVALID_PREDICTION_INDEX");
});
