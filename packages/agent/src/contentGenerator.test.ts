import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOpenAICompatibleProvider } from "@ibp/model-router";
import { CONTENT_COPY, startFakeOpenAIServer, type FakeServer } from "@ibp/model-router/testing";
import { siteContentSchema, type SiteContent } from "@ibp/shared";
import { applyCopy, ContentGenerator, extractJson, generatedCopySchema } from "./contentGenerator";
import type { AgentEvent } from "./IbpAgent";
import { Workspace } from "./workspace";

const base: SiteContent = siteContentSchema.parse({
  version: 1,
  theme: "slate",
  business: {
    name: "Tasca",
    client: "",
    tagline: "x",
    description: "",
    phone: "+351 1",
    email: "a@b.pt",
    address: "Rua",
    hours: [],
  },
  pages: [
    {
      slug: "",
      title: "Tasca",
      sections: [
        {
          id: "inicio",
          type: "hero",
          title: "t",
          text: "t",
          cta: { label: "c", href: "#contactos" },
        },
        { id: "sobre", type: "about", title: "t", text: "t" },
        { id: "servicos", type: "services", title: "t", items: [], navLabel: "t" },
        { id: "contactos", type: "contact", title: "Contactos" },
      ],
    },
    {
      slug: "menu",
      title: "Menu",
      sections: [{ id: "menu", type: "menu", title: "Menu", groups: [] }],
    },
  ],
});

let root: string;
let server: FakeServer;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-gen-"));
  await mkdir(join(root, "src", "content"), { recursive: true });
  await writeFile(join(root, "src", "content", "site.json"), JSON.stringify(base));
  server = await startFakeOpenAIServer();
});
afterEach(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

const generator = (model: string) => {
  const provider = createOpenAICompatibleProvider({ id: "p", baseUrl: server.baseUrl });
  return new ContentGenerator((messages, signal) => provider.chat({ model, messages }, signal));
};
const io = (events: AgentEvent[]) => ({
  emit: (e: AgentEvent) => void events.push(e),
  approve: async () => false,
});
const details = {
  name: "Tasca",
  client: "",
  industry: "restaurant" as const,
  description: "Petiscos no Porto",
};

describe("ContentGenerator", () => {
  it("extracts JSON from prose and fences", () => {
    expect(extractJson('Aqui:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("sem json")).toThrow();
  });

  it("only changes copy and theme, never contacts or other pages", () => {
    const next = applyCopy(base, generatedCopySchema.parse(CONTENT_COPY));
    expect(next.theme).toBe("terracotta");
    expect(next.business).toMatchObject({
      phone: "+351 1",
      email: "a@b.pt",
      address: "Rua",
      tagline: CONTENT_COPY.tagline,
    });
    expect(next.pages[0]?.sections[0]).toMatchObject({
      title: CONTENT_COPY.hero.title,
      cta: { label: "Reservar mesa", href: "#contactos" },
    });
    expect(next.pages[1]).toEqual(base.pages[1]);
  });

  it("writes site.json through the journal so the change can be reviewed and reverted", async () => {
    const workspace = await Workspace.open(root);
    const events: AgentEvent[] = [];
    await generator("fake/content").run(
      { workspace, details, language: "pt-PT" },
      io(events),
      new AbortController().signal,
    );
    const written = siteContentSchema.parse(
      JSON.parse(await readFile(join(root, "src/content/site.json"), "utf8")),
    );
    expect(written.pages[0]?.sections[1]).toMatchObject({ title: "A nossa casa" });
    expect(events.find((e) => e.type === "changes")).toMatchObject({
      changes: [{ path: "src/content/site.json", kind: "modified" }],
    });
    const prompt =
      (server.requests.at(-1)?.body?.messages as { content: string }[])[0]?.content ?? "";
    expect(prompt).toContain("Do NOT invent prices");
    expect(prompt).toContain("Petiscos no Porto");
    await workspace.revert();
    expect(JSON.parse(await readFile(join(root, "src/content/site.json"), "utf8"))).toEqual(base);
  });

  it("retries once when the reply is not valid", async () => {
    const workspace = await Workspace.open(root);
    await generator("fake/content-retry").run(
      { workspace, details, language: "pt-PT" },
      io([]),
      new AbortController().signal,
    );
    expect(server.requests.filter((r) => r.path.endsWith("/chat/completions"))).toHaveLength(2);
    expect(JSON.parse(await readFile(join(root, "src/content/site.json"), "utf8")).theme).toBe(
      "terracotta",
    );
  });
});
