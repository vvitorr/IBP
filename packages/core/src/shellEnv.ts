import { execFile } from "node:child_process";

let cached: Promise<NodeJS.ProcessEnv> | undefined;
const MARKER = "__IBP_PATH__";

/**
 * Apps started from the macOS Dock or Finder get a minimal PATH without Homebrew, nvm or Volta,
 * so `npm` would not be found. Ask the user's login shell for its PATH once, the same way
 * VS Code resolves its shell environment. Falls back to the current environment.
 */
export function resolveShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === "win32") return Promise.resolve(process.env);
  cached ??= new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/zsh";
    execFile(
      shell,
      ["-ilc", `printf '%s' "${MARKER}$PATH${MARKER}"`],
      { timeout: 10_000, env: process.env },
      (error, stdout) => {
        const match = !error && new RegExp(`${MARKER}(.*)${MARKER}`).exec(stdout);
        resolve(match && match[1] ? { ...process.env, PATH: match[1] } : process.env);
      },
    );
  });
  return cached;
}
