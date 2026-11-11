import type { Sentiment } from "@prisma/client";
import { cn } from "@/lib/utils";
import { DotBar } from "./dots";

const DOT: Record<Sentiment, string> = { POSITIVE: "bg-pos", NEUTRAL: "bg-neu", NEGATIVE: "bg-neg" };
const TEXT: Record<Sentiment, string> = { POSITIVE: "text-pos", NEUTRAL: "text-muted", NEGATIVE: "text-neg" };

export function SentimentBadge({ sentiment, label }: { sentiment: Sentiment | null; label: string }) {
  if (!sentiment) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TEXT[sentiment])}>
      <span className={cn("h-2 w-2 rounded-full", DOT[sentiment])} />
      {label}
    </span>
  );
}

/** Positive / neutral / negative shares as a row of dots. */
export function SentimentBar({ pos, neu, neg, className, rows = 1 }: { pos: number; neu: number; neg: number; className?: string; rows?: number }) {
  return (
    <DotBar
      className={className}
      rows={rows}
      segments={[
        { value: pos, color: "var(--color-pos)" },
        { value: neu, color: "var(--color-neu)" },
        { value: neg, color: "var(--color-neg)" },
      ]}
    />
  );
}
