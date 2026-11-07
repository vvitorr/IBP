// Bundles the Electron main + preload scripts (all dependencies inlined) and copies the Studio UI
// and the site templates into dist/, so the packaged app needs no node_modules.
import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
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
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: [join(root, "src", "main.ts")],
  outfile: join(dist, "main.js"),
});
await build({
  ...common,
  entryPoints: [join(root, "src", "preload.ts")],
  outfile: join(dist, "preload.js"),
});

await copy(join(root, "..", "webview", "dist"), join(dist, "renderer")); // build apps/webview first
await cp(join(root, "static", "index.html"), join(dist, "renderer", "index.html"));
await copy(join(root, "..", "..", "templates"), join(dist, "templates"));
