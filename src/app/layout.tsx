import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getDict } from "@/lib/i18n";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDict();
  return { title: { default: t.app.name, template: `%s · ${t.app.name}` }, description: t.app.tagline };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#000000" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getDict();
  // An explicit choice is rendered on the server (no flash); "system" is left to the CSS media query.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} dir={dir} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
