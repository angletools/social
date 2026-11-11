import type { Sentiment } from "@prisma/client";
import { cn } from "@/lib/utils";

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

/** Horizontal stacked bar of positive / neutral / negative shares. */
export function SentimentBar({ pos, neu, neg, className }: { pos: number; neu: number; neg: number; className?: string }) {
  const total = pos + neu + neg || 1;
  return (
    <div className={cn("flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-sunken", className)}>
      {pos > 0 && <div className="bg-pos" style={{ width: `${(pos / total) * 100}%` }} />}
      {neu > 0 && <div className="bg-neu/70" style={{ width: `${(neu / total) * 100}%` }} />}
      {neg > 0 && <div className="bg-neg" style={{ width: `${(neg / total) * 100}%` }} />}
    </div>
  );
}
