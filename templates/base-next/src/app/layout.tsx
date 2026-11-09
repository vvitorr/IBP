import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { site } from "@/content/site";
import { THEMES, themeVars } from "@/content/themes";
import "../index.css";

export const metadata: Metadata = {
  title: { default: site.business.name, template: `%s · ${site.business.name}` },
  description: site.business.description || site.business.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT" style={themeVars(site.theme) as CSSProperties}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The font family follows the theme chosen in site.json. */}
        <link rel="stylesheet" href={THEMES[site.theme].fontsHref} />
      </head>
      <body>{children}</body>
    </html>
  );
}
