import { fitToContext } from "./context";
import {
  ProviderError,
  type ChatChunk,
  type ChatMessage,
  type ModelInfo,
  type ModelProvider,
  type ProviderErrorCode,
  type ToolDefinition,
} from "./types";

export const TASK_CLASSES = [
  "chat",
  "copy",
  "style",
  "component",
  "debug",
  "refactor",
  "review",
] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];

/** What each kind of task needs from a model. Tool use starts with the agent (Phase 3). */
export const TASK_REQUIREMENTS: Record<TaskClass, { tools: boolean; minContext: number }> = {
  chat: { tools: false, minContext: 4_000 },
  copy: { tools: false, minContext: 8_000 },
  style: { tools: true, minContext: 16_000 },
  component: { tools: true, minContext: 32_000 },
  debug: { tools: true, minContext: 32_000 },
  refactor: { tools: true, minContext: 64_000 },
  review: { tools: true, minContext: 32_000 },
};

export interface Candidate {
  providerId: string;
  provider: ModelProvider;
  model: ModelInfo;
}

export interface Attempt {
  providerId: string;
  modelId: string;
  error?: ProviderError;
}

export type RouteErrorCode = "no_model" | "all_failed" | "interrupted" | ProviderErrorCode;

export class RouteError extends Error {
  constructor(
    readonly code: RouteErrorCode,
    readonly attempts: Attempt[],
  ) {
    super(
      [
        code,
        ...attempts.map(
          (a) => `${a.providerId}/${a.modelId}: ${a.error?.code ?? "ok"} ${a.error?.message ?? ""}`,
        ),
      ]
        .join("\n")
        .slice(0, 4000),
    );
    this.name = "RouteError";
  }
}

export type RoutedChunk =
  | ChatChunk
  | { type: "route"; providerId: string; modelId: string }
  | { type: "attempt"; attempt: Attempt };

const SECOND = 1000;

/**
 * Tries candidates in the user's order. Before the first token, a failure puts that
 * model (or, for limits and bad keys, the whole provider) in cooldown and moves on — never
 * retrying the same model, to spare free quotas. After the first token it stops: no mixed answers.
 */
export class ModelRouter {
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Epoch ms until which a provider is paused, if it is. */
  providerCooldown(providerId: string): number | null {
    const until = this.cooldowns.get(providerId);
    return until && until > this.now() ? until : null;
  }

  clearCooldown(providerId: string): void {
    for (const key of this.cooldowns.keys()) {
      if (key === providerId || key.startsWith(`${providerId}/`)) this.cooldowns.delete(key);
    }
  }

  eligible(candidates: Candidate[], task: TaskClass): Candidate[] {
    const need = TASK_REQUIREMENTS[task];
    return candidates.filter(({ providerId, model }) => {
      if (this.providerCooldown(providerId)) return false;
      const modelUntil = this.cooldowns.get(`${providerId}/${model.id}`);
      if (modelUntil && modelUntil > this.now()) return false;
      if (need.tools && model.tools !== "yes") return false;
      if (model.streaming === "no") return false;
      return model.contextWindow === null || model.contextWindow >= need.minContext;
    });
  }

  async *stream(
    candidates: Candidate[],
    task: TaskClass,
    request: { messages: ChatMessage[]; tools?: ToolDefinition[]; maxTokens?: number },
    signal?: AbortSignal,
  ): AsyncGenerator<RoutedChunk> {
    const eligible = this.eligible(candidates, task);
    const attempts: Attempt[] = [];
    for (const candidate of eligible) {
      if (this.providerCooldown(candidate.providerId)) continue; // paused by an earlier attempt
      const { providerId, provider, model } = candidate;
      let started = false;
      yield { type: "route", providerId, modelId: model.id };
      try {
        const messages = fitToContext(request.messages, model.contextWindow);
        for await (const chunk of provider.chat(
          { ...request, messages, model: model.id },
          signal,
        )) {
          if (chunk.type === "text") started = true;
          yield chunk;
        }
        const attempt = { providerId, modelId: model.id };
        yield { type: "attempt", attempt };
        return;
      } catch (raw) {
        const error =
          raw instanceof ProviderError ? raw : new ProviderError("unavailable", String(raw));
        const attempt = { providerId, modelId: model.id, error };
        attempts.push(attempt);
        yield { type: "attempt", attempt };
        if (error.code === "aborted") throw new RouteError("aborted", attempts);
        if (started) throw new RouteError("interrupted", attempts);
        this.coolDown(providerId, model.id, error);
      }
    }
    throw new RouteError(eligible.length ? "all_failed" : "no_model", attempts);
  }

  private coolDown(providerId: string, modelId: string, error: ProviderError): void {
    const now = this.now();
    switch (error.code) {
      case "rate_limited": // limits are usually per key, so pause the provider
        this.cooldowns.set(providerId, now + (error.retryAfterMs ?? 60 * SECOND));
        break;
      case "auth": // a bad key fails for every model; cleared when the key changes
        this.cooldowns.set(providerId, now + 10 * 60 * SECOND);
        break;
      case "bad_request":
      case "not_found":
        this.cooldowns.set(`${providerId}/${modelId}`, now + 60 * SECOND);
        break;
      default:
        this.cooldowns.set(`${providerId}/${modelId}`, now + 30 * SECOND);
    }
  }
}
