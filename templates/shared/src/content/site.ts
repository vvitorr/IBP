// All website content lives in site.json, so it can be edited (by hand, by the IBP content editor
// or by the IBP assistant) without touching the layout components.
import data from "./site.json";
import type { Page, SiteContent } from "./types";

export const site = data as SiteContent;

export function findPage(slug: string): Page | undefined {
  return site.pages.find((page) => page.slug === slug);
}

/** Navigation: labelled sections of the home page, then the other pages. */
export function navigation(currentSlug: string): { label: string; href: string }[] {
  const home = site.pages[0];
  const anchors = (home?.sections ?? [])
    .filter((s) => s.navLabel && !s.hidden)
    .map((s) => ({
      label: s.navLabel as string,
      href: currentSlug === "" ? `#${s.id}` : `/#${s.id}`,
    }));
  const pages = site.pages
    .slice(1)
    .map((p) => ({ label: p.navLabel ?? p.title, href: `/${p.slug}` }));
  return [...anchors, ...pages];
}
