import type { Sentiment } from "@prisma/client";
import { cn } from "@/lib/utils";

const STYLE: Record<Sentiment, string> = {
  POSITIVE: "bg-green-50 text-green-700 ring-green-200",
  NEUTRAL: "bg-slate-50 text-slate-600 ring-slate-200",
  NEGATIVE: "bg-red-50 text-red-700 ring-red-200",
};
const DOT: Record<Sentiment, string> = { POSITIVE: "bg-pos", NEUTRAL: "bg-neu", NEGATIVE: "bg-neg" };

export function SentimentBadge({ sentiment, label }: { sentiment: Sentiment | null; label: string }) {
  if (!sentiment) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1", STYLE[sentiment])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[sentiment])} />
      {label}
    </span>
  );
}

/** Horizontal stacked bar of positive / neutral / negative shares. */
export function SentimentBar({ pos, neu, neg, className }: { pos: number; neu: number; neg: number; className?: string }) {
  const total = pos + neu + neg || 1;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="bg-pos" style={{ width: `${(pos / total) * 100}%` }} />
      <div className="bg-neu" style={{ width: `${(neu / total) * 100}%` }} />
      <div className="bg-neg" style={{ width: `${(neg / total) * 100}%` }} />
    </div>
  );
}
