import type { Dialect, Intent } from "@prisma/client";
import { cn } from "@/lib/utils";

export const DIALECT_COLORS: Record<Dialect, string> = {
  SAUDI: "#12735a",
  KHALEEJI: "#3a7f8c",
  EGYPTIAN: "#b98a3e",
  LEVANTINE: "#7a5aa6",
  IRAQI: "#a8524a",
  MAGHREBI: "#6b7f3a",
  MSA: "var(--color-muted)",
  ARABIZI: "#8a3f74",
  ENGLISH: "#2f64a8",
  OTHER: "var(--color-neu)",
};

export function DialectBadge({ dialect, label }: { dialect: Dialect; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DIALECT_COLORS[dialect] }} aria-hidden />
      {label}
    </span>
  );
}

const INTENT_STYLE: Partial<Record<Intent, string>> = {
  CHURN_RISK: "bg-neg/[0.1] text-neg",
  COMPLAINT: "bg-neg/[0.07] text-neg",
  QUESTION: "bg-info/[0.08] text-info",
  PURCHASE_INTENT: "bg-brand-50 text-brand-700",
  PRAISE: "bg-pos/[0.08] text-pos",
  SUGGESTION: "bg-sand-50 text-sand-700",
};

export function IntentBadge({ intent, label }: { intent: Intent; label: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-[7px] px-2 text-[12.5px] font-semibold", INTENT_STYLE[intent] ?? "bg-sunken text-muted")}>{label}</span>;
}

export function SarcasmBadge({ label, help }: { label: string; help: string }) {
  return (
    <span title={help} className="inline-flex items-center text-plum">
      {label}
    </span>
  );
}

export function SlangChips({ items }: { items: { term: string; gloss: string }[] }) {
  return (
    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-xl bg-panel px-4 py-3 text-[13px] leading-5">
      {items.map((s) => (
        <div key={s.term} className="contents">
          <dt dir="auto" className="font-semibold text-ink">{s.term}</dt>
          <dd dir="ltr" className="text-muted rtl:text-right">{s.gloss}</dd>
        </div>
      ))}
    </dl>
  );
}
