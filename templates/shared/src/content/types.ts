// Shape of src/content/site.json. IBP validates the file against the same shape before writing it.

export type ThemeId =
  | "terracotta"
  | "espresso"
  | "graphite"
  | "workshop"
  | "concrete"
  | "clinic"
  | "boutique"
  | "slate";

export interface Image {
  /** /images/… (public/images) or https://… */
  src: string;
  alt: string;
}

export interface Link {
  label: string;
  href: string;
}

interface SectionBase {
  /** Stable id: page anchor and the IBP visual editor's handle. */
  id: string;
  hidden?: boolean;
  /** Shown in the navigation when set. */
  navLabel?: string;
}

export type Section = SectionBase &
  (
    | { type: "hero"; eyebrow?: string; title: string; text: string; cta?: Link; image?: Image }
    | { type: "about"; title: string; text: string; image?: Image }
    | { type: "services"; title: string; intro?: string; items: { title: string; text: string }[] }
    | {
        type: "menu";
        title: string;
        intro?: string;
        groups: {
          title: string;
          items: { name: string; description?: string; price?: string }[];
        }[];
      }
    | { type: "hours"; title: string }
    | { type: "testimonials"; title: string; items: { quote: string; author: string }[] }
    | { type: "gallery"; title: string; images: Image[] }
    | { type: "contact"; title: string; text?: string }
  );

export interface Page {
  /** "" is the home page; others are served at /<slug>. */
  slug: string;
  title: string;
  navLabel?: string;
  description?: string;
  sections: Section[];
}

export interface SiteContent {
  version: 1;
  theme: ThemeId;
  business: {
    name: string;
    client: string;
    tagline: string;
    description: string;
    phone: string;
    email: string;
    address: string;
    hours: { days: string; time: string }[];
  };
  pages: Page[];
}
