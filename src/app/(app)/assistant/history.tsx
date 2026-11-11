"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, History as HistoryIcon, Plus, Trash2 } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import { deleteAssistantThread } from "@/app/actions";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/feedback";

type Thread = { id: string; title: string; when: string };

function useMac() {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return mac;
}

function ThreadList({ threads, current, t, deleteLabels, onPick }: { threads: Thread[]; current?: string; t: Dict["assistantPage"]; deleteLabels: { confirm: string; delete: string }; onPick?: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (threads.length === 0) return <p className="px-3 py-2 text-[13.5px] text-faint">{t.noHistory}</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {threads.map((th) => {
        const on = th.id === current;
        return (
          <li key={th.id} className="group relative">
            <Link
              href={`/assistant?thread=${th.id}`}
              aria-current={on ? "page" : undefined}
              onClick={onPick}
              className={cn("block rounded-[12px] py-2.5 ps-3 pe-9 transition-colors duration-150", on ? "bg-selected" : "hover:bg-sunken/60")}
            >
              <span dir="auto" className="block truncate text-[14.5px] leading-[1.6] font-medium">{th.title}</span>
              <span className="block text-[12.5px] text-faint">{th.when}</span>
            </Link>
            <button
              type="button"
              disabled={pending}
              aria-label={`${t.delete}: ${th.title}`}
              title={t.delete}
              onClick={async () => {
                if (!(await confirmDialog(deleteLabels.confirm, { danger: true, confirmLabel: deleteLabels.delete, detail: th.title }))) return;
                start(async () => {
                  await deleteAssistantThread(th.id);
                  if (on) router.replace("/assistant");
                });
              }}
              className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Desktop history column: title, New chat, previous chats. */
export function History({ threads, current, t, deleteLabels }: { threads: Thread[]; current?: string; t: Dict["assistantPage"]; deleteLabels: { confirm: string; delete: string } }) {
  const mac = useMac();
  return (
    <section aria-label={t.history} className="no-print hidden w-[320px] shrink-0 flex-col border-e border-sunken bg-canvas lg:flex">
      <div className="px-6 pt-7 pb-4">
        <h1 className="text-[24px] font-semibold">{t.title}</h1>
      </div>
      <div className="px-6 pb-2">
        <Link href="/assistant" className="flex h-10 w-full items-center gap-2.5 rounded-[12px] border border-line px-3 text-[14px] font-medium transition-colors duration-150 hover:bg-sunken active:scale-[0.99]">
          <Plus className="h-4 w-4" strokeWidth={1.7} />
          <span className="flex-1 text-start">{t.newChat}</span>
          <kbd dir="ltr" className="font-sans text-[12.5px] text-faint">{mac ? "⌘J" : "Ctrl J"}</kbd>
        </Link>
      </div>
      <div className="px-6 pt-[18px] pb-1.5 text-[13px] text-faint">{t.history}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <ThreadList threads={threads} current={current} t={t} deleteLabels={deleteLabels} />
      </div>
    </section>
  );
}

/** Phones and tablets: the same history behind a button above the chat. */
export function MobileHistory({ threads, current, t, deleteLabels }: { threads: Thread[]; current?: string; t: Dict["assistantPage"]; deleteLabels: { confirm: string; delete: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path, current]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative flex items-center justify-between gap-2 px-4 pt-5 pb-2 lg:hidden">
      <h1 className="text-[22px] font-semibold">{t.title}</h1>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="btn-ghost h-9 rounded-[10px] px-2.5 text-[13.5px]">
          <HistoryIcon className="h-4 w-4" strokeWidth={1.7} />
          <span className="sr-only sm:not-sr-only">{t.historyToggle}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")} />
        </button>
        <Link href="/assistant" aria-label={t.newChat} className="btn-secondary h-9 w-9 rounded-[10px] px-0">
          <Plus className="h-4 w-4" strokeWidth={1.7} />
        </Link>
      </div>
      {open && (
        <div className="animate-pop absolute inset-x-4 top-full z-30 max-h-[60dvh] origin-top overflow-y-auto rounded-[16px] bg-surface p-2 shadow-[0_0_0_1px_var(--color-line),0_16px_40px_rgba(0,0,0,0.14)]">
          <ThreadList threads={threads} current={current} t={t} deleteLabels={deleteLabels} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
