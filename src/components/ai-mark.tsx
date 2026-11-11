import { cn } from "@/lib/utils";

/** Quiet "AI" marker used instead of sparkle icons. */
export function AiMark({ size = "sm", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-sand-50 font-semibold tracking-wide text-sand-700 ring-1 ring-sand-100",
        size === "sm" && "h-5 px-1.5 text-[10.5px]",
        size === "md" && "h-7 w-7 text-[11px]",
        size === "lg" && "h-11 w-11 rounded-xl text-[13px]",
        className,
      )}
    >
      AI
    </span>
  );
}
