export const THEME_COOKIE = "rasd_theme";
export type Theme = "light" | "dark" | "system";
export const parseTheme = (v?: string): Theme => (v === "light" || v === "dark" ? v : "system");
