import type { Platform } from "@prisma/client";
import { siFacebook, siInstagram, siTiktok, siX, siYoutube } from "simple-icons";
import { cn } from "@/lib/utils";

export const PLATFORM_COLORS: Record<Platform, string> = {
  X: "#15181b",
  INSTAGRAM: "#d6336c",
  TIKTOK: "#15181b",
  YOUTUBE: "#e5322d",
  FACEBOOK: "#1f6feb",
  LINKEDIN: "#0a66c2",
};

// LinkedIn's mark isn't in simple-icons; a neutral "in" tile is drawn instead.
const LINKEDIN_PATH =
  "M3 1h18a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Zm3.1 7.4V19h3.2V8.4H6.1Zm1.6-5.2a1.85 1.85 0 1 0 0 3.7 1.85 1.85 0 0 0 0-3.7ZM11.4 8.4V19h3.2v-5.6c0-1.5.3-2.9 2.1-2.9 1.8 0 1.8 1.7 1.8 3V19h3.2v-6.2c0-3-.7-5.3-4.2-5.3-1.7 0-2.8.9-3.2 1.8h-.1V8.4h-2.8Z";

const PATHS: Record<Platform, string> = {
  X: siX.path,
  INSTAGRAM: siInstagram.path,
  TIKTOK: siTiktok.path,
  YOUTUBE: siYoutube.path,
  FACEBOOK: siFacebook.path,
  LINKEDIN: LINKEDIN_PATH,
};

const SIZE = { xs: 12, sm: 14, md: 16, lg: 20 } as const;

/** Monochrome platform mark in the platform's colour. `tile` puts it on a soft square. */
export function PlatformIcon({
  platform,
  size = "md",
  title,
  tile,
  className,
}: {
  platform: Platform;
  size?: keyof typeof SIZE;
  title?: string;
  tile?: boolean;
  className?: string;
}) {
  const px = SIZE[size];
  const svg = (
    <svg viewBox="0 0 24 24" width={px} height={px} fill={PLATFORM_COLORS[platform]} role="img" aria-label={title ?? platform} className="shrink-0">
      {title && <title>{title}</title>}
      <path d={PATHS[platform]} />
    </svg>
  );
  if (!tile) return <span className={cn("inline-flex shrink-0", className)}>{svg}</span>;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border border-line bg-surface", className)}
      style={{ width: px + 14, height: px + 14 }}
    >
      {svg}
    </span>
  );
}
