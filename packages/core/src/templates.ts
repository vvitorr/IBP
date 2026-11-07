import type { TemplateId } from "@ibp/shared";

export interface TemplateDefinition {
  id: TemplateId;
  /** Stored in `.ibp/project.json`; also decides how the dev server is started. */
  stack: string;
}

export const TEMPLATES: Record<TemplateId, TemplateDefinition> = {
  "base-vite-react": { id: "base-vite-react", stack: "vite-react-ts-tailwind" },
  "base-next": { id: "base-next", stack: "next-app-ts-tailwind" },
};

/** Files every template shares (sections, content, styles); copied before the template itself. */
export const SHARED_TEMPLATE_DIR = "shared";

/**
 * npm arguments that start a project's dev server on loopback only, or null when IBP does not
 * know the stack. Values are fixed or numeric, never user input.
 */
export function devServerArgs(stack: string, port: number): string[] | null {
  const p = String(port);
  if (stack.startsWith("next")) return ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", p];
  if (stack.startsWith("vite")) {
    return ["run", "dev", "--", "--host", "127.0.0.1", "--port", p, "--strictPort"];
  }
  return null;
}
