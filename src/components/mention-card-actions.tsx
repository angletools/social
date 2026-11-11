"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Archive, Check, Ellipsis, Flag, Languages, UserRoundPlus } from "lucide-react";
import type { MentionStatus } from "@prisma/client";
import { assignMention, setMentionStatus, translateMentionAction } from "@/app/actions";
import type { Translation } from "@/lib/ai/engage";
import { cn } from "@/lib/utils";
import { toast } from "./feedback";
import { fill, useClientDict } from "./client-dict";
import { SolidAvatar } from "./avatar";

/** Closes a popover on outside press or Escape (and returns focus to its trigger on Escape). */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      ref.current?.querySelector<HTMLButtonElement>("[data-trigger]")?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);
  return ref;
}

const POP = "animate-pop absolute end-0 top-9 z-30 w-56 rounded-2xl bg-surface p-1 shadow-[var(--shadow-pop)] ltr:origin-top-right rtl:origin-top-left";
const ITEM = "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-start text-[13.5px] text-ink hover:bg-sunken disabled:opacity-45";
const GHOST =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[13.5px] text-muted transition-[background-color,color,transform] duration-150 ease-(--ease-out) hover:bg-sunken hover:text-ink active:scale-[0.97] disabled:opacity-45 max-md:h-10";

export type MentionActionLabels = {
  assign: string;
  assignedTo: string;
  more: string;
  translate: string;
  hideTranslation: string;
  translating: string;
  meaning: string;
  aiOff: string;
  markReviewed: string;
  reviewed: string;
  flag: string;
  flagged: string;
  archive: string;
};

/**
 * Assign and "more" menus for a mention card, plus the translation panel,
 * which opens under the card's footer row.
 */
export function MentionCardActions({
  id,
  status,
  assignee,
  members,
  canAct,
  translatable,
  cached,
  labels,
  children,
  after,
}: {
  id: string;
  status: MentionStatus;
  assignee: { id: string; name: string } | null;
  members?: { id: string; name: string }[];
  canAct?: boolean;
  translatable?: boolean;
  cached: Translation | null;
  labels: MentionActionLabels;
  /** Footer content before the menus (badges, metrics, reply link). */
  children: React.ReactNode;
  /** Footer content after the menus (open-post link). */
  after?: React.ReactNode;
}) {
  const { toasts, common } = useClientDict();
  const [pending, start] = useTransition();
  const [who, setWho] = useState(assignee);
  const [st, setSt] = useState(status);
  const [menu, setMenu] = useState<"assign" | "more" | null>(null);
  const [translation, setTranslation] = useState<Translation | null>(cached);
  const [showT, setShowT] = useState(false);
  const [tError, setTError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const close = () => setMenu(null);
  const assignRef = useDismiss(menu === "assign", close);
  const moreRef = useDismiss(menu === "more", close);

  const assign = (next: { id: string; name: string } | null) => {
    close();
    if ((next?.id ?? null) === (who?.id ?? null)) return;
    const prev = who;
    setWho(next);
    start(async () => {
      const res = await assignMention(id, next?.id ?? null);
      if (!res.ok) {
        setWho(prev);
        return toast(common.failed, "error");
      }
      toast(res.name ? fill(toasts.assigned, { name: res.name }) : toasts.unassigned);
    });
  };

  const setStatus = (s: MentionStatus) => {
    close();
    const next = s === st ? "NEW" : s;
    const prev = st;
    setSt(next);
    start(async () => {
      try {
        await setMentionStatus([id], next);
        toast(toasts[next]);
      } catch {
        setSt(prev);
        toast(common.failed, "error");
      }
    });
  };

  const translate = () => {
    close();
    if (showT) return setShowT(false);
    if (translation) return setShowT(true);
    setTranslating(true);
    start(async () => {
      const res = await translateMentionAction(id).catch(() => ({ ok: false as const }));
      setTranslating(false);
      if (res.ok && "translation" in res) {
        setTranslation(res.translation);
        setShowT(true);
        setTError(null);
      } else setTError(labels.aiOff);
    });
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {children}
        {canAct && members && (
          <div className="relative" ref={assignRef}>
            <button
              type="button"
              data-trigger
              onClick={() => setMenu(menu === "assign" ? null : "assign")}
              aria-haspopup="listbox"
              aria-expanded={menu === "assign"}
              title={who ? fill(labels.assignedTo, { name: who.name }) : labels.assign}
              className={cn(GHOST, who && "ps-1.5")}
              disabled={pending}
            >
              {who ? <SolidAvatar name={who.name} seed={who.id} size={20} /> : <UserRoundPlus className="h-[15px] w-[15px]" strokeWidth={1.7} />}
              <span className="max-w-28 truncate">{who ? who.name.replace(/\s*\(.*\)$/, "") : labels.assign}</span>
            </button>
            {menu === "assign" && (
              <div role="listbox" aria-label={labels.assign} className={POP}>
                {[null, ...members].map((m) => (
                  <button
                    key={m?.id ?? "none"}
                    type="button"
                    role="option"
                    aria-selected={(m?.id ?? null) === (who?.id ?? null)}
                    onClick={() => assign(m)}
                    className={ITEM}
                  >
                    <span className={cn("min-w-0 flex-1 truncate", !m && "text-muted")}>{m ? m.name : common.unassigned}</span>
                    {(m?.id ?? null) === (who?.id ?? null) && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!canAct && who && (
          <span className="inline-flex h-8 items-center gap-1.5 ps-1.5 pe-2.5 text-[13.5px] text-muted" title={fill(labels.assignedTo, { name: who.name })}>
            <SolidAvatar name={who.name} seed={who.id} size={20} />
            <span className="max-w-28 truncate">{who.name}</span>
          </span>
        )}
        {(canAct || translatable) && (
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              data-trigger
              onClick={() => setMenu(menu === "more" ? null : "more")}
              aria-haspopup="menu"
              aria-expanded={menu === "more"}
              aria-label={labels.more}
              title={labels.more}
              className={cn(GHOST, "w-8 justify-center px-0 max-md:w-10", (st === "FLAGGED" || pending) && "text-sand-700")}
            >
              <Ellipsis className="h-4 w-4" />
            </button>
            {menu === "more" && (
              <div role="menu" aria-label={labels.more} className={POP}>
                {translatable && (
                  <button type="button" role="menuitem" onClick={translate} className={ITEM} disabled={pending}>
                    <Languages className="h-4 w-4 text-muted" strokeWidth={1.7} /> {showT ? labels.hideTranslation : labels.translate}
                  </button>
                )}
                {canAct && (
                  <>
                    <button type="button" role="menuitemcheckbox" aria-checked={st === "REVIEWED"} onClick={() => setStatus("REVIEWED")} className={ITEM}>
                      <Check className={cn("h-4 w-4", st === "REVIEWED" ? "text-pos" : "text-muted")} strokeWidth={1.7} />
                      <span className="flex-1">{st === "REVIEWED" ? labels.reviewed : labels.markReviewed}</span>
                    </button>
                    <button type="button" role="menuitemcheckbox" aria-checked={st === "FLAGGED"} onClick={() => setStatus("FLAGGED")} className={ITEM}>
                      <Flag className={cn("h-4 w-4", st === "FLAGGED" ? "fill-current text-sand-700" : "text-muted")} strokeWidth={1.7} />
                      <span className="flex-1">{st === "FLAGGED" ? labels.flagged : labels.flag}</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => setStatus("ARCHIVED")} className={ITEM}>
                      <Archive className="h-4 w-4 text-muted" strokeWidth={1.7} /> {labels.archive}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {after}
      </div>
      {translating && (
        <p className="mt-2 text-[13px] text-muted" aria-live="polite">
          {labels.translating}
        </p>
      )}
      {tError && <p className="mt-2 text-[13px] text-sand-700">{tError}</p>}
      {showT && translation && (
        <div className="mt-3 rounded-xl bg-panel px-4 py-3 text-[13px]" dir="ltr">
          <p className="leading-relaxed text-ink">{translation.text}</p>
          <p className="mt-1 text-xs text-faint">
            {translation.dialect} · {translation.tone}
          </p>
          {translation.notes.length > 0 && (
            <div className="mt-2.5 border-t border-line pt-2.5">
              <p className="mb-1 text-xs font-medium text-muted">{labels.meaning}</p>
              <ul className="space-y-1 text-xs text-ink/80">
                {translation.notes.map((n) => (
                  <li key={n.term}>
                    <b dir="auto">{n.term}</b>: {n.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
