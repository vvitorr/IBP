import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOpenAICompatibleProvider, type ChatMessage } from "@ibp/model-router";
import {
  AGENT_DONE,
  BADGE_SOURCE,
  startFakeOpenAIServer,
  type FakeServer,
} from "@ibp/model-router/testing";
import { IbpAgent, type AgentEvent, type ApprovalRequest, type ModelStream } from "./IbpAgent";
import { prepareCall, type CommandRunner } from "./tools";
import { Workspace, WorkspaceError } from "./workspace";

let root: string;
let project: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-agent-"));
  project = join(root, "site");
  outside = join(root, "outside");
  await mkdir(join(project, "src", "components"), { recursive: true });
  await mkdir(join(project, "node_modules", "react"), { recursive: true });
  await mkdir(join(project, ".git"), { recursive: true });
  await mkdir(outside);
  await writeFile(
    join(project, "package.json"),
    '{\n  "name": "site",\n  "private": true,\n  "dependencies": { "react": "19" }\n}\n',
  );
  await writeFile(
    join(project, "src", "App.tsx"),
    "export function App() {\n  return <h1>Olá</h1>;\n}\n",
  );
  await writeFile(join(project, ".env"), "SECRET=1\n");
  await writeFile(join(project, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
  await writeFile(join(outside, "x.txt"), "outside");
});

afterEach(() => rm(root, { recursive: true, force: true }));

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: unknown) => (e instanceof WorkspaceError ? e.reason : String(e)),
  );

describe("Workspace guard", () => {
  it("refuses paths outside the project, denied folders, secrets and binaries", async () => {
    const ws = await Workspace.open(project);
    await symlink(outside, join(project, "src", "link"));
    expect(await reason(ws.read("../outside/x.txt"))).toBe("outside");
    expect(await reason(ws.read("/etc/hosts"))).toBe("outside");
    expect(await reason(ws.read("src/link/x.txt"))).toBe("outside");
    expect(await reason(ws.write("src/link/new.txt", "x"))).toBe("outside");
    expect(await reason(ws.read("node_modules/react/index.js"))).toBe("denied");
    expect(await reason(ws.write(".git/config", "x"))).toBe("denied");
    expect(await reason(ws.read(".env"))).toBe("secret");
    expect(await reason(ws.read("logo.png"))).toBe("binary");
    expect(await reason(ws.write("big.txt", "x".repeat(600_000)))).toBe("too_large");
  });

  it("lists only safe project files", async () => {
    const ws = await Workspace.open(project);
    expect(await ws.list()).toEqual(["logo.png", "package.json", "src/App.tsx"]);
  });

  it("edits only when the old text is unique", async () => {
    const ws = await Workspace.open(project);
    await writeFile(join(project, "src", "twice.ts"), "a\na\n");
    expect(await reason(ws.edit("src/twice.ts", "a", "b"))).toBe("not_unique");
    expect(await reason(ws.edit("src/App.tsx", "Adeus", "x"))).toBe("no_match");
    await ws.edit("src/App.tsx", "Olá", "Olá, mundo");
    expect(await readFile(join(project, "src", "App.tsx"), "utf8")).toContain("Olá, mundo");
  });

  it("reports changes as diffs and reverts them byte for byte", async () => {
    const ws = await Workspace.open(project);
    const appBefore = await readFile(join(project, "src", "App.tsx"));
    await ws.write("src/components/Badge.tsx", BADGE_SOURCE);
    await ws.edit("src/App.tsx", "Olá", "Bem-vindo");
    await ws.edit("src/App.tsx", "Bem-vindo", "Bem-vindos"); // second touch keeps the first snapshot
    await ws.delete("package.json");

    const changes = await ws.changes();
    expect(changes.map((c) => [c.path, c.kind])).toEqual([
      ["src/components/Badge.tsx", "created"],
      ["src/App.tsx", "modified"],
      ["package.json", "deleted"],
    ]);
    expect(changes[1]).toMatchObject({ additions: 1, deletions: 1 });
    expect(changes[1]?.diff).toContain("-  return <h1>Olá</h1>;");

    await ws.revert();
    expect(await readFile(join(project, "src", "App.tsx"))).toEqual(appBefore);
    expect(
      await stat(join(project, "src", "components", "Badge.tsx")).catch(() => null),
    ).toBeNull();
    expect(await readFile(join(project, "package.json"), "utf8")).toContain('"private": true');
    expect(await ws.changes()).toEqual([]);
  });
});

describe("tool calls", () => {
  it("validates arguments and classifies risk", () => {
    expect(prepareCall("nope", "{}")).toMatchObject({
      error: expect.stringContaining("Unknown tool"),
    });
    expect(prepareCall("read_file", "{bad")).toMatchObject({
      error: expect.stringContaining("not valid JSON"),
    });
    expect(prepareCall("read_file", "{}")).toMatchObject({
      error: expect.stringContaining("Invalid arguments"),
    });
    expect(prepareCall("install_package", '{"name":"left-pad; rm -rf /"}')).toMatchObject({
      error: expect.any(String),
    });

    const risk = (name: string, args: object) => {
      const call = prepareCall(name, JSON.stringify(args));
      return "error" in call ? call.error : call.risk;
    };
    expect(risk("write_file", { path: "src/A.tsx", content: "" })).toBe("low");
    expect(risk("edit_file", { path: "package.json", old: "a", new: "b" })).toBe("high");
    expect(risk("write_file", { path: "vite.config.ts", content: "" })).toBe("high");
    expect(risk("write_file", { path: ".env.local", content: "" })).toBe("high");
    expect(risk("delete_file", { path: "src/App.tsx" })).toBe("high");
    expect(risk("install_package", { name: "@scope/pkg@1.2.3" })).toBe("high");
    expect(risk("run_check", { kind: "typecheck" })).toBe("low");
  });
});

describe("IbpAgent", () => {
  let server: FakeServer;
  beforeEach(async () => {
    server = await startFakeOpenAIServer();
  });
  afterEach(() => server.close());

  const commands: CommandRunner = async () => ({ exitCode: 0, output: "ok" });

  function modelFor(id: string): ModelStream {
    const provider = createOpenAICompatibleProvider({ id: "p", baseUrl: server.baseUrl });
    return (messages: ChatMessage[], tools, signal) =>
      provider.chat({ model: id, messages, tools }, signal);
  }

  function io(answer: boolean) {
    const events: AgentEvent[] = [];
    const approvals: ApprovalRequest[] = [];
    return {
      events,
      approvals,
      io: {
        emit: (e: AgentEvent) => void events.push(e),
        approve: async (request: ApprovalRequest) => {
          approvals.push(request);
          return answer;
        },
      },
    };
  }

  const task = {
    stack: "vite-react-ts-tailwind",
    request: "Cria um componente Badge",
    language: "pt-PT" as const,
  };

  it("creates a component in the real project and reports it", async () => {
    const run = io(true);
    const agent = new IbpAgent({ model: modelFor("fake/agent"), commands });
    const result = await agent.run(
      { ...task, workspace: await Workspace.open(project) },
      run.io,
      new AbortController().signal,
    );

    expect(await readFile(join(project, "src", "components", "Badge.tsx"), "utf8")).toBe(
      BADGE_SOURCE,
    );
    expect(result.summary).toBe(AGENT_DONE);
    expect(run.approvals).toEqual([]); // a new component is low risk
    const steps = run.events.flatMap((e) =>
      e.type === "step" ? [`${e.step.tool}:${e.step.status}`] : [],
    );
    expect(steps).toEqual([
      "list_files:running",
      "list_files:done",
      "write_file:running",
      "write_file:done",
    ]);
    const changes = run.events.filter((e) => e.type === "changes").at(-1);
    expect(changes).toMatchObject({
      changes: [{ path: "src/components/Badge.tsx", kind: "created" }],
    });

    // The system prompt carries the project summary, never secret files.
    const system = (server.requests[0]?.body?.messages as { content: string }[])[0]?.content ?? "";
    expect(system).toContain("src/App.tsx");
    expect(system).not.toContain(".env");
    expect(system).toContain("European Portuguese");
  });

  it("asks before changing configuration and leaves it untouched when refused", async () => {
    const before = await readFile(join(project, "package.json"), "utf8");
    const run = io(false);
    const agent = new IbpAgent({ model: modelFor("fake/agent-config"), commands });
    await agent.run(
      { ...task, workspace: await Workspace.open(project) },
      run.io,
      new AbortController().signal,
    );

    expect(run.approvals).toHaveLength(1);
    expect(run.approvals[0]).toMatchObject({
      tool: "edit_file",
      target: "package.json",
      preview: expect.stringContaining('+  "private": false'),
    });
    expect(await readFile(join(project, "package.json"), "utf8")).toBe(before);
    const denied = run.events.find((e) => e.type === "step" && e.step.status === "denied");
    expect(denied).toBeDefined();
    const toolResult = (
      server.requests.at(-1)?.body?.messages as { role: string; content: string }[]
    ).find((m) => m.role === "tool");
    expect(toolResult?.content).toContain("declined");
  });

  it("applies an approved configuration change", async () => {
    const run = io(true);
    await new IbpAgent({ model: modelFor("fake/agent-config"), commands }).run(
      { ...task, workspace: await Workspace.open(project) },
      run.io,
      new AbortController().signal,
    );
    expect(await readFile(join(project, "package.json"), "utf8")).toContain('"private": false');
  });

  it("stops after the turn limit", async () => {
    const run = io(true);
    const looping: ModelStream = async function* () {
      yield { type: "tool_call", id: "c", name: "list_files", arguments: "{}" };
    };
    const result = await new IbpAgent({ model: looping, commands, maxTurns: 3 }).run(
      { ...task, workspace: await Workspace.open(project) },
      run.io,
      new AbortController().signal,
    );
    expect(result).toMatchObject({ stoppedAtLimit: true, turns: 3 });
  });
});
