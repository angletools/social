import { describe, expect, it } from "vitest";
import { citedIds, followupsOf, parseTable, plainAnswer, segmentAnswer } from "@/lib/assistant-format";
import { bucketHours } from "@/lib/report-series";

const answer = `Complaints rose **41%** this week.

| Topic | Mentions | Change |
| --- | --- | --- |
| App crashes | 92 | +61 |
| Withdrawals | 58 | +9 |
| US fees | 18 | −3 |

Two posts sum it up:
[[post:cmw1aaaabbbbcccc]]
[[post:cmw2ddddeeeeffff]]

I'd pin a status post.
[[followup:Write the standard reply]]
[[followup:Show all crash posts]]`;

describe("assistant answer format", () => {
  it("finds cited posts and follow-ups", () => {
    expect(citedIds(answer)).toEqual(["cmw1aaaabbbbcccc", "cmw2ddddeeeeffff"]);
    expect(followupsOf(answer)).toEqual(["Write the standard reply", "Show all crash posts"]);
  });

  it("groups consecutive post lines into one card row and drops follow-ups", () => {
    const seg = segmentAnswer(answer);
    expect(seg.map((s) => s.type)).toEqual(["md", "posts", "md"]);
    expect(seg[1]).toEqual({ type: "posts", ids: ["cmw1aaaabbbbcccc", "cmw2ddddeeeeffff"] });
    expect(seg.at(-1)).toEqual({ type: "md", text: "I'd pin a status post." });
  });

  it("hides a marker that is still streaming", () => {
    expect(segmentAnswer("Here is one:\n[[post:cmw1aa")).toEqual([{ type: "md", text: "Here is one:" }]);
  });

  it("strips an inline citation from a sentence", () => {
    expect(segmentAnswer("Saud said it best [[post:cmw1aaaabbbbcccc]] yesterday.")).toEqual([{ type: "md", text: "Saud said it best yesterday." }]);
    expect(plainAnswer(answer)).not.toContain("[[");
  });

  it("draws a dotted-bar table when a column holds plain counts", () => {
    const table = answer.split("\n\n")[1];
    const t = parseTable(table)!;
    expect(t.head).toEqual(["Topic", "Mentions", "Change"]);
    expect(t.bar).toBe(1);
    expect(t.max).toBe(92);
    expect(t.rows[2]).toEqual(["US fees", "18", "−3"]);
  });

  it("leaves tables without a count column alone", () => {
    expect(parseTable("| Name | Platform |\n| --- | --- |\n| Saud | X |")).toBeNull();
    expect(parseTable("| Theme | Change |\n| --- | --- |\n| Fees | +3 |\n| App | −2 |")).toBeNull();
  });
});

describe("report series buckets", () => {
  const hourly = new Map([
    ["2026-11-08T09:00:00", 3],
    ["2026-11-08T10:00:00", 5],
    ["2026-11-08T21:00:00", 7],
  ]);
  it("sums hours into 4-hour buckets aligned to local midnight", () => {
    const s = bucketHours(hourly, new Date("2026-11-08T09:30:00Z"), new Date("2026-11-08T23:00:00Z"), "4h");
    expect(s.points[0]).toEqual({ t: "2026-11-08T08:00:00", n: 8 });
    expect(s.points.find((p) => p.t === "2026-11-08T20:00:00")?.n).toBe(7);
  });
  it("leaves out a final bucket that has barely started", () => {
    const s = bucketHours(hourly, new Date("2026-11-08T00:00:00Z"), new Date("2026-11-08T20:00:00Z"), "4h");
    expect(s.points.at(-1)?.t).toBe("2026-11-08T16:00:00");
  });
});
