import type { Dialect, Intent } from "@prisma/client";
import { cn } from "@/lib/utils";

export const DIALECT_COLORS: Record<Dialect, string> = {
  SAUDI: "#0b8a6b",
  KHALEEJI: "#0e7490",
  EGYPTIAN: "#b45309",
  LEVANTINE: "#7c3aed",
  IRAQI: "#be123c",
  MAGHREBI: "#4d7c0f",
  MSA: "#475569",
  ARABIZI: "#db2777",
  ENGLISH: "#2563eb",
  OTHER: "#94a3b8",
};

export function DialectBadge({ dialect, label }: { dialect: Dialect; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-line">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: DIALECT_COLORS[dialect] }} />
      {label}
    </span>
  );
}

const INTENT_STYLE: Partial<Record<Intent, string>> = {
  CHURN_RISK: "bg-red-600 text-white",
  COMPLAINT: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  QUESTION: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  PURCHASE_INTENT: "bg-emerald-600 text-white",
  PRAISE: "bg-green-50 text-green-700 ring-1 ring-green-200",
  SUGGESTION: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

export function IntentBadge({ intent, label }: { intent: Intent; label: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", INTENT_STYLE[intent] ?? "bg-slate-100 text-slate-600")}>{label}</span>;
}

export function SarcasmBadge({ label, help }: { label: string; help: string }) {
  return (
    <span title={help} className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-xs font-medium text-fuchsia-700 ring-1 ring-fuchsia-200">
      🙃 {label}
    </span>
  );
}

export function SlangChips({ items }: { items: { term: string; gloss: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s.term} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900" title={s.gloss}>
          <b dir="auto">{s.term}</b>
          <span className="text-amber-700/80" dir="ltr">· {s.gloss}</span>
        </span>
      ))}
    </div>
  );
}
