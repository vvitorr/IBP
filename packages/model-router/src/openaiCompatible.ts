import { readSse } from "./sse";
import {
  ProviderError,
  type ChatChunk,
  type ChatMessage,
  type ChatRequest,
  type ModelInfo,
  type ModelProvider,
  type ProviderErrorCode,
} from "./types";

export interface OpenAICompatibleOptions {
  id: string;
  /** e.g. https://openrouter.ai/api/v1 (no trailing slash). */
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
  /** How long to wait for the response headers; a streaming answer may take longer. */
  timeoutMs?: number;
}

function codeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 408 || status >= 500) return "unavailable";
  return "bad_request";
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

type RawModel = {
  id?: unknown;
  context_length?: unknown;
  supported_parameters?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
};

/** Reads the extra metadata some providers (OpenRouter) publish; everything else stays unknown. */
export function toModelInfo(raw: RawModel): ModelInfo | null {
  if (typeof raw.id !== "string" || !raw.id) return null;
  const params = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : null;
  const prices = raw.pricing ? [raw.pricing.prompt, raw.pricing.completion].map(Number) : null;
  return {
    id: raw.id,
    contextWindow:
      typeof raw.context_length === "number" && raw.context_length > 0 ? raw.context_length : null,
    tools: params ? (params.includes("tools") ? "yes" : "no") : "unknown",
    streaming: "unknown",
    free: prices ? prices.every((p) => p === 0) : raw.id.endsWith(":free") ? true : null,
  };
}

/** Our message shape → OpenAI Chat Completions wire format. */
export function toWireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

type WireToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

/**
 * Tool calls may arrive whole or as fragments spread over many chunks (same `index`, arguments
 * concatenated). Collects both shapes and returns the finished calls.
 */
export class ToolCallAssembler {
  private readonly calls = new Map<number, { id: string; name: string; arguments: string }>();

  add(deltas: WireToolCallDelta[]): void {
    deltas.forEach((delta, position) => {
      const index = typeof delta.index === "number" ? delta.index : position;
      const call = this.calls.get(index) ?? { id: "", name: "", arguments: "" };
      if (delta.id) call.id = delta.id;
      if (delta.function?.name) call.name = call.name || delta.function.name;
      call.arguments += delta.function?.arguments ?? "";
      this.calls.set(index, call);
    });
  }

  /** Finished calls in index order; empties the assembler. */
  take(): { id: string; name: string; arguments: string }[] {
    const done = [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.name)
      .map(([index, call]) => ({ ...call, id: call.id || `call_${index}` }));
    this.calls.clear();
    return done;
  }
}

/** A provider for any service exposing /models and /chat/completions the OpenAI way. */
export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): ModelProvider {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  const redact = (text: string) => (options.apiKey ? text.split(options.apiKey).join("***") : text);

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      ...extra,
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    };
  }

  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    // The caller's signal cancels the whole request (body included); the timeout only covers
    // waiting for the headers.
    const controller = new AbortController();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", () => controller.abort(), { once: true });
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw new ProviderError("aborted", "request cancelled");
      throw new ProviderError("network", redact(`cannot reach ${base}: ${String(error)}`));
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const body = redact((await response.text().catch(() => "")).slice(0, 2000));
      throw new ProviderError(
        codeForStatus(response.status),
        `HTTP ${response.status} from ${base}${path}${body ? `: ${body}` : ""}`,
        response.status,
        retryAfterMs(response.headers.get("retry-after")),
      );
    }
    return response;
  }

  async function listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await request("/models", { headers: headers() }, signal);
    const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
    if (!json || !Array.isArray(json.data)) {
      throw new ProviderError("bad_request", `unexpected /models response from ${base}`);
    }
    return json.data.flatMap((raw: RawModel) => toModelInfo(raw) ?? []);
  }

  async function* chat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
    const body = {
      model: req.model,
      messages: req.messages.map(toWireMessage),
      stream: true,
      stream_options: { include_usage: true },
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          }
        : {}),
    };
    const response = await request(
      "/chat/completions",
      {
        method: "POST",
        headers: headers({ "Content-Type": "application/json", Accept: "text/event-stream" }),
        body: JSON.stringify(body),
      },
      signal,
    );
    if (!response.body) throw new ProviderError("unavailable", "empty response body");

    const toolCalls = new ToolCallAssembler();
    const flush = function* (): Generator<ChatChunk> {
      for (const call of toolCalls.take()) yield { type: "tool_call", ...call };
    };
    try {
      for await (const data of readSse(response.body)) {
        if (data === "[DONE]") break;
        let event: {
          error?: { message?: string; code?: number };
          choices?: {
            delta?: { content?: string; tool_calls?: WireToolCallDelta[] };
            finish_reason?: string | null;
          }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        };
        try {
          event = JSON.parse(data);
        } catch {
          continue; // tolerate a malformed line rather than dropping the answer
        }
        if (event.error) {
          const status = typeof event.error.code === "number" ? event.error.code : 500;
          throw new ProviderError(
            codeForStatus(status),
            redact(event.error.message ?? "provider error"),
            status,
          );
        }
        const choice = event.choices?.[0];
        if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
        if (choice?.delta?.tool_calls) toolCalls.add(choice.delta.tool_calls);
        if (choice?.finish_reason) {
          yield* flush();
          yield { type: "finish", reason: choice.finish_reason };
        }
        if (event.usage) {
          yield {
            type: "usage",
            promptTokens: event.usage.prompt_tokens ?? 0,
            completionTokens: event.usage.completion_tokens ?? 0,
          };
        }
      }
      yield* flush();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (signal?.aborted) throw new ProviderError("aborted", "request cancelled");
      throw new ProviderError("network", redact(`stream from ${base} broke: ${String(error)}`));
    }
  }

  return {
    id: options.id,
    listModels,
    chat,
    async checkHealth(signal) {
      const started = Date.now();
      const models = await listModels(signal);
      return { latencyMs: Date.now() - started, models };
    },
  };
}
