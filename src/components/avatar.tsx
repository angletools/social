import { cn } from "@/lib/utils";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Initials avatar: the same solid rounded square everywhere, so people look alike across the app. */
export function Avatar({ name, seed, size = 32, className }: { name: string; seed?: string; size?: number; className?: string }) {
  return <SolidAvatar name={name} seed={seed} size={size} className={className} />;
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
      style={{ width: size, height: size, borderRadius: size >= 40 ? 12 : size >= 30 ? 9 : 7, background: VIVID[hash(seed ?? name) % VIVID.length], fontSize: size * 0.39 }}
    >
      {first.toUpperCase()}
    </span>
  );
}
