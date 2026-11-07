import type { Metadata } from "next";
import type { ReactNode } from "react";
import { site } from "@/content/site";
import "../index.css";

export const metadata: Metadata = {
  title: site.name,
  description: site.description || site.hero.subtitle,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
