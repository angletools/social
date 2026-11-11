"use client";

import { PostingHeatmap, type PostingGrid } from "@/components/app-charts";

/** Client wrapper so the server page can pass plain strings (no functions). */
export function PostingHeatmapCard({ grid, locale, labels }: { grid: PostingGrid; locale: string; labels: { less: string; more: string; idle: string; posts: string } }) {
  const n = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  return <PostingHeatmap grid={grid} locale={locale} labels={{ ...labels, posts: (c) => labels.posts.replace("{n}", n.format(c)) }} />;
}
