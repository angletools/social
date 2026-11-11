import type { Platform } from "@prisma/client";
import { cn } from "@/lib/utils";

const STYLE: Record<Platform, { bg: string; label: string }> = {
  X: { bg: "bg-black text-white", label: "𝕏" },
  INSTAGRAM: { bg: "bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 text-white", label: "IG" },
  TIKTOK: { bg: "bg-[#111] text-[#25F4EE]", label: "TT" },
  YOUTUBE: { bg: "bg-[#FF0033] text-white", label: "▶" },
  FACEBOOK: { bg: "bg-[#1877F2] text-white", label: "f" },
  LINKEDIN: { bg: "bg-[#0A66C2] text-white", label: "in" },
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  X: "#111827",
  INSTAGRAM: "#E1306C",
  TIKTOK: "#25C2C9",
  YOUTUBE: "#FF0033",
  FACEBOOK: "#1877F2",
  LINKEDIN: "#0A66C2",
};

export function PlatformIcon({ platform, size = "md", title }: { platform: Platform; size?: "sm" | "md" | "lg"; title?: string }) {
  const s = STYLE[platform];
  return (
    <span
      title={title}
      aria-label={title ?? platform}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-bold leading-none",
        s.bg,
        size === "sm" && "h-5 w-5 rounded-md text-[10px]",
        size === "md" && "h-7 w-7 text-xs",
        size === "lg" && "h-10 w-10 rounded-xl text-sm",
      )}
    >
      {s.label}
    </span>
  );
}
