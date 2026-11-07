import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HostMessage, ResponseMessage, Settings, StateMessage } from "@ibp/shared";
import type { HostPlatform } from "./HostPlatform";
import type { ProcessRunner } from "./process";
import { JsonProjectStore } from "./projects/JsonProjectStore";
import { ProjectService } from "./projects/ProjectService";
import { StudioController } from "./StudioController";

const templatesRoot = join(__dirname, "..", "..", "..", "templates");
const details = { name: "Café Central", client: "Ana", industry: "cafe", description: "" };

let root: string;
let posted: HostMessage[];
let spawned: string[][];
let confirmAnswer: boolean;
let picked: string | undefined;
let opened: string[];
let controller: StudioController;

function fakeHost(): HostPlatform {
  const settings: Settings = { language: "en", mode: "beginner", theme: "dark" };
  return {
    kind: "desktop",
    capabilities: { terminal: false },
    post: (message) => void posted.push(message),
    log: () => {},
    readSettings: () => settings,
    updateSetting: async (update) => void Object.assign(settings, { [update.key]: update.value }),
    projectsRoot: () => root,
    pickFolder: async () => picked,
    confirm: async () => confirmAnswer,
    notify: () => {},
    currentProjectPath: () => undefined,
    openProject: async (p) => void opened.push(`project:${p.id}`),
    openCode: async (p) => void opened.push(`code:${p.id}`),
    openTerminal: async () => {
      throw new Error("not available");
    },
    openExternal: async (url) => void opened.push(`url:${url}`),
  };
}

const runner: ProcessRunner = {
  spawn: (_command, args) => {
    spawned.push([...args]);
    return { onOutput: () => {}, onExit: () => {}, kill: async () => {} };
  },
};

async function send(message: object): Promise<ResponseMessage> {
  const before = posted.length;
  await controller.receive(message);
  const response = posted.slice(before).find((m): m is ResponseMessage => m.type === "response");
  if (!response) throw new Error("no response");
  return response;
}

const lastState = () => posted.filter((m): m is StateMessage => m.type === "state").at(-1);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-studio-"));
  await mkdir(join(root, "sites"));
  posted = [];
  spawned = [];
  opened = [];
  confirmAnswer = true;
  picked = join(root, "sites");
  const service = new ProjectService({
    store: new JsonProjectStore(join(root, "projects.json")),
    templatesRoot,
    git: async () => ({ ok: true, stdout: "", stderr: "" }),
  });
  controller = new StudioController({ host: fakeHost(), service, runner, env: async () => ({}) });
});

afterEach(async () => {
  await controller.dispose();
  await rm(root, { recursive: true, force: true });
});

describe("StudioController", () => {
  it("answers ready with the full state", async () => {
    await controller.receive({ type: "ready" });
    expect(lastState()).toMatchObject({
      host: "desktop",
      capabilities: { terminal: false },
      projects: [],
      preview: { status: "stopped", projectId: null },
    });
  });

  it("rejects invalid messages without acting on them", async () => {
    const response = await send({
      type: "projects/create",
      requestId: "1",
      details,
      template: "wordpress",
    });
    expect(response).toMatchObject({ ok: false, error: { code: "invalid_message" } });
    expect(posted.filter((m) => m.type === "state")).toEqual([]);
  });

  it("creates a project in the picked folder and lists it", async () => {
    const response = await send({
      type: "projects/create",
      requestId: "1",
      details,
      template: "base-next",
    });
    expect(response.ok).toBe(true);
    expect(lastState()?.projects).toHaveLength(1);
    expect(lastState()?.projects[0]).toMatchObject({
      name: "Café Central",
      stack: "next-app-ts-tailwind",
    });
  });

  it("reports a cancelled folder picker as cancelled", async () => {
    picked = undefined;
    const response = await send({
      type: "projects/create",
      requestId: "1",
      details,
      template: "base-vite-react",
    });
    expect(response).toMatchObject({ ok: false, error: { code: "cancelled" } });
  });

  it("asks before installing dependencies and runs nothing when declined", async () => {
    const created = await send({
      type: "projects/create",
      requestId: "1",
      details,
      template: "base-vite-react",
    });
    const id = created.ok ? created.projectId : undefined;

    confirmAnswer = false;
    expect(await send({ type: "projects/installDeps", requestId: "2", id })).toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(spawned).toEqual([]);

    confirmAnswer = true;
    expect((await send({ type: "projects/installDeps", requestId: "3", id })).ok).toBe(true);
    expect(spawned).toEqual([["install", "--no-audit", "--no-fund"]]);
    expect(lastState()?.preview).toMatchObject({ projectId: id, status: "installing" });
  });

  it("refreshes the project list when an install finishes", async () => {
    let exit: ((code: number | null) => void) | undefined;
    const installer: ProcessRunner = {
      spawn: () => ({ onOutput: () => {}, onExit: (l) => void (exit = l), kill: async () => {} }),
    };
    await controller.dispose();
    const service = new ProjectService({
      store: new JsonProjectStore(join(root, "projects2.json")),
      templatesRoot,
      git: async () => ({ ok: true, stdout: "", stderr: "" }),
    });
    controller = new StudioController({
      host: fakeHost(),
      service,
      runner: installer,
      env: async () => ({}),
    });
    const created = await send({
      type: "projects/create",
      requestId: "1",
      details,
      template: "base-vite-react",
    });
    const id = created.ok ? created.projectId : undefined;
    await send({ type: "projects/installDeps", requestId: "2", id });
    expect(lastState()?.projects[0]?.dependenciesInstalled).toBe(false);

    const project = lastState()?.projects[0];
    await mkdir(join(project?.path ?? "", "node_modules"));
    exit?.(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(lastState()?.preview.status).toBe("stopped");
    expect(lastState()?.projects[0]?.dependenciesInstalled).toBe(true);
  });

  it("explains why a preview cannot start yet", async () => {
    const created = await send({
      type: "projects/create",
      requestId: "1",
      details,
      template: "base-vite-react",
    });
    const id = created.ok ? created.projectId : undefined;
    expect(await send({ type: "preview/start", requestId: "2", id })).toMatchObject({
      ok: false,
      error: { code: "deps_missing" },
    });
  });

  it("respects host capabilities and never opens a URL that is not running", async () => {
    const created = await send({
      type: "projects/create",
      requestId: "1",
      details,
      template: "base-vite-react",
    });
    const id = created.ok ? created.projectId : undefined;
    expect((await send({ type: "projects/openTerminal", requestId: "2", id })).ok).toBe(false);
    await send({ type: "preview/openExternal", requestId: "3" });
    expect(opened).toEqual([]);

    await send({ type: "projects/open", requestId: "4", id });
    expect(opened).toEqual([`project:${id}`]);
  });

  it("applies allow-listed settings", async () => {
    await send({
      type: "settings/update",
      requestId: "1",
      update: { key: "language", value: "pt-PT" },
    });
    expect(lastState()?.settings.language).toBe("pt-PT");
  });
});
