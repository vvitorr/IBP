// Bundles the extension host (and, with --tests, the integration tests) and copies the site template.
import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const templateSrc = join(root, "..", "..", "templates", "base-vite-react");
const templateOut = join(root, "dist", "templates", "base-vite-react");
const skipped = new Set(["node_modules", "dist"]);

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

await rm(templateOut, { recursive: true, force: true });
await cp(templateSrc, templateOut, {
  recursive: true,
  filter: (source) =>
    !relative(templateSrc, source)
      .split(sep)
      .some((part) => skipped.has(part)),
});

if (process.argv.includes("--tests")) {
  await rm(join(root, "out"), { recursive: true, force: true });
  await build({
    ...common,
    entryPoints: [join(root, "test", "suite", "extension.test.ts")],
    outdir: join(root, "out", "test"),
  });
}
