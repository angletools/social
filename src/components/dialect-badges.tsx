import type { Dialect, Intent } from "@prisma/client";
import { cn } from "@/lib/utils";

export const DIALECT_COLORS: Record<Dialect, string> = {
  SAUDI: "#12735a",
  KHALEEJI: "#3a7f8c",
  EGYPTIAN: "#b98a3e",
  LEVANTINE: "#7a5aa6",
  IRAQI: "#a8524a",
  MAGHREBI: "#6b7f3a",
  MSA: "#5f646b",
  ARABIZI: "#8a3f74",
  ENGLISH: "#2f64a8",
  OTHER: "#a3a8af",
};

export function DialectBadge({ dialect, label }: { dialect: Dialect; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: DIALECT_COLORS[dialect] }} />
      {label}
    </span>
  );
}

const INTENT_STYLE: Partial<Record<Intent, string>> = {
  CHURN_RISK: "bg-neg text-white",
  COMPLAINT: "bg-neg/[0.07] text-neg",
  QUESTION: "bg-info/[0.08] text-info",
  PURCHASE_INTENT: "bg-brand-50 text-brand-700",
  PRAISE: "bg-pos/[0.08] text-pos",
  SUGGESTION: "bg-sand-50 text-sand-700",
};

export function IntentBadge({ intent, label }: { intent: Intent; label: string }) {
  return <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11.5px] font-medium", INTENT_STYLE[intent] ?? "bg-sunken text-muted")}>{label}</span>;
}

export function SarcasmBadge({ label, help }: { label: string; help: string }) {
  return (
    <span title={help} className="inline-flex h-5 items-center rounded-md bg-plum/[0.08] px-1.5 text-[11.5px] font-medium text-plum">
      {label}
    </span>
  );
}

export function SlangChips({ items }: { items: { term: string; gloss: string }[] }) {
  return (
    <ul className="mt-3 space-y-1 border-s-2 border-sand-100 ps-3 text-xs">
      {items.map((s) => (
        <li key={s.term} className="flex flex-wrap items-baseline gap-x-2">
          <b dir="auto" className="font-medium text-ink">{s.term}</b>
          <span className="text-muted" dir="ltr">{s.gloss}</span>
        </li>
      ))}
    </ul>
  );
}
