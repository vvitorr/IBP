import type { Workspace } from "./workspace";

const TREE_LINES = 200;
const NOISE =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|next-env\.d\.ts)$|\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|mp4)$/;

/**
 * What the model gets up front: stack, dependency names, a trimmed file tree and where texts
 * and design tokens live. File contents are read on demand through tools, never all at once.
 */
export async function projectSummary(workspace: Workspace, stack: string): Promise<string> {
  const files = (await workspace.list()).filter((f) => !NOISE.test(f));
  const pkg = await workspace
    .read("package.json")
    .then(
      (raw) =>
        JSON.parse(raw) as { name?: string; dependencies?: object; devDependencies?: object },
    )
    .catch(() => null);
  const deps = [
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
  ];

  const notes: string[] = [];
  if (files.includes("src/content/site.ts"))
    notes.push("Website texts and contacts: src/content/site.ts");
  if (files.includes("src/index.css"))
    notes.push("Colours and fonts (Tailwind @theme tokens): src/index.css");
  if (files.some((f) => f.startsWith("src/components/")))
    notes.push("Sections and components: src/components/");
  if (files.includes("src/app/page.tsx")) notes.push("Next.js App Router page: src/app/page.tsx");
  if (files.includes("src/App.tsx"))
    notes.push("Vite app entry composing the sections: src/App.tsx");

  return [
    `Stack: ${stack}`,
    pkg?.name ? `Package: ${pkg.name}` : "",
    deps.length ? `Dependencies: ${deps.join(", ")}` : "",
    ...notes,
    `Files (${files.length}${files.length > TREE_LINES ? `, first ${TREE_LINES}` : ""}):`,
    ...files.slice(0, TREE_LINES),
  ]
    .filter(Boolean)
    .join("\n");
}
