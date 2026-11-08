import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPLY, startFakeOpenAIServer, type FakeServer } from "@ibp/model-router/testing";
import type {
  AiState,
  ChatState,
  HostMessage,
  ResponseMessage,
  SecureStorageStatus,
} from "@ibp/shared";
import type { HostPlatform } from "../HostPlatform";
import { JsonProjectStore } from "../projects/JsonProjectStore";
import { ProjectService } from "../projects/ProjectService";
import { StudioController } from "../StudioController";
import type { SecretVault } from "./AiService";

const KEY = "sk-or-v1-TEST-KEY-must-never-leak";

let root: string;
let server: FakeServer;
let posted: HostMessage[];
let logs: string[];
let vault: Map<string, string>;
let storage: SecureStorageStatus;
let confirmAnswer: boolean;
let controller: StudioController;

function memoryVault(): SecretVault {
  return {
    get: async (k) => vault.get(k),
    set: async (k, v) => void vault.set(k, v),
    delete: async (k) => void vault.delete(k),
    status: async () => storage,
  };
}

function host(): HostPlatform {
  return {
    kind: "desktop",
    capabilities: { terminal: false },
    dataDir: join(root, "data"),
    secrets: memoryVault(),
    post: (m) => void posted.push(structuredClone(m)),
    log: (_level, m) => void logs.push(m),
    readSettings: () => ({ language: "pt-PT", mode: "developer", theme: "dark" }),
    updateSetting: async () => {},
    projectsRoot: () => root,
    pickFolder: async () => undefined,
    confirm: async () => confirmAnswer,
    notify: () => {},
    currentProjectPath: () => undefined,
    openProject: async () => {},
    openCode: async () => {},
    openTerminal: async () => {},
    openExternal: async () => {},
  };
}

function build(): StudioController {
  return new StudioController({
    host: host(),
    service: new ProjectService({
      store: new JsonProjectStore(join(root, "projects.json")),
      templatesRoot: join(__dirname, "..", "..", "..", "..", "templates"),
      git: async () => ({ ok: true, stdout: "", stderr: "" }),
    }),
    runner: { spawn: () => ({ onOutput: () => {}, onExit: () => {}, kill: async () => {} }) },
    env: async () => ({}),
  });
}

let counter = 0;
async function send(message: Record<string, unknown>): Promise<ResponseMessage> {
  const requestId = `t${++counter}`;
  await controller.receive({ ...message, requestId });
  const response = posted.find(
    (m): m is ResponseMessage => m.type === "response" && m.requestId === requestId,
  );
  if (!response) throw new Error("no response");
  return response;
}

const ai = (): AiState => {
  const last = posted.filter((m) => m.type === "ai/state").at(-1);
  if (!last || last.type !== "ai/state") throw new Error("no ai state");
  return last.ai;
};
const chat = (): ChatState => {
  const last = posted.filter((m) => m.type === "chat/state").at(-1);
  if (!last || last.type !== "chat/state") throw new Error("no chat state");
  return last.chat;
};
async function until(check: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function customProvider(apiKey = KEY): Promise<string> {
  await send({ type: "ai/provider/add", preset: "custom" });
  const id = ai().providers.at(-1)?.id ?? "";
  expect(
    (await send({ type: "ai/provider/update", providerId: id, baseUrl: server.baseUrl })).ok,
  ).toBe(true);
  expect((await send({ type: "ai/provider/setKey", providerId: id, key: apiKey })).ok).toBe(true);
  return id;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-ai-"));
  server = await startFakeOpenAIServer({ apiKey: KEY });
  posted = [];
  logs = [];
  vault = new Map();
  storage = "os";
  confirmAnswer = true;
  controller = build();
  await controller.receive({ type: "ready" });
});

afterEach(async () => {
  await controller.dispose();
  await server.close();
  await rm(root, { recursive: true, force: true });
});

describe("AI providers", () => {
  it("stores the key only in the vault and never posts or logs it", async () => {
    const id = await customProvider();
    expect(vault.get(`ibp.ai.key.${id}`)).toBe(KEY);
    expect(ai().providers[0]).toMatchObject({
      hasKey: true,
      preset: "custom",
      baseUrl: server.baseUrl,
    });

    await send({ type: "ai/provider/test", providerId: id });
    await send({ type: "chat/send", text: "Olá", model: "auto", projectId: null });
    await until(() => !chat().streaming);

    expect(JSON.stringify(posted)).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
    for (const file of await readdir(join(root, "data"))) {
      expect(await readFile(join(root, "data", file), "utf8")).not.toContain(KEY);
    }
  });

  it("tests a provider, lists models and suggests free models for auto mode", async () => {
    const id = await customProvider();
    expect((await send({ type: "ai/provider/test", providerId: id })).ok).toBe(true);
    const provider = ai().providers[0];
    expect(provider?.health.status).toBe("ok");
    expect(provider?.models.map((m) => m.id)).toContain("fake/fast");
    expect(ai().preferences.map((p) => p.modelId)).not.toContain("fake/paid");
    expect(ai().preferences).toHaveLength(3);
  });

  it("explains a wrong key and an unreachable server", async () => {
    const id = await customProvider("wrong");
    const bad = await send({ type: "ai/provider/test", providerId: id });
    expect(bad).toMatchObject({ ok: false, error: { code: "ai_auth" } });
    expect(ai().providers[0]?.health.status).toBe("error");

    await send({ type: "ai/provider/update", providerId: id, baseUrl: "http://127.0.0.1:9/v1" });
    expect(await send({ type: "ai/provider/test", providerId: id })).toMatchObject({
      ok: false,
      error: { code: "ai_unavailable" },
    });
  });

  it("rejects insecure addresses and refuses keys without secure storage", async () => {
    await send({ type: "ai/provider/add", preset: "custom" });
    const id = ai().providers[0]?.id;
    expect(
      await send({ type: "ai/provider/update", providerId: id, baseUrl: "http://example.com/v1" }),
    ).toMatchObject({
      ok: false,
      error: { code: "ai_invalid_url" },
    });

    storage = "unavailable";
    await controller.dispose();
    controller = build();
    await controller.receive({ type: "ready" });
    expect(await send({ type: "ai/provider/setKey", providerId: id, key: KEY })).toMatchObject({
      ok: false,
      error: { code: "secret_storage_unavailable" },
    });
    expect(vault.size).toBe(0);
  });

  it("asks before removing a provider and deletes its key", async () => {
    const id = await customProvider();
    confirmAnswer = false;
    expect(await send({ type: "ai/provider/remove", providerId: id })).toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(vault.size).toBe(1);
    confirmAnswer = true;
    expect((await send({ type: "ai/provider/remove", providerId: id })).ok).toBe(true);
    expect(vault.size).toBe(0);
    expect(ai().providers).toEqual([]);
  });

  it("probes a model's real capabilities", async () => {
    const id = await customProvider();
    await send({ type: "ai/provider/test", providerId: id });
    expect((await send({ type: "ai/model/probe", providerId: id, modelId: "fake/fast" })).ok).toBe(
      true,
    );
    expect(ai().providers[0]?.models.find((m) => m.id === "fake/fast")).toMatchObject({
      streaming: "yes",
      tools: "yes",
      probedAt: expect.any(String),
    });
  });
});

describe("chat", () => {
  it("streams an answer, records usage and falls back past a rate-limited model", async () => {
    const id = await customProvider();
    await send({ type: "ai/provider/test", providerId: id });
    await send({
      type: "ai/preferences/set",
      order: [
        { providerId: id, modelId: "fake/broken" },
        { providerId: id, modelId: "fake/fast" },
      ],
    });
    expect(
      (await send({ type: "chat/send", text: "Olá", model: "auto", projectId: null })).ok,
    ).toBe(true);
    await until(() => !chat().streaming);

    const answer = chat().messages.at(-1);
    expect(answer).toMatchObject({
      role: "assistant",
      content: REPLY,
      model: { providerId: id, modelId: "fake/fast" },
    });
    expect(answer?.error).toBeUndefined();
    const deltas = posted.flatMap((m) => (m.type === "chat/delta" ? [m.text] : [])).join("");
    expect(deltas).toBe(REPLY);
    expect(ai().usageToday).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelId: "fake/broken", requests: 1, errors: 1 }),
        expect.objectContaining({ modelId: "fake/fast", requests: 1, errors: 0, promptTokens: 12 }),
      ]),
    );
    // The system prompt is in the configured language and says the assistant cannot edit files.
    const sent = server.requests.find((r) => r.body?.model === "fake/fast")?.body?.messages as {
      role: string;
      content: string;
    }[];
    expect(sent[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("português"),
    });
  });

  it("reports when no model is configured", async () => {
    await send({ type: "chat/send", text: "Olá", model: "auto", projectId: null });
    await until(() => !chat().streaming);
    expect(chat().messages.at(-1)?.error?.code).toBe("ai_no_model");
  });

  it("stops mid-answer without an error and refuses a second message meanwhile", async () => {
    const id = await customProvider();
    await send({ type: "ai/provider/test", providerId: id });
    await send({
      type: "chat/send",
      text: "Olá",
      model: { providerId: id, modelId: "fake/slow" },
      projectId: null,
    });
    expect(
      await send({ type: "chat/send", text: "outra", model: "auto", projectId: null }),
    ).toMatchObject({
      ok: false,
      error: { code: "ai_busy" },
    });
    await until(() => posted.some((m) => m.type === "chat/delta"));
    await send({ type: "chat/stop" });
    await until(() => !chat().streaming);
    const answer = chat().messages.at(-1);
    expect(answer?.error).toBeUndefined();
    expect(answer?.content.length).toBeGreaterThan(0);
    expect(answer?.content.length).toBeLessThan(REPLY.length);
  });
});
