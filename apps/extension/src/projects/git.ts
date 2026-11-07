import { execFile } from "node:child_process";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: readonly string[], cwd: string) => Promise<GitResult>;

/** Runs git with an argument array and no shell, so values can never be interpreted as commands. */
export const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        timeout: 30_000,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        resolve({ ok: !error, stdout, stderr: stderr || (error?.message ?? "") });
      },
    );
  });
