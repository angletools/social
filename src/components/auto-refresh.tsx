"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page periodically while `active` (e.g. waiting for a job). */
export function AutoRefresh({ active, every = 5000, maxMs = 180_000 }: { active: boolean; every?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > maxMs) return clearInterval(id);
      router.refresh();
    }, every);
    return () => clearInterval(id);
  }, [active, every, maxMs, router]);
  return null;
}
