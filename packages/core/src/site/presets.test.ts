import { describe, expect, it } from "vitest";
import { INDUSTRIES, siteContentSchema } from "@ibp/shared";
import { presetContent } from "./presets";

describe("industry presets", () => {
  it("produce valid content for every industry", () => {
    for (const industry of INDUSTRIES) {
      const content = presetContent({ name: "Teste", client: "", industry, description: "" });
      expect(siteContentSchema.safeParse(content).success, industry).toBe(true);
      expect(content.pages[0]?.slug).toBe("");
    }
  });

  it("never invent prices or reviews", () => {
    for (const industry of INDUSTRIES) {
      const json = JSON.stringify(
        presetContent({ name: "T", client: "", industry, description: "" }),
      );
      expect(json).not.toMatch(/"price"|€/);
      expect(json).not.toContain('"testimonials"');
    }
  });

  it("rejects unsafe content", () => {
    const base = presetContent({ name: "T", client: "", industry: "other", description: "" });
    const withImage = (src: string) => ({
      ...base,
      pages: [
        {
          ...base.pages[0],
          sections: [{ id: "x", type: "about", title: "t", text: "t", image: { src, alt: "" } }],
        },
      ],
    });
    expect(siteContentSchema.safeParse(withImage("/images/a.jpg")).success).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "data:image/png;base64,AA",
      "/images/../x",
      "http://x.com/a.png",
    ]) {
      expect(siteContentSchema.safeParse(withImage(bad)).success, bad).toBe(false);
    }
    expect(
      siteContentSchema.safeParse({ ...base, pages: [{ ...base.pages[0], slug: "x" }] }).success,
    ).toBe(false);
  });
});
