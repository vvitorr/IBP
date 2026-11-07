// Bundles the extension host (and, with --tests, the integration tests) and copies the Studio UI
// and the site templates into dist/.
import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const templatesSrc = join(root, "..", "..", "templates");
const webviewSrc = join(root, "..", "webview", "dist");
const skipped = new Set(["node_modules", "dist", ".next"]);
const copy = async (from, to) => {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, {
    recursive: true,
    filter: (source) =>
      !relative(from, source)
        .split(sep)
        .some((part) => skipped.has(part)),
  });
};

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: [join(root, "src", "extension.ts")],
  outfile: join(root, "dist", "extension.js"),
});

await copy(templatesSrc, join(root, "dist", "templates"));
await copy(webviewSrc, join(root, "dist", "webview")); // build apps/webview first

if (process.argv.includes("--tests")) {
  await rm(join(root, "out"), { recursive: true, force: true });
  await build({
    ...common,
    entryPoints: [join(root, "test", "suite", "extension.test.ts")],
    outdir: join(root, "out", "test"),
  });
}
