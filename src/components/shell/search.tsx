"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** Global search: jumps to Mentions with the query. "/" focuses it. */
export function GlobalSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        return;
      }
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative w-full max-w-[320px]"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (q) router.push(`/mentions?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858585]" strokeWidth={1.7} />
      <input
        ref={ref}
        type="search"
        placeholder={placeholder}
        className="h-[38px] w-full rounded-[11px] border-0 bg-[#141414] ps-9 pe-12 text-[14px] text-ellipsis text-[#ececec] outline-none placeholder:text-[#858585] focus:ring-2 focus:ring-white/15"
      />
      <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 font-sans text-[12.5px] text-[#6b6b6b] sm:block"><span dir="ltr">⌘K</span></kbd>
    </form>
  );
}
