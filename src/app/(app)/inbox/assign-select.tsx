"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, UserRoundPlus } from "lucide-react";
import { assignMention } from "@/app/actions";
import { toast } from "@/components/feedback";
import { fill, useClientDict } from "@/components/client-dict";
import { cn } from "@/lib/utils";

/** A small round button showing who owns the conversation; opens a list of teammates. */
export function AssignSelect({
  mentionId,
  value,
  members,
  label,
}: {
  mentionId: string;
  value: string;
  members: { id: string; name: string }[];
  label: string;
}) {
  const [v, setV] = useState(value);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toasts, common } = useClientDict();
  const ref = useRef<HTMLDivElement>(null);
  const current = members.find((m) => m.id === v);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const pick = (next: string) => {
    setOpen(false);
    if (next === v) return;
    setV(next);
    start(async () => {
      const res = await assignMention(mentionId, next || null);
      if (!res.ok) return toast(common.failed, "error");
      toast(res.name ? fill(toasts.assigned, { name: res.name }) : toasts.unassigned);
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-label={current ? `${label}: ${current.name}` : label}
        title={current ? current.name : label}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
          current ? "border-transparent bg-sunken text-ink" : "border-line text-muted hover:text-ink",
        )}
      >
        {current ? current.name.slice(0, 1) : <UserRoundPlus className="h-4 w-4" strokeWidth={1.6} />}
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="animate-rise absolute end-0 top-11 z-30 w-56 rounded-2xl bg-surface p-1 shadow-[var(--shadow-pop)]">
          {[{ id: "", name: common.unassigned }, ...members].map((m) => (
            <button
              key={m.id || "none"}
              type="button"
              role="option"
              aria-selected={m.id === v}
              onClick={() => pick(m.id)}
              className="flex h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-start text-[13px] hover:bg-sunken"
            >
              <span className={cn("truncate", !m.id && "text-muted")}>{m.name}</span>
              {m.id === v && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
