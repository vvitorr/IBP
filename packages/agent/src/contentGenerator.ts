import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChatMessage, RoutedChunk } from "@ibp/model-router";
import {
  SITE_CONTENT_FILE,
  siteContentSchema,
  THEME_IDS,
  type Locale,
  type ProjectDetails,
  type SiteContent,
} from "@ibp/shared";
import type { AgentIO } from "./IbpAgent";
import type { Workspace } from "./workspace";

/** Streams one model answer without tools (routing is the caller's business). */
export type TextStream = (
  messages: ChatMessage[],
  signal: AbortSignal,
) => AsyncIterable<RoutedChunk>;

const s = (max: number) => z.string().trim().min(1).max(max);

/** What the model may write: marketing copy and a theme. Never contacts, prices or reviews. */
export const generatedCopySchema = z.object({
  theme: z.enum(THEME_IDS),
  tagline: s(160),
  hero: z.object({
    eyebrow: z.string().trim().max(80).optional(),
    title: s(120),
    text: s(400),
    cta: s(40),
  }),
  about: z.object({ title: s(120), text: s(1200) }),
  services: z.object({
    title: s(120),
    intro: z.string().trim().max(400).optional(),
    items: z
      .array(z.object({ title: s(80), text: s(300) }))
      .min(2)
      .max(6),
  }),
});
export type GeneratedCopy = z.infer<typeof generatedCopySchema>;

const LANGUAGE: Record<Locale, string> = {
  "pt-PT": "European Portuguese (pt-PT, not Brazilian)",
  en: "English",
};

function prompt(details: ProjectDetails, language: Locale): string {
  return `You write the website copy for a small business. Reply with ONE JSON object and nothing else, with exactly this shape:
{"theme": one of ${JSON.stringify(THEME_IDS)},
 "tagline": string (one short sentence),
 "hero": {"eyebrow": string (2-3 words, optional), "title": string (max ~10 words), "text": string (1-2 sentences), "cta": string (2-3 words)},
 "about": {"title": string, "text": string (2 short paragraphs separated by \\n\\n)},
 "services": {"title": string, "intro": string (optional), "items": [{"title": string, "text": string}] (3 to 5 items)}}

Rules:
- Write in ${LANGUAGE[language]}, clear and concrete, no clichés, no exaggerated claims.
- Use only what the description says or what is generic for this kind of business. Do NOT invent prices, phone numbers, addresses, awards, years of experience, certifications or customer reviews.
- Pick the theme that best fits the business: terracotta (restaurants), espresso (cafés), graphite (professional services), workshop (car repair), concrete (construction), clinic (health), boutique (shops), slate (anything else).

Business:
- Name: ${details.name}
- Client/company: ${details.client || "(not given)"}
- Industry: ${details.industry}
- Description: ${details.description || "(no description: write sensible generic copy for this industry)"}`;
}

/** Finds the JSON object in a reply that may include prose or a ```json fence. */
export function extractJson(reply: string): unknown {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in the reply");
  return JSON.parse(reply.slice(start, end + 1));
}

/** Puts the generated copy into the existing content; everything else stays as it was. */
export function applyCopy(content: SiteContent, copy: GeneratedCopy): SiteContent {
  const [home, ...rest] = content.pages;
  if (!home) return content;
  let hero = false;
  let about = false;
  let services = false;
  const sections = home.sections.map((section) => {
    if (section.type === "hero" && !hero) {
      hero = true;
      return {
        ...section,
        title: copy.hero.title,
        text: copy.hero.text,
        ...(copy.hero.eyebrow ? { eyebrow: copy.hero.eyebrow } : {}),
        ...(section.cta ? { cta: { ...section.cta, label: copy.hero.cta } } : {}),
      };
    }
    if (section.type === "about" && !about) {
      about = true;
      return { ...section, title: copy.about.title, text: copy.about.text };
    }
    if (section.type === "services" && !services) {
      services = true;
      return {
        ...section,
        title: copy.services.title,
        ...(copy.services.intro ? { intro: copy.services.intro } : {}),
        items: copy.services.items,
        ...(section.navLabel ? { navLabel: copy.services.title.slice(0, 40) } : {}),
      };
    }
    return section;
  });
  return siteContentSchema.parse({
    ...content,
    theme: copy.theme,
    business: { ...content.business, tagline: copy.tagline },
    pages: [{ ...home, sections }, ...rest],
  });
}

/**
 * Writes the site's copy from the business description. The model only returns JSON, which is
 * validated (one retry with the error) and merged into site.json through the journaled
 * workspace, so the user reviews and accepts or reverts it like any agent change.
 */
export class ContentGenerator {
  constructor(private readonly model: TextStream) {}

  async run(
    task: { workspace: Workspace; details: ProjectDetails; language: Locale },
    io: AgentIO,
    signal: AbortSignal,
  ): Promise<{ summary: string; stoppedAtLimit: boolean }> {
    const step = { id: randomUUID(), tool: "generate_content" as const, target: SITE_CONTENT_FILE };
    io.emit({ type: "step", step: { ...step, status: "running" } });
    const current = siteContentSchema.parse(
      JSON.parse(await task.workspace.read(SITE_CONTENT_FILE)),
    );

    const messages: ChatMessage[] = [
      { role: "user", content: prompt(task.details, task.language) },
    ];
    let lastError = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      let reply = "";
      for await (const chunk of this.model(messages, signal)) {
        if (chunk.type === "text") reply += chunk.text;
        else if (chunk.type === "route") io.emit(chunk);
      }
      try {
        const copy = generatedCopySchema.parse(extractJson(reply));
        await task.workspace.write(
          SITE_CONTENT_FILE,
          `${JSON.stringify(applyCopy(current, copy), null, 2)}\n`,
        );
        io.emit({ type: "step", step: { ...step, status: "done" } });
        io.emit({ type: "changes", changes: await task.workspace.changes() });
        return { summary: copy.tagline, stoppedAtLimit: false };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        messages.push(
          { role: "assistant", content: reply },
          {
            role: "user",
            content: `That was not valid (${lastError.slice(0, 500)}). Reply with only the JSON object.`,
          },
        );
      }
    }
    io.emit({
      type: "step",
      step: { ...step, status: "failed", detail: lastError.slice(0, 2000) },
    });
    throw new Error(`the model did not return valid content: ${lastError}`);
  }
}
