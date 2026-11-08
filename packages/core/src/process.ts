import { spawn } from "node:child_process";

export interface RunningProcess {
  onOutput(listener: (line: string) => void): void;
  /** `error` is set when the process could not start at all (e.g. command not found). */
  onExit(listener: (code: number | null, error?: Error) => void): void;
  /** SIGTERM to the whole process group, SIGKILL after 5 s. Resolves once it has exited. */
  kill(): Promise<void>;
}

export interface ProcessRunner {
  spawn(
    command: string,
    args: readonly string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ): RunningProcess;
}

// eslint-disable-next-line no-control-regex -- matching terminal escape codes is the point
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function cleanLine(line: string): string {
  return line.replace(ANSI, "").replace(/\r/g, "").slice(0, 2000);
}

/** Starts commands without a shell (argument arrays only) in their own process group. */
export const nodeProcessRunner: ProcessRunner = {
  spawn(command, args, { cwd, env }) {
    const windows = process.platform === "win32";
    // shortcut: npm is a .cmd script on Windows and Node only starts those through a shell; the
    // arguments are fixed values, never user input. Revisit when Windows is supported (Phase 8).
    const child = spawn(command, [...args], {
      cwd,
      env,
      shell: windows,
      detached: !windows,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const outputListeners: ((line: string) => void)[] = [];
    const exitListeners: ((code: number | null, error?: Error) => void)[] = [];
    let exit: [number | null, Error | undefined] | undefined;

    for (const stream of [child.stdout, child.stderr]) {
      let pending = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        const lines = (pending + chunk).split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) for (const listener of outputListeners) listener(cleanLine(line));
      });
      stream.on("end", () => {
        if (pending) for (const listener of outputListeners) listener(cleanLine(pending));
        pending = "";
      });
    }

    const finish = (code: number | null, error?: Error) => {
      if (exit) return;
      exit = [code, error];
      for (const listener of exitListeners.splice(0)) listener(code, error);
    };
    child.on("error", (error) => finish(null, error));
    child.on("exit", (code) => finish(code));

    const signal = (name: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        if (windows)
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
        else process.kill(-child.pid, name);
      } catch {
        // already gone
      }
    };

    return {
      onOutput: (listener) => void outputListeners.push(listener),
      onExit: (listener) => {
        if (exit) listener(...exit);
        else exitListeners.push(listener);
      },
      kill: () =>
        new Promise((resolve) => {
          if (exit || child.pid === undefined) return resolve();
          const timer = setTimeout(() => signal("SIGKILL"), 5000);
          exitListeners.push(() => {
            clearTimeout(timer);
            resolve();
          });
          signal("SIGTERM");
        }),
    };
  },
};

/**
 * Runs one fixed command for the coding agent (checks, package installs) and returns its exit
 * code and the last lines of output. Killed on abort or after `timeoutMs`.
 */
export function createCommandRunner(
  runner: ProcessRunner,
  env: () => Promise<NodeJS.ProcessEnv>,
  timeoutMs = 180_000,
) {
  return async (command: string, args: string[], cwd: string, signal: AbortSignal) => {
    const proc = runner.spawn(command, args, { cwd, env: await env() });
    const lines: string[] = [];
    proc.onOutput((line) => {
      lines.push(line);
      if (lines.length > 400) lines.shift();
    });
    const stop = () => void proc.kill();
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, timeoutMs);
    const exitCode = await new Promise<number | null>((resolve) =>
      proc.onExit((code, error) => resolve(error ? null : code)),
    );
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    return { exitCode, output: lines.join("\n") };
  };
}
