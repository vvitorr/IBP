import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PreviewState } from "@ibp/shared";
import { DevServerManager } from "./devServer";
import { nodeProcessRunner, type ProcessRunner } from "./process";

// Stands in for `npm`: `install` prints and exits with FAKE_INSTALL_EXIT; `run dev ... --port N`
// serves HTTP on N unless FAKE_MODE=crash.
const FAKE_NPM = `
const args = process.argv.slice(2);
if (args[0] === "install") {
  console.log("added 3 packages");
  process.exit(Number(process.env.FAKE_INSTALL_EXIT ?? 0));
}
if (process.env.FAKE_MODE === "crash") {
  console.error("Error: Cannot find module 'vite'");
  process.exit(1);
}
const port = Number(args[args.indexOf("--port") + 1]);
require("node:http").createServer((_, res) => res.end("ok")).listen(port, "127.0.0.1", () => {
  console.log("\\u001b[32mready\\u001b[39m on " + port);
});
`;

let root: string;
let project: string;
let script: string;
let states: PreviewState[];
let manager: DevServerManager;
let env: NodeJS.ProcessEnv;

const runner: ProcessRunner = {
  spawn: (_command, args, options) =>
    nodeProcessRunner.spawn(process.execPath, [script, ...args], options),
};

async function waitFor(check: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error(`timed out; state: ${JSON.stringify(manager.state())}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function portIsClosed(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(true));
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-dev-"));
  project = join(root, "site");
  await mkdir(join(project, "node_modules"), { recursive: true });
  script = join(root, "fake-npm.cjs");
  await writeFile(script, FAKE_NPM);
  states = [];
  env = { ...process.env };
  manager = new DevServerManager({
    runner,
    env: async () => env,
    onChange: (state) => states.push(state),
    readyTimeoutMs: 3000,
    pollIntervalMs: 20,
  });
});

afterEach(async () => {
  await manager.stop();
  await rm(root, { recursive: true, force: true });
});

const target = (stack = "vite-react-ts-tailwind") => ({
  id: "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d",
  path: project,
  stack,
});

describe("DevServerManager", () => {
  it("starts on a loopback port, reports running, and frees the port on stop", async () => {
    await manager.start(target());
    expect(manager.state().status).toBe("starting");
    await waitFor(() => manager.state().status === "running");

    const { url, log } = manager.state();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(await (await fetch(url ?? "")).text()).toBe("ok");
    await waitFor(() => manager.state().log.some((l) => l.startsWith("ready on")));
    expect(log.join("\n")).not.toContain("\u001b"); // escape codes stripped

    const port = Number(new URL(url ?? "").port);
    await manager.stop();
    expect(manager.state()).toMatchObject({ status: "stopped", url: null });
    expect(await portIsClosed(port)).toBe(true);
  });

  it("uses the Next.js flags for Next projects", async () => {
    await manager.start(target("next-app-ts-tailwind"));
    await waitFor(() => manager.state().status === "running");
  });

  it("refuses to start without dependencies or for unknown stacks", async () => {
    await rm(join(project, "node_modules"), { recursive: true });
    await expect(manager.start(target())).rejects.toMatchObject({ code: "deps_missing" });
    await expect(manager.start(target("gatsby"))).rejects.toMatchObject({
      code: "preview_unsupported",
    });
  });

  it("reports a crash with the last log lines", async () => {
    env = { ...env, FAKE_MODE: "crash" };
    await manager.start(target());
    await waitFor(() => manager.state().status === "error");
    expect(manager.state().error?.code).toBe("preview_failed");
    expect(manager.state().error?.detail).toContain("Cannot find module 'vite'");
  });

  it("installs dependencies and reports failures", async () => {
    await manager.install(target());
    await waitFor(
      () => manager.state().status === "stopped" && states.some((s) => s.status === "installing"),
    );
    expect(manager.state().log).toContain("added 3 packages");

    env = { ...env, FAKE_INSTALL_EXIT: "1" };
    await manager.install(target());
    await waitFor(() => manager.state().status === "error");
    expect(manager.state().error?.code).toBe("install_failed");
  });

  it("reports a missing npm as command_not_found", async () => {
    const missing = new DevServerManager({
      runner: nodeProcessRunner,
      npm: join(root, "no-such-npm"),
      env: async () => env,
      onChange: () => {},
    });
    await missing.install(target());
    await waitFor(() => missing.state().status === "error");
    expect(missing.state().error?.code).toBe("command_not_found");
  });
});
