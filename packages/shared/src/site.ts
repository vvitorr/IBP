/**
 * Website content model (Phase 4). Every generated site keeps its texts, pages, sections and
 * theme in `src/content/site.json`, validated by this schema before IBP writes it. The site's own
 * TypeScript types live in the template (`src/content/types.ts`) and must match this shape.
 */
import { z } from "zod";

export const SITE_CONTENT_VERSION = 1;
export const SITE_CONTENT_FILE = "src/content/site.json";

/** Curated themes (palette + type pairing). Their values live in the template's themes.ts. */
export const THEME_IDS = [
  "terracotta",
  "espresso",
  "graphite",
  "workshop",
  "concrete",
  "clinic",
  "boutique",
  "slate",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

const text = (max: number) => z.string().max(max);
const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
/** Local images live in public/images; remote ones must be https. No data: or javascript: URLs. */
export const imageSrcSchema = z
  .string()
  .max(500)
  .regex(/^(\/images\/[a-zA-Z0-9._-]+|https:\/\/[^\s"'<>]+)$/);
const image = z.strictObject({ src: imageSrcSchema, alt: text(200) });
const link = z.strictObject({
  label: text(60),
  // Internal paths, in-page anchors, tel:, mailto: or https:.
  href: z
    .string()
    .max(500)
    .regex(/^(\/[a-z0-9/#-]*|#[a-z0-9-]+|tel:[+0-9 ]+|mailto:[^\s"'<>]+|https:\/\/[^\s"'<>]+)$/),
});

const base = { id, hidden: z.boolean().optional(), navLabel: text(40).optional() };

export const sectionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("hero"),
    eyebrow: text(80).optional(),
    title: text(120),
    text: text(400),
    cta: link.optional(),
    image: image.optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("about"),
    title: text(120),
    text: text(2000),
    image: image.optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("services"),
    title: text(120),
    intro: text(400).optional(),
    items: z.array(z.strictObject({ title: text(80), text: text(400) })).max(12),
  }),
  z.strictObject({
    ...base,
    type: z.literal("menu"),
    title: text(120),
    intro: text(400).optional(),
    groups: z
      .array(
        z.strictObject({
          title: text(80),
          items: z
            .array(
              z.strictObject({
                name: text(80),
                description: text(200).optional(),
                price: text(20).optional(),
              }),
            )
            .max(40),
        }),
      )
      .max(12),
  }),
  z.strictObject({ ...base, type: z.literal("hours"), title: text(120) }),
  z.strictObject({
    ...base,
    type: z.literal("testimonials"),
    title: text(120),
    items: z.array(z.strictObject({ quote: text(400), author: text(80) })).max(12),
  }),
  z.strictObject({
    ...base,
    type: z.literal("gallery"),
    title: text(120),
    images: z.array(image).max(24),
  }),
  z.strictObject({
    ...base,
    type: z.literal("contact"),
    title: text(120),
    text: text(400).optional(),
  }),
]);
export type SiteSection = z.infer<typeof sectionSchema>;
export type SectionType = SiteSection["type"];
export const SECTION_TYPES = [
  "hero",
  "about",
  "services",
  "menu",
  "hours",
  "testimonials",
  "gallery",
  "contact",
] as const;

export const pageSchema = z.strictObject({
  /** "" is the home page; others become /<slug>. */
  slug: z.union([z.literal(""), z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)]),
  title: text(80),
  navLabel: text(40).optional(),
  description: text(300).optional(),
  sections: z.array(sectionSchema).max(20),
});
export type SitePage = z.infer<typeof pageSchema>;

export const siteContentSchema = z
  .strictObject({
    version: z.literal(SITE_CONTENT_VERSION),
    theme: z.enum(THEME_IDS),
    business: z.strictObject({
      name: text(80).min(1),
      client: text(80),
      tagline: text(160),
      description: text(600),
      phone: text(40),
      email: text(120),
      address: text(200),
      hours: z.array(z.strictObject({ days: text(60), time: text(60) })).max(10),
    }),
    pages: z.array(pageSchema).min(1).max(12),
  })
  .superRefine((site, ctx) => {
    if (site.pages[0]?.slug !== "")
      ctx.addIssue({ code: "custom", message: 'the first page must be the home page (slug "")' });
    const slugs = site.pages.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: "custom", message: "page slugs must be unique" });
    for (const page of site.pages) {
      const ids = page.sections.map((s) => s.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          message: `section ids must be unique on page "${page.slug}"`,
        });
    }
  });
export type SiteContent = z.infer<typeof siteContentSchema>;
