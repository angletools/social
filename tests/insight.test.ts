import { describe, expect, it } from "vitest";
import { bucketize, dowHourLabel, extremes, gaugeNotches, gridExtremes, hourLabel, sharpestDrop, slotLabel, tzCity, viewsCurve } from "@/lib/insight";

describe("slot labels", () => {
  it("names hours the way people say them", () => {
    expect(hourLabel(21, "en")).toBe("9 PM");
    expect(hourLabel(0, "en")).toBe("12 AM");
    expect(hourLabel(21, "ar")).toBe("9 مساءً");
    expect(hourLabel(4, "ar")).toBe("4 فجرًا");
    expect(hourLabel(10, "ar")).toBe("10 صباحًا");
  });

  it("joins weekday and hour per language", () => {
    expect(dowHourLabel(0, 21, "en")).toBe("Sunday, 9 PM");
    expect(dowHourLabel(6, 4, "ar")).toBe("السبت 4 فجرًا");
  });

  it("reads timeseries buckets as local wall-clock time", () => {
    // 2026-11-08 was a Sunday.
    expect(slotLabel("2026-11-08T21:00:00", "hour", "en")).toBe("Sunday, 9 PM");
    expect(slotLabel("2026-11-08T00:00:00", "day", "en")).toBe("Sunday, 8 November");
  });
});

describe("extremes", () => {
  it("finds the busiest and quietest bucket", () => {
    const pts = [{ t: "a", total: 3 }, { t: "b", total: 9 }, { t: "c", total: 1 }, { t: "d", total: 9 }];
    const e = extremes(pts)!;
    expect(e.busiest.t).toBe("b");
    expect(e.quietest.t).toBe("c");
  });

  it("is null without data", () => {
    expect(extremes([{ t: "a", total: 0 }, { t: "b", total: 0 }])).toBeNull();
    expect(extremes([])).toBeNull();
  });

  it("finds the peak and quietest cell of a heatmap grid", () => {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(2));
    grid[0][21] = 50;
    grid[6][4] = 0;
    expect(gridExtremes(grid)).toEqual({ peak: { dow: 0, hour: 21, n: 50 }, quiet: { dow: 6, hour: 4, n: 0 } });
    expect(gridExtremes(Array.from({ length: 7 }, () => Array<number>(24).fill(0)))).toBeNull();
  });
});

describe("sharpestDrop", () => {
  it("marks the largest fall between buckets with enough volume", () => {
    const pts = [
      { t: "1", net: 10, total: 20 },
      { t: "2", net: 8, total: 20 },
      { t: "3", net: -6, total: 25 },
      { t: "4", net: -40, total: 2 }, // too few posts to count
      { t: "5", net: -2, total: 20 },
    ];
    expect(sharpestDrop(pts)).toEqual({ index: 2, t: "3", drop: 14, net: -6 });
  });

  it("ignores small wobbles", () => {
    expect(sharpestDrop([{ t: "1", net: 5, total: 20 }, { t: "2", net: 2, total: 20 }])).toBeNull();
  });
});

describe("helpers", () => {
  it("sums long series into groups", () => {
    expect(bucketize([1, 1, 1, 1, 1, 1], 3)).toEqual([2, 2, 2]);
    expect(bucketize([1, 2], 5)).toEqual([1, 2]);
  });

  it("fills the gauge up to the net value", () => {
    expect(gaugeNotches(-100).filter((n) => n.on)).toHaveLength(1);
    expect(gaugeNotches(100).every((n) => n.on)).toBe(true);
    expect(gaugeNotches(0).filter((n) => n.on)).toHaveLength(21);
    // Mirrored for right-to-left: the first notch sits on the right.
    expect(gaugeNotches(0, { mirror: true })[0].x1).toBeGreaterThan(120);
  });

  it("names the timezone's city", () => {
    expect(tzCity("Asia/Riyadh", "en")).toBe("Riyadh");
    expect(tzCity("Asia/Riyadh", "ar")).toBe("الرياض");
    expect(tzCity("America/New_York", "en")).toBe("New York");
  });

  it("accumulates views over time", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
    const curve = viewsCurve([{ views: 10, publishedAt: d(0) }, { views: 30, publishedAt: d(10) }], 3);
    expect(curve).toEqual([10, 25, 40]);
    expect(viewsCurve([])).toEqual([]);
  });
});
