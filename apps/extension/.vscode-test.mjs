import { existsSync } from "node:fs";
import { defineConfig } from "@vscode/test-cli";

// Prefer the VS Code already installed on this machine (no download). Override with IBP_VSCODE_PATH.
const installed =
  process.env.IBP_VSCODE_PATH ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code";

export default defineConfig({
  files: "out/test/**/*.test.js",
  ...(existsSync(installed) ? { useInstallation: { fromPath: installed } } : { version: "stable" }),
  launchArgs: ["--disable-extensions"],
  mocha: { ui: "tdd", timeout: 30_000 },
});
