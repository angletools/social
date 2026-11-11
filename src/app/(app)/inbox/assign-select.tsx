"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, UserRoundPlus } from "lucide-react";
import { assignMention } from "@/app/actions";
import { toast } from "@/components/feedback";
import { fill, useClientDict } from "@/components/client-dict";
import { cn } from "@/lib/utils";

/** "Assign" chip showing who owns the conversation; opens a list of teammates. */
export function AssignSelect({
  mentionId,
  value,
  members,
  label,
  buttonLabel,
}: {
  mentionId: string;
  value: string;
  members: { id: string; name: string }[];
  label: string;
  buttonLabel: string;
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
        className="inline-flex h-[30px] max-w-[160px] shrink-0 items-center gap-2 rounded-[9px] border border-line ps-2.5 pe-3 text-[13px] font-medium text-ink transition-[background-color,transform] duration-150 ease-(--ease-out) select-none hover:bg-sunken active:scale-[0.97] max-md:h-11"
      >
        {current ? (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-ink text-[10px] font-semibold text-on-ink">{[...current.name][0]}</span>
        ) : (
          <UserRoundPlus className="h-[15px] w-[15px] shrink-0" strokeWidth={1.7} />
        )}
        <span className="truncate">{current ? current.name.replace(/\s*\(.*\)$/, "") : buttonLabel}</span>
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="animate-pop absolute end-0 top-10 z-30 w-56 rounded-2xl bg-surface p-1 shadow-[var(--shadow-pop)] ltr:origin-top-right rtl:origin-top-left">
          {[{ id: "", name: common.unassigned }, ...members].map((m) => (
            <button
              key={m.id || "none"}
              type="button"
              role="option"
              aria-selected={m.id === v}
              onClick={() => pick(m.id)}
              className="flex h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-start text-[13.5px] hover:bg-sunken"
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
