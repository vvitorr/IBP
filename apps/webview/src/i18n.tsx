import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@ibp/shared";

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function useT(): Translate {
  const locale = useContext(LocaleContext);
  return (key, params) => translate(locale, key, params);
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
