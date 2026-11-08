export type Tristate = "yes" | "no" | "unknown";

/** What IBP knows about a model. Never assumed from "OpenAI-compatible": metadata or a probe. */
export interface ModelInfo {
  id: string;
  contextWindow: number | null;
  tools: Tristate;
  streaming: Tristate;
  /** null = the provider does not say. */
  free: boolean | null;
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments, exactly as the model produced them (may be invalid JSON). */
  arguments: string;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export type ChatChunk =
  | { type: "text"; text: string }
  | ({ type: "tool_call" } & ToolCall)
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "finish"; reason: string };

export type ProviderErrorCode =
  "auth" | "rate_limited" | "unavailable" | "bad_request" | "not_found" | "network" | "aborted";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderHealth {
  latencyMs: number;
  models: ModelInfo[];
}

/** One model service (OpenRouter, Ollama, …). Implementations hold their own credentials. */
export interface ModelProvider {
  readonly id: string;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  chat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  checkHealth(signal?: AbortSignal): Promise<ProviderHealth>;
}
