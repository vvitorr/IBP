import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fitToContext } from "./context";
import { createOpenAICompatibleProvider, toModelInfo } from "./openaiCompatible";
import { normalizeBaseUrl } from "./presets";
import { probeModel } from "./probe";
import { ModelRouter, RouteError, type Candidate, type RoutedChunk } from "./router";
import { readSse } from "./sse";
import { REPLY, startFakeOpenAIServer, type FakeServer } from "./testing/fakeOpenAIServer";
import { ProviderError, type ChatChunk, type ModelInfo } from "./types";

const KEY = "sk-test-SECRET-123";

async function* bytes(...parts: string[]) {
  for (const part of parts) yield new TextEncoder().encode(part);
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

const textOf = (chunks: (ChatChunk | RoutedChunk)[]) =>
  chunks.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");

describe("readSse", () => {
  it("handles comments, split chunks, multi-line data and CRLF", async () => {
    const events = await collect(
      readSse(
        bytes(
          ": keep-alive\n\n",
          'data: {"a":',
          "1}\n\n",
          "data: one\r\ndata: two\r\n\r\n",
          "data: [DONE]",
        ),
      ),
    );
    expect(events).toEqual(['{"a":1}', "one\ntwo", "[DONE]"]);
  });
});

describe("normalizeBaseUrl", () => {
  it("allows https anywhere and http only on loopback", () => {
    expect(normalizeBaseUrl("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
    expect(normalizeBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:3001/v1")).toBe("http://127.0.0.1:3001/v1");
    for (const bad of [
      "http://example.com/v1",
      "ftp://x",
      "https://u:p@x.com",
      "https://x.com/v1?k=1",
      "nonsense",
    ]) {
      expect(normalizeBaseUrl(bad)).toBeNull();
    }
  });
});

describe("toModelInfo", () => {
  it("reads OpenRouter metadata and leaves the rest unknown", () => {
    expect(
      toModelInfo({
        id: "a",
        context_length: 8000,
        supported_parameters: ["tools"],
        pricing: { prompt: "0", completion: "0" },
      }),
    ).toEqual({
      id: "a",
      contextWindow: 8000,
      tools: "yes",
      streaming: "unknown",
      free: true,
    });
    expect(toModelInfo({ id: "llama3.2" })).toEqual({
      id: "llama3.2",
      contextWindow: null,
      tools: "unknown",
      streaming: "unknown",
      free: null,
    });
    expect(toModelInfo({ id: "x/y:free" })?.free).toBe(true);
    expect(toModelInfo({})).toBeNull();
  });
});

describe("OpenAI-compatible provider", () => {
  let server: FakeServer;
  beforeEach(async () => {
    server = await startFakeOpenAIServer({ apiKey: KEY });
  });
  afterEach(() => server.close());

  const provider = (apiKey: string | undefined = KEY) =>
    createOpenAICompatibleProvider({ id: "p", baseUrl: server.baseUrl, apiKey });

  it("lists models with capabilities and sends the key only as a bearer header", async () => {
    const health = await provider().checkHealth();
    expect(health.models.map((m) => m.id)).toContain("fake/fast");
    expect(health.models.find((m) => m.id === "fake/paid")?.free).toBe(false);
    expect(server.requests[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.stringify(server.requests[0]?.body ?? {})).not.toContain(KEY);
  });

  it("streams text, finish and usage", async () => {
    const chunks = await collect(
      provider().chat({ model: "fake/fast", messages: [{ role: "user", content: "olá" }] }),
    );
    expect(textOf(chunks)).toBe(REPLY);
    expect(chunks).toContainEqual({ type: "finish", reason: "stop" });
    expect(chunks).toContainEqual({
      type: "usage",
      promptTokens: 12,
      completionTokens: expect.any(Number),
    });
    expect(server.requests.at(-1)?.body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it("maps HTTP errors and never leaks the key in messages", async () => {
    await expect(
      collect(provider("wrong-key").chat({ model: "fake/fast", messages: [] })),
    ).rejects.toMatchObject({ code: "auth", status: 401 });
    const limited = collect(provider().chat({ model: "fake/limited", messages: [] }));
    await expect(limited).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 2000 });
    const broken = await collect(provider().chat({ model: "fake/broken", messages: [] })).catch(
      (e: ProviderError) => e,
    );
    expect(broken).toMatchObject({ code: "unavailable", status: 500 });
    expect(String((broken as Error).message)).not.toContain(KEY);
  });

  it("reports unreachable servers as network errors and honours abort", async () => {
    const offline = createOpenAICompatibleProvider({ id: "x", baseUrl: "http://127.0.0.1:9/v1" });
    await expect(offline.listModels()).rejects.toMatchObject({ code: "network" });

    const controller = new AbortController();
    const received: string[] = [];
    const run = (async () => {
      for await (const chunk of provider().chat(
        { model: "fake/slow", messages: [] },
        controller.signal,
      )) {
        if (chunk.type === "text") {
          received.push(chunk.text);
          controller.abort();
        }
      }
    })();
    await expect(run).rejects.toMatchObject({ code: "aborted" });
    expect(received).toHaveLength(1);
  });

  it("probes streaming and tool support", async () => {
    expect(await probeModel(provider(), "fake/fast")).toEqual({ streaming: "yes", tools: "yes" });
  });
});

describe("ModelRouter", () => {
  let server: FakeServer;
  let clock: number;
  beforeEach(async () => {
    server = await startFakeOpenAIServer();
    clock = 1_000_000;
  });
  afterEach(() => server.close());

  const info = (id: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({
    id,
    contextWindow: 32_000,
    tools: "unknown",
    streaming: "unknown",
    free: true,
    ...extra,
  });
  const candidates = (...ids: [string, string][]): Candidate[] =>
    ids.map(([providerId, modelId]) => ({
      providerId,
      provider: createOpenAICompatibleProvider({ id: providerId, baseUrl: server.baseUrl }),
      model: info(modelId),
    }));
  const router = () => new ModelRouter(() => clock);
  const ask = { messages: [{ role: "user" as const, content: "olá" }] };

  it("falls back past a rate-limited provider and remembers the cooldown", async () => {
    const r = router();
    const chunks = await collect(
      r.stream(candidates(["a", "fake/limited"], ["b", "fake/fast"]), "chat", ask),
    );
    expect(textOf(chunks)).toBe(REPLY);
    expect(chunks.filter((c) => c.type === "route")).toEqual([
      { type: "route", providerId: "a", modelId: "fake/limited" },
      { type: "route", providerId: "b", modelId: "fake/fast" },
    ]);
    expect(r.providerCooldown("a")).toBe(clock + 2000);

    const before = server.requests.length;
    await collect(r.stream(candidates(["a", "fake/fast"], ["b", "fake/fast"]), "chat", ask));
    expect(server.requests.length - before).toBe(1); // provider "a" skipped while paused
    clock += 2001;
    expect(r.providerCooldown("a")).toBeNull();
  });

  it("does not retry the same model and reports all failures", async () => {
    const error = await collect(
      router().stream(candidates(["a", "fake/broken"], ["b", "fake/limited"]), "chat", ask),
    ).catch((e) => e);
    expect(error).toBeInstanceOf(RouteError);
    expect(error.code).toBe("all_failed");
    expect(error.attempts.map((a: { error?: ProviderError }) => a.error?.code)).toEqual([
      "unavailable",
      "rate_limited",
    ]);
    expect(server.requests.filter((r) => r.path.endsWith("/chat/completions"))).toHaveLength(2);
  });

  it("stops instead of switching models after the answer started", async () => {
    const error = await collect(
      router().stream(candidates(["a", "fake/midway"], ["b", "fake/fast"]), "chat", ask),
    ).catch((e) => e);
    expect(error).toMatchObject({ code: "interrupted" });
    expect(server.requests.filter((r) => r.body?.model === "fake/fast")).toHaveLength(0);
  });

  it("filters by task requirements and reports no_model", async () => {
    const r = router();
    const [base] = candidates(["a", "fake/fast"]);
    if (!base) throw new Error("no candidate");
    expect(r.eligible([base], "component")).toEqual([]); // tools unknown: not good enough for agent work
    expect(
      r.eligible([{ ...base, model: info("fake/fast", { tools: "yes" }) }], "component"),
    ).toHaveLength(1);
    expect(r.eligible([{ ...base, model: info("tiny", { contextWindow: 2048 }) }], "chat")).toEqual(
      [],
    );
    await expect(collect(r.stream([], "chat", ask))).rejects.toMatchObject({ code: "no_model" });
  });
});

describe("fitToContext", () => {
  const m = (role: "system" | "user" | "assistant", chars: number) => ({
    role,
    content: "x".repeat(chars),
  });

  it("keeps the system prompt and the newest messages that fit", () => {
    const messages = [m("system", 400), m("user", 4000), m("assistant", 4000), m("user", 400)];
    const fitted = fitToContext(messages, 2000); // 1500 tokens ≈ 6000 chars budget
    expect(fitted.map((x) => x.content.length)).toEqual([400, 4000, 400]);
    expect(
      fitToContext(
        Array.from({ length: 30 }, () => m("user", 1)),
        null,
      ),
    ).toHaveLength(20);
  });
});
