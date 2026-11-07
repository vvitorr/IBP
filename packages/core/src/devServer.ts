import { createServer } from "node:net";
import { join } from "node:path";
import { PREVIEW_LOG_LINES, type ErrorCode, type PreviewState } from "@ibp/shared";
import { IbpError } from "./errors";
import { exists } from "./fsutil";
import type { ProcessRunner, RunningProcess } from "./process";
import { devServerArgs } from "./templates";

export interface PreviewTarget {
  id: string;
  path: string;
  stack: string;
}

export interface DevServerOptions {
  runner: ProcessRunner;
  /** Environment for npm (see resolveShellEnv). */
  env: () => Promise<NodeJS.ProcessEnv>;
  onChange: (state: PreviewState) => void;
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
  /** The npm executable; tests point it at a fake. */
  npm?: string;
}

const IDLE: PreviewState = { projectId: null, status: "stopped", url: null, log: [] };

/** Asks the OS for a free loopback port. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

/**
 * Runs one project's dev server (or `npm install`) at a time and reports its state.
 * Every start/stop bumps `generation`, so callbacks from an older process are ignored.
 */
export class DevServerManager {
  private current: PreviewState = IDLE;
  private process: RunningProcess | undefined;
  private generation = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly npm: string;

  constructor(private readonly options: DevServerOptions) {
    this.npm = options.npm ?? "npm";
  }

  state(): PreviewState {
    return this.current;
  }

  async install(target: PreviewTarget): Promise<void> {
    await this.stop();
    const generation = ++this.generation;
    this.set({ projectId: target.id, status: "installing", url: null, log: [] });
    const proc = await this.spawn(target.path, ["install", "--no-audit", "--no-fund"], generation);
    proc.onExit((code, error) => {
      if (generation !== this.generation) return;
      this.process = undefined;
      if (code === 0)
        this.set({ projectId: target.id, status: "stopped", url: null, log: this.current.log });
      else this.fail(generation, error ? "command_not_found" : "install_failed", error?.message);
    });
  }

  async start(target: PreviewTarget): Promise<void> {
    if (!devServerArgs(target.stack, 0)) throw new IbpError("preview_unsupported", target.stack);
    if (!(await exists(join(target.path, "node_modules"))))
      throw new IbpError("deps_missing", target.path);
    await this.stop();
    const generation = ++this.generation;
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    this.set({ projectId: target.id, status: "starting", url: null, log: [] });
    const proc = await this.spawn(target.path, devServerArgs(target.stack, port) ?? [], generation);
    proc.onExit((code, error) => {
      if (generation !== this.generation) return;
      this.process = undefined;
      this.fail(
        generation,
        error ? "command_not_found" : "preview_failed",
        error?.message ?? `exit code ${code}`,
      );
    });
    void this.waitUntilReady(url, generation);
  }

  async stop(): Promise<void> {
    this.generation++;
    const proc = this.process;
    this.process = undefined;
    if (proc) await proc.kill();
    if (this.current.status !== "stopped" || this.current.url) {
      this.set({
        projectId: this.current.projectId,
        status: "stopped",
        url: null,
        log: this.current.log,
      });
    }
  }

  private async spawn(cwd: string, args: string[], generation: number): Promise<RunningProcess> {
    const env = await this.options.env();
    const proc = this.options.runner.spawn(this.npm, args, { cwd, env });
    this.process = proc;
    proc.onOutput((line) => {
      if (generation === this.generation) this.appendLog(line);
    });
    return proc;
  }

  private async waitUntilReady(url: string, generation: number): Promise<void> {
    const deadline = Date.now() + (this.options.readyTimeoutMs ?? 90_000);
    while (generation === this.generation && Date.now() < deadline) {
      try {
        await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "manual" });
        if (generation === this.generation) this.set({ ...this.current, status: "running", url });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, this.options.pollIntervalMs ?? 500));
      }
    }
    if (generation === this.generation)
      this.fail(generation, "preview_failed", `no response from ${url}`);
  }

  private fail(generation: number, code: ErrorCode, reason?: string): void {
    if (generation !== this.generation) return;
    const proc = this.process;
    this.process = undefined;
    void proc?.kill();
    const detail = [reason, ...this.current.log.slice(-20)].filter(Boolean).join("\n").slice(-4000);
    this.set({ ...this.current, status: "error", url: null, error: { code, detail } });
  }

  private appendLog(line: string): void {
    const log = [...this.current.log, line].slice(-PREVIEW_LOG_LINES);
    this.current = { ...this.current, log };
    // Output can be thousands of lines (npm install); report it at most every 150 ms.
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = undefined;
      this.options.onChange(this.current);
    }, 150);
  }

  private set(state: PreviewState): void {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.current = state;
    this.options.onChange(state);
  }
}
