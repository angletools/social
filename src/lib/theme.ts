export const THEME_COOKIE = "rasd_theme";
export type Theme = "light" | "dark" | "system";
export const parseTheme = (v?: string): Theme => (v === "light" || v === "dark" ? v : "system");

/** Client-side: apply a theme choice immediately and remember it. */
export function applyTheme(v: Theme) {
  const el = document.documentElement;
  if (v === "system") delete el.dataset.theme;
  else el.dataset.theme = v;
  document.cookie = `${THEME_COOKIE}=${v}; path=/; max-age=${365 * 86400}; samesite=lax`;
  window.dispatchEvent(new CustomEvent("rasd-theme", { detail: v }));
}

/** Client-side: is dark mode showing right now (explicit or via the system)? */
export function isDarkNow() {
  const set = document.documentElement.dataset.theme;
  if (set) return set === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
export const SIDEBAR_COOKIE = "rasd_sidebar";
