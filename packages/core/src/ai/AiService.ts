import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  createOpenAICompatibleProvider,
  ModelRouter,
  normalizeBaseUrl,
  PRESETS,
  probeModel,
  ProviderError,
  RouteError,
  type Candidate,
  type ChatMessage,
  type ModelInfo,
  type ModelProvider,
  type RoutedChunk,
  type TaskClass,
} from "@ibp/model-router";
import type {
  AiState,
  ErrorCode,
  ModelRef,
  ProviderPreset,
  ProviderView,
  SecureStorageStatus,
} from "@ibp/shared";
import { IbpError, toAppError } from "../errors";
import { AiConfigStore, UNKNOWN_HEALTH, type StoredModel, type StoredProvider } from "./config";
import { UsageLog } from "./usage";

/** Where a host keeps API keys: OS keychain-backed, never a plain file. */
export interface SecretVault {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  status(): Promise<SecureStorageStatus>;
}

export interface AiServiceOptions {
  dataDir: string;
  secrets: SecretVault;
  log?: (message: string) => void;
  fetch?: typeof fetch;
  now?: () => Date;
}

const keyName = (providerId: string) => `ibp.ai.key.${providerId}`;
const SUGGESTIONS = 3;

/** Maps model-layer failures to the plain-language error codes of the protocol. */
export function toAiError(error: unknown): IbpError {
  if (error instanceof IbpError) return error;
  const code = error instanceof RouteError || error instanceof ProviderError ? error.code : null;
  const map: Record<string, ErrorCode> = {
    no_model: "ai_no_model",
    all_failed: "ai_all_failed",
    interrupted: "ai_interrupted",
    aborted: "cancelled",
    auth: "ai_auth",
    rate_limited: "ai_rate_limited",
    unavailable: "ai_unavailable",
    network: "ai_unavailable",
    bad_request: "ai_bad_request",
    not_found: "ai_bad_request",
  };
  return new IbpError(
    (code && map[code]) || "unknown",
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Provider settings, keys (through the host's SecretVault), capability tests, usage and the
 * router. Keys are read only when a request is made and are never returned to callers.
 */
export class AiService {
  readonly router = new ModelRouter();
  private readonly config: AiConfigStore;
  private readonly usage: UsageLog;
  private readonly hasKey = new Set<string>();
  private storage: SecureStorageStatus = "unavailable";
  private readonly now: () => Date;

  constructor(private readonly options: AiServiceOptions) {
    this.config = new AiConfigStore(join(options.dataDir, "ai.json"), options.log);
    this.usage = new UsageLog(join(options.dataDir, "usage.jsonl"));
    this.now = options.now ?? (() => new Date());
  }

  async load(): Promise<void> {
    await this.config.load();
    this.storage = await this.options.secrets.status();
    for (const provider of this.config.get().providers) {
      if (await this.options.secrets.get(keyName(provider.id))) this.hasKey.add(provider.id);
    }
  }

  async view(): Promise<AiState> {
    const { providers, preferences } = this.config.get();
    return {
      providers: providers.map((p): ProviderView => {
        const until = this.router.providerCooldown(p.id);
        return {
          id: p.id,
          preset: p.preset,
          name: p.name,
          baseUrl: p.baseUrl,
          enabled: p.enabled,
          keyRequired: PRESETS[p.preset].keyRequired,
          hasKey: this.hasKey.has(p.id),
          health: p.health,
          cooldownUntil: until ? new Date(until).toISOString() : null,
          models: p.models,
        };
      }),
      preferences,
      secureStorage: this.storage,
      usageToday: await this.usage.today(this.now()),
    };
  }

  async addProvider(preset: ProviderPreset): Promise<string> {
    const id = `p-${randomBytes(6).toString("hex")}`;
    const base = PRESETS[preset];
    await this.config.update((c) => {
      const same = c.providers.filter((p) => p.preset === preset).length;
      const provider: StoredProvider = {
        id,
        preset,
        name: same ? `${base.name} ${same + 1}` : base.name,
        baseUrl: base.baseUrl,
        enabled: true,
        models: [],
        health: UNKNOWN_HEALTH,
      };
      return { ...c, providers: [...c.providers, provider] };
    });
    return id;
  }

  async updateProvider(
    id: string,
    patch: { name?: string; baseUrl?: string; enabled?: boolean },
  ): Promise<void> {
    const old = this.require(id);
    let baseUrl: string | null = null;
    if (patch.baseUrl !== undefined) {
      baseUrl = normalizeBaseUrl(patch.baseUrl);
      if (!baseUrl) throw new IbpError("ai_invalid_url", patch.baseUrl);
    }
    // A new address means the old models, health and preferences no longer apply.
    const moved = baseUrl !== null && baseUrl !== old.baseUrl;
    await this.config.update((c) => ({
      ...c,
      providers: c.providers.map((p) =>
        p.id !== id
          ? p
          : {
              ...p,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
              ...(moved && baseUrl ? { baseUrl, models: [], health: UNKNOWN_HEALTH } : {}),
            },
      ),
      preferences: moved ? c.preferences.filter((ref) => ref.providerId !== id) : c.preferences,
    }));
  }

  async removeProvider(id: string): Promise<void> {
    this.require(id);
    await this.options.secrets.delete(keyName(id));
    this.hasKey.delete(id);
    this.router.clearCooldown(id);
    await this.config.update((c) => ({
      ...c,
      providers: c.providers.filter((p) => p.id !== id),
      preferences: c.preferences.filter((ref) => ref.providerId !== id),
    }));
  }

  async setKey(id: string, key: string): Promise<void> {
    this.require(id);
    if (this.storage === "unavailable") throw new IbpError("secret_storage_unavailable");
    await this.options.secrets.set(keyName(id), key);
    this.hasKey.add(id);
    this.router.clearCooldown(id);
  }

  async clearKey(id: string): Promise<void> {
    this.require(id);
    await this.options.secrets.delete(keyName(id));
    this.hasKey.delete(id);
  }

  /** Lists models (health check). On first success, suggests free/local models for auto mode. */
  async test(id: string): Promise<void> {
    const stored = this.require(id);
    const checkedAt = this.now().toISOString();
    try {
      const health = await (await this.instance(stored)).checkHealth(AbortSignal.timeout(20_000));
      await this.config.update((c) => ({
        ...c,
        providers: c.providers.map((p) =>
          p.id === id
            ? {
                ...p,
                models: mergeModels(p.models, health.models),
                health: { status: "ok", checkedAt, latencyMs: health.latencyMs },
              }
            : p,
        ),
        preferences: c.preferences.length
          ? c.preferences
          : suggest(stored.preset, id, health.models),
      }));
      this.router.clearCooldown(id);
    } catch (raw) {
      const error = toAiError(raw);
      await this.config.update((c) => ({
        ...c,
        providers: c.providers.map((p) =>
          p.id === id
            ? {
                ...p,
                health: { status: "error", checkedAt, latencyMs: null, error: toAppError(error) },
              }
            : p,
        ),
      }));
      throw error;
    }
  }

  async probe(id: string, modelId: string): Promise<void> {
    const stored = this.require(id);
    if (!stored.models.some((m) => m.id === modelId)) throw new IbpError("ai_bad_request", modelId);
    let result;
    try {
      result = await probeModel(await this.instance(stored), modelId, AbortSignal.timeout(60_000));
    } catch (raw) {
      throw toAiError(raw);
    }
    const probedAt = this.now().toISOString();
    await this.config.update((c) => ({
      ...c,
      providers: c.providers.map((p) =>
        p.id === id
          ? {
              ...p,
              models: p.models.map((m) => (m.id === modelId ? { ...m, ...result, probedAt } : m)),
            }
          : p,
      ),
    }));
  }

  async setPreferences(order: ModelRef[]): Promise<void> {
    const { providers } = this.config.get();
    for (const ref of order) {
      const provider = providers.find((p) => p.id === ref.providerId);
      if (!provider?.models.some((m) => m.id === ref.modelId))
        throw new IbpError("invalid_message", ref.modelId);
    }
    await this.config.update((c) => ({ ...c, preferences: order }));
  }

  /** Streams an answer through the router and records usage per attempt. */
  async *chat(
    task: TaskClass,
    messages: ChatMessage[],
    model: "auto" | ModelRef,
    signal?: AbortSignal,
  ): AsyncGenerator<RoutedChunk> {
    const refs = model === "auto" ? this.config.get().preferences : [model];
    const candidates: Candidate[] = [];
    const instances = new Map<string, ModelProvider>();
    for (const ref of refs) {
      const provider = this.config.get().providers.find((p) => p.id === ref.providerId);
      const info = provider?.models.find((m) => m.id === ref.modelId);
      if (!provider || !info || !provider.enabled) continue;
      if (PRESETS[provider.preset].keyRequired && !this.hasKey.has(provider.id)) continue;
      if (!instances.has(provider.id)) instances.set(provider.id, await this.instance(provider));
      candidates.push({
        providerId: provider.id,
        provider: instances.get(provider.id) as ModelProvider,
        model: toInfo(info),
      });
    }

    let started = Date.now();
    let tokens = { promptTokens: 0, completionTokens: 0 };
    for await (const chunk of this.router.stream(candidates, task, { messages }, signal)) {
      if (chunk.type === "route") {
        started = Date.now();
        tokens = { promptTokens: 0, completionTokens: 0 };
      } else if (chunk.type === "usage") {
        tokens = { promptTokens: chunk.promptTokens, completionTokens: chunk.completionTokens };
      } else if (chunk.type === "attempt") {
        const { attempt } = chunk;
        await this.usage
          .append({
            at: this.now().toISOString(),
            providerId: attempt.providerId,
            modelId: attempt.modelId,
            task,
            ok: !attempt.error,
            ...(attempt.error ? { errorCode: attempt.error.code } : {}),
            ...tokens,
            latencyMs: Date.now() - started,
          })
          .catch((error: unknown) => this.options.log?.(`usage log: ${String(error)}`));
      }
      yield chunk;
    }
  }

  private require(id: string): StoredProvider {
    const provider = this.config.get().providers.find((p) => p.id === id);
    if (!provider) throw new IbpError("invalid_message", `unknown provider ${id}`);
    return provider;
  }

  private async instance(provider: StoredProvider): Promise<ModelProvider> {
    if (!provider.baseUrl) throw new IbpError("ai_invalid_url", "no API address set");
    const apiKey = this.hasKey.has(provider.id)
      ? await this.options.secrets.get(keyName(provider.id))
      : undefined;
    return createOpenAICompatibleProvider({
      id: provider.id,
      baseUrl: provider.baseUrl,
      ...(apiKey ? { apiKey } : {}),
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }
}

const toInfo = ({ id, contextWindow, tools, streaming, free }: StoredModel): ModelInfo => ({
  id,
  contextWindow,
  tools,
  streaming,
  free,
});

/** Keeps what probes learned about models that are still listed. */
function mergeModels(previous: StoredModel[], listed: ModelInfo[]): StoredModel[] {
  return listed.map((model) => {
    const old = previous.find((m) => m.id === model.id && m.probedAt);
    return old
      ? { ...model, tools: old.tools, streaming: old.streaming, probedAt: old.probedAt }
      : { ...model, probedAt: null };
  });
}

/**
 * Starting preferences so auto mode works after the first test. Never suggests a paid model:
 * OpenRouter only free ones (tool-capable first, larger context first); local servers any.
 */
function suggest(preset: ProviderPreset, providerId: string, models: ModelInfo[]): ModelRef[] {
  const pool =
    preset === "openrouter"
      ? models
          .filter((m) => m.free === true)
          .sort(
            (a, b) =>
              Number(b.tools === "yes") - Number(a.tools === "yes") ||
              (b.contextWindow ?? 0) - (a.contextWindow ?? 0),
          )
      : models.filter((m) => m.free !== false);
  return pool.slice(0, SUGGESTIONS).map((m) => ({ providerId, modelId: m.id }));
}
