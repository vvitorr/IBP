import { useEffect } from "react";
import { PageView } from "./components/PageView";
import { findPage, site } from "./content/site";
import { THEMES, themeVars } from "./content/themes";

// Each page of site.json is served at /<slug>; unknown paths show the home page.
const slug = window.location.pathname.replace(/^\/+|\/+$/g, "");
const page = findPage(slug) ?? site.pages[0];

export function App() {
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(themeVars(site.theme)))
      root.style.setProperty(name, value);
    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    fonts.href = THEMES[site.theme].fontsHref;
    document.head.append(fonts);
    document.title =
      page && page.slug ? `${page.title} · ${site.business.name}` : site.business.name;
  }, []);

  return page ? <PageView page={page} /> : null;
}
