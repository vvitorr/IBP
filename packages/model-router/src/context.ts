import type { ChatMessage } from "./types";

// shortcut: ~4 characters per token is a rough average for English/Portuguese; switch to a real
// tokenizer per model family if trimming proves too loose or too strict.
const approxTokens = (text: string) => Math.ceil(text.length / 4);
const messageTokens = (m: ChatMessage) =>
  approxTokens(m.content) +
  (m.role === "assistant" ? approxTokens(m.toolCalls?.map((c) => c.arguments).join("") ?? "") : 0);

export const OMITTED = "[content omitted to save context; read the file again if needed]";

/**
 * Keeps system messages plus the most recent messages that fit in ~75% of the context window
 * (leaving room for the answer). Unknown window: keep the last 20 messages.
 */
export function fitToContext(messages: ChatMessage[], contextWindow: number | null): ChatMessage[] {
  if (messages.some((m) => m.role === "tool")) return compactToolResults(messages, contextWindow);
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (contextWindow === null) return [...system, ...rest.slice(-20)];

  let budget = Math.floor(contextWindow * 0.75) - system.reduce((n, m) => n + messageTokens(m), 0);
  const kept: ChatMessage[] = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const message = rest[i];
    if (!message) continue;
    budget -= messageTokens(message);
    if (budget < 0 && kept.length > 0) break;
    kept.unshift(message);
  }
  return [...system, ...kept];
}

/**
 * Agent conversations: tool results must stay paired with the assistant call that produced
 * them (dropping one half makes providers reject the request). So keep every message and
 * shorten the oldest tool results until the conversation fits; the last two stay intact.
 */
function compactToolResults(messages: ChatMessage[], contextWindow: number | null): ChatMessage[] {
  const budget = Math.floor((contextWindow ?? 32_000) * 0.75);
  let total = messages.reduce((n, m) => n + messageTokens(m), 0);
  if (total <= budget) return messages;
  const toolIndexes = messages.flatMap((m, i) => (m.role === "tool" ? [i] : [])).slice(0, -2);
  const out = [...messages];
  for (const i of toolIndexes) {
    if (total <= budget) break;
    const message = out[i];
    if (!message || message.content === OMITTED) continue;
    total -= messageTokens(message) - approxTokens(OMITTED);
    out[i] = { ...message, content: OMITTED };
  }
  return out;
}
