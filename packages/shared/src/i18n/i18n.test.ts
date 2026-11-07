import { describe, expect, it } from "vitest";
import { ERROR_MESSAGE_KEYS } from "../protocol.ts";
import { dictionaries, LOCALES, translate } from "./index.ts";

describe("i18n", () => {
  it("every locale has the same keys as pt-PT, all non-empty", () => {
    const reference = Object.keys(dictionaries["pt-PT"]).sort();
    for (const locale of LOCALES) {
      const dictionary = dictionaries[locale];
      expect(Object.keys(dictionary).sort()).toEqual(reference);
      for (const value of Object.values(dictionary)) expect(value.trim()).not.toBe("");
    }
  });

  it("uses the same placeholders in every locale", () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, text] of Object.entries(dictionaries["pt-PT"])) {
      for (const locale of LOCALES) {
        expect(placeholders(dictionaries[locale][key as keyof typeof dictionaries.en])).toEqual(
          placeholders(text),
        );
      }
    }
  });

  it("interpolates params and keeps unknown ones", () => {
    expect(translate("en", "host.terminal.project", { name: "Café" })).toBe("IBP: Café");
    expect(translate("en", "host.terminal.project")).toBe("IBP: {name}");
  });

  it("maps every error code to an existing message", () => {
    for (const key of Object.values(ERROR_MESSAGE_KEYS)) {
      expect(dictionaries["pt-PT"][key]).toBeTruthy();
    }
  });
});
