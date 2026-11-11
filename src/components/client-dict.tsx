"use client";

import { createContext, useContext } from "react";
import type { Dict } from "@/lib/i18n/en";

type ClientDict = { locale: "ar" | "en"; toasts: Dict["toasts"]; common: Dict["common"] };

const Ctx = createContext<ClientDict | null>(null);

/** Small slice of the dictionary for client components (toasts, common words). */
export function ClientDictProvider({ value, children }: { value: ClientDict; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClientDict() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ClientDictProvider missing");
  return v;
}

export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
