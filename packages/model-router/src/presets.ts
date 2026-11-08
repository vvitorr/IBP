import type { ProviderPreset } from "@ibp/shared";

export interface PresetDefinition {
  id: ProviderPreset;
  name: string;
  /** Empty for "custom": the user must enter one. */
  baseUrl: string;
  keyRequired: boolean;
}

// Base URLs verified against each project's docs on 2026-11-07/08 (docs/research/dependencies.md).
export const PRESETS: Record<ProviderPreset, PresetDefinition> = {
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyRequired: true,
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    keyRequired: false,
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    keyRequired: false,
  },
  freellmapi: {
    id: "freellmapi",
    name: "FreeLLMAPI",
    baseUrl: "http://localhost:3001/v1",
    keyRequired: true,
  },
  custom: { id: "custom", name: "Custom", baseUrl: "", keyRequired: false },
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Accepts https:// anywhere and http:// only on this machine, so keys are never sent in clear
 * text over the network. Returns the normalised URL (no trailing slash) or null.
 */
export function normalizeBaseUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const secure =
    url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
  if (!secure || url.username || url.password || url.search || url.hash) return null;
  return url.toString().replace(/\/+$/, "");
}
