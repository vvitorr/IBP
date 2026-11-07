import { en } from "./en.ts";
import { ptPT, type MessageKey } from "./pt-PT.ts";

export type { MessageKey } from "./pt-PT.ts";

export const LOCALES = ["pt-PT", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-PT";

export const dictionaries: Record<Locale, Record<MessageKey, string>> = { "pt-PT": ptPT, en };

/** Translates a key and replaces `{param}` placeholders. Unknown params are left as written. */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
