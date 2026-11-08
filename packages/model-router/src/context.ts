import type { ChatMessage } from "./types";

// shortcut: ~4 characters per token is a rough average for English/Portuguese; switch to a real
// tokenizer per model family if trimming proves too loose or too strict.
const approxTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * Keeps system messages plus the most recent messages that fit in ~75% of the context window
 * (leaving room for the answer). Unknown window: keep the last 20 messages.
 */
export function fitToContext(messages: ChatMessage[], contextWindow: number | null): ChatMessage[] {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (contextWindow === null) return [...system, ...rest.slice(-20)];

  let budget =
    Math.floor(contextWindow * 0.75) - system.reduce((n, m) => n + approxTokens(m.content), 0);
  const kept: ChatMessage[] = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const message = rest[i];
    if (!message) continue;
    budget -= approxTokens(message.content);
    if (budget < 0 && kept.length > 0) break;
    kept.unshift(message);
  }
  return [...system, ...kept];
}
