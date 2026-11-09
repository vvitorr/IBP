import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BADGE_SOURCE, startFakeOpenAIServer, type FakeServer } from "@ibp/model-router/testing";
import type { ChatState, HostMessage, ProjectSummary, ResponseMessage } from "@ibp/shared";
import type { HostPlatform } from "../HostPlatform";
import { nodeProcessRunner } from "../process";
import { JsonProjectStore } from "../projects/JsonProjectStore";
import { ProjectService } from "../projects/ProjectService";
import { StudioController } from "../StudioController";

const templatesRoot = join(__dirname, "..", "..", "..", "..", "templates");
const previousGlobal = process.env.GIT_CONFIG_GLOBAL;

let root: string;
let server: FakeServer;
let posted: HostMessage[];
let controller: StudioController;
let project: ProjectSummary;
let counter = 0;

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: project.path, encoding: "utf8" });

beforeAll(async () => {
  // A throwaway global git config with an identity, so commits work on any machine.
  const config = join(tmpdir(), `ibp-gitconfig-${process.pid}`);
  await writeFile(
    config,
    "[user]\n\tname = IBP Test\n\temail = test@ibp.invalid\n[init]\n\tdefaultBranch = main\n",
  );
  process.env.GIT_CONFIG_GLOBAL = config;
});

afterAll(() => {
  if (previousGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = previousGlobal;
});

function host(): HostPlatform {
  const vault = new Map<string, string>();
  return {
    kind: "desktop",
    capabilities: { terminal: false },
    dataDir: join(root, "data"),
    secrets: {
      get: async (k) => vault.get(k),
      set: async (k, v) => void vault.set(k, v),
      delete: async (k) => void vault.delete(k),
      status: async () => "os",
    },
    post: (m) => void posted.push(structuredClone(m)),
    log: () => {},
    readSettings: () => ({ language: "pt-PT", mode: "developer", theme: "dark" }),
    updateSetting: async () => {},
    projectsRoot: () => root,
    pickFolder: async () => join(root, "sites"),
    confirm: async () => true,
    notify: () => {},
    currentProjectPath: () => undefined,
    openProject: async () => {},
    openCode: async () => {},
    openTerminal: async () => {},
    openExternal: async () => {},
  };
}

async function send(message: Record<string, unknown>): Promise<ResponseMessage> {
  const requestId = `a${++counter}`;
  await controller.receive({ ...message, requestId });
  const response = posted.find(
    (m): m is ResponseMessage => m.type === "response" && m.requestId === requestId,
  );
  if (!response) throw new Error("no response");
  return response;
}

const chat = (): ChatState => {
  const last = posted.filter((m) => m.type === "chat/state").at(-1);
  if (!last || last.type !== "chat/state") throw new Error("no chat state");
  return last.chat;
};
const answer = () => chat().messages.at(-1);

async function until(check: () => boolean, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out: ${JSON.stringify(answer()?.run)}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function useModel(modelId: string) {
  const ai = posted.filter((m) => m.type === "ai/state").at(-1);
  const providerId = ai?.type === "ai/state" ? ai.ai.providers[0]?.id : undefined;
  expect((await send({ type: "ai/preferences/set", order: [{ providerId, modelId }] })).ok).toBe(
    true,
  );
}

async function ask(text: string) {
  expect((await send({ type: "chat/send", text, model: "auto", projectId: project.id })).ok).toBe(
    true,
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-agent-ctl-"));
  await mkdir(join(root, "sites"));
  server = await startFakeOpenAIServer();
  posted = [];
  const service = new ProjectService({
    store: new JsonProjectStore(join(root, "projects.json")),
    templatesRoot,
    git: (await import("../projects/git")).runGit,
  });
  controller = new StudioController({
    host: host(),
    service,
    runner: nodeProcessRunner,
    env: async () => process.env,
  });
  await controller.receive({ type: "ready" });
  await send({
    type: "projects/create",
    details: { name: "Oficina Rui", client: "", industry: "automotive", description: "" },
    template: "base-vite-react",
  });
  project = (await service.list())[0] as ProjectSummary;

  await send({ type: "ai/provider/add", preset: "custom" });
  const ai = posted.filter((m) => m.type === "ai/state").at(-1);
  const providerId = ai?.type === "ai/state" ? ai.ai.providers[0]?.id : undefined;
  await send({ type: "ai/provider/update", providerId, baseUrl: server.baseUrl });
  expect((await send({ type: "ai/provider/test", providerId })).ok).toBe(true);
});

afterEach(async () => {
  await controller.dispose();
  await server.close();
  await rm(root, { recursive: true, force: true });
});

describe("coding agent in the Studio", () => {
  it("creates a component, then Accept commits only that file", async () => {
    await useModel("fake/agent");
    const commitsBefore = git("rev-list", "--count", "HEAD").trim();
    await ask("Cria um componente Badge");
    await until(() => !chat().streaming);

    expect(answer()?.error).toBeUndefined();
    expect(answer()?.run).toMatchObject({
      status: "done",
      changes: [{ path: "src/components/Badge.tsx", kind: "created" }],
    });
    expect(answer()?.run?.steps.map((s) => `${s.tool}:${s.status}`)).toEqual([
      "list_files:done",
      "write_file:done",
    ]);
    expect(await readFile(join(project.path, "src/components/Badge.tsx"), "utf8")).toBe(
      BADGE_SOURCE,
    );
    expect(git("status", "--porcelain")).toContain("src/components/");

    // An unrelated user change must not end up in the agent's commit.
    await writeFile(join(project.path, "NOTES.md"), "minhas notas\n");
    expect((await send({ type: "agent/accept", messageId: answer()?.id })).ok).toBe(true);
    expect(answer()?.run).toMatchObject({ status: "accepted", notice: "accepted_commit" });
    expect(git("rev-list", "--count", "HEAD").trim()).toBe(String(Number(commitsBefore) + 1));
    expect(git("show", "--name-only", "--format=%s", "HEAD").trim().split("\n")).toEqual([
      "ibp: Cria um componente Badge",
      "",
      "src/components/Badge.tsx",
    ]);
    expect(git("status", "--porcelain")).toContain("NOTES.md");
  });

  it("reverts every change of a run", async () => {
    await useModel("fake/agent");
    await ask("Cria um componente Badge");
    await until(() => !chat().streaming);
    expect((await send({ type: "agent/revert", messageId: answer()?.id })).ok).toBe(true);
    expect(answer()?.run).toMatchObject({ status: "reverted", notice: "reverted" });
    expect(await stat(join(project.path, "src/components/Badge.tsx")).catch(() => null)).toBeNull();
    expect(git("status", "--porcelain").trim()).toBe("");
    expect((await send({ type: "agent/revert", messageId: answer()?.id })).ok).toBe(false); // only once
  });

  it("waits for approval before changing configuration", async () => {
    await useModel("fake/agent-config");
    const before = await readFile(join(project.path, "package.json"), "utf8");
    await ask("Torna o pacote público");
    await until(() => answer()?.run?.approval !== null && answer()?.run?.approval !== undefined);
    const approval = answer()?.run?.approval;
    expect(approval).toMatchObject({ tool: "edit_file", target: "package.json" });
    expect(await readFile(join(project.path, "package.json"), "utf8")).toBe(before); // nothing yet

    await send({
      type: "agent/approve",
      messageId: answer()?.id,
      approvalId: approval?.id,
      approved: false,
    });
    await until(() => !chat().streaming);
    expect(await readFile(join(project.path, "package.json"), "utf8")).toBe(before);
    expect(answer()?.run?.steps.at(-1)).toMatchObject({ tool: "edit_file", status: "denied" });

    await ask("Torna o pacote público, por favor");
    await until(() => Boolean(answer()?.run?.approval));
    await send({
      type: "agent/approve",
      messageId: answer()?.id,
      approvalId: answer()?.run?.approval?.id,
      approved: true,
    });
    await until(() => !chat().streaming);
    expect(await readFile(join(project.path, "package.json"), "utf8")).toContain(
      '"private": false',
    );
  });

  it("writes the site copy from the description as a reviewable change", async () => {
    await useModel("fake/content");
    expect((await send({ type: "site/generate", id: project.id, model: "auto" })).ok).toBe(true);
    await until(() => !chat().streaming);
    expect(answer()?.run).toMatchObject({
      status: "done",
      steps: [{ tool: "generate_content", status: "done" }],
      changes: [{ path: "src/content/site.json", kind: "modified" }],
    });
    const site = JSON.parse(await readFile(join(project.path, "src/content/site.json"), "utf8"));
    expect(site.theme).toBe("terracotta");
    expect((await send({ type: "agent/accept", messageId: answer()?.id })).ok).toBe(true);
    expect(git("log", "-1", "--format=%s").trim()).toMatch(/^ibp: Escreve os textos do site/);
  });

  it("explains when no model can use tools", async () => {
    await send({ type: "ai/preferences/set", order: [] });
    await ask("Cria um componente Badge");
    await until(() => !chat().streaming);
    expect(answer()?.error?.code).toBe("ai_no_tool_model");
    expect(answer()?.run?.status).toBe("failed");
  });
});
