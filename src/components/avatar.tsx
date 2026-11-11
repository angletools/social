import { cn } from "@/lib/utils";

const TONES = [
  ["#e8f1ec", "#0e5c46"],
  ["#f2e9dc", "#8a6424"],
  ["#e6eef6", "#1f4f7a"],
  ["#f3e6ea", "#8a2f4a"],
  ["#ece8f4", "#4b3a7a"],
  ["#e9efe3", "#46602a"],
  ["#f4e9e3", "#8a4426"],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Initials avatar with a stable, muted colour per person. */
export function Avatar({ name, seed, size = 32, className }: { name: string; seed?: string; size?: number; className?: string }) {
  const clean = name.replace(/[@|·].*$/, "").trim() || name;
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
  const [, fg] = TONES[hash(seed ?? name) % TONES.length];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        // Tinted from the tone so it reads in light and dark themes.
        background: `color-mix(in oklab, ${fg} 15%, var(--color-surface))`,
        color: `color-mix(in oklab, ${fg} var(--avatar-ink), var(--color-ink))`,
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </span>
  );
}

const VIVID = ["#e8590c", "#1c7ed6", "#9c0fe8", "#3b7a12", "#0b8a8a", "#c2255c", "#5f3dc4", "#5a5a5a"];

/** Solid rounded-square avatar with white initials (inbox and conversation headers). */
export function SolidAvatar({ name, seed, size = 36, className }: { name: string; seed?: string; size?: number; className?: string }) {
  const clean = name.replace(/[@|·].*$/, "").trim() || name;
  const first = [...clean][0] ?? "?";
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center font-semibold text-white", className)}
      style={{ width: size, height: size, borderRadius: size >= 40 ? 12 : 10, background: VIVID[hash(seed ?? name) % VIVID.length], fontSize: size * 0.39 }}
    >
      {first.toUpperCase()}
    </span>
  );
}
