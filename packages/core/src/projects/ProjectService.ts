import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { ProjectDetails, ProjectSummary, TemplateId } from "@ibp/shared";
import { hasErrorCode, IbpError } from "../errors";
import { exists } from "../fsutil";
import { SITE_CONTENT_FILE } from "@ibp/shared";
import { presetContent } from "../site/presets";
import { SHARED_TEMPLATE_DIR, TEMPLATES } from "../templates";
import { toFolderName } from "./folderName";
import type { GitRunner } from "./git";
import { readMetadata, writeMetadata } from "./metadata";
import type { ProjectStore } from "./ProjectStore";
import type { ProjectMetadata, ProjectRecord } from "./types";

export type GitOutcome =
  { status: "committed" } | { status: "no_identity" } | { status: "failed"; detail: string };

export interface CreateResult {
  project: ProjectSummary;
  git: GitOutcome;
}

export interface ProjectServiceOptions {
  store: ProjectStore;
  /** Folder holding `shared/` and one folder per template id. */
  templatesRoot: string;
  git: GitRunner;
  now?: () => Date;
  newId?: () => string;
}

const SKIPPED_TEMPLATE_DIRS = new Set(["node_modules", "dist", ".git"]);

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function replaceInFile(file: string, replacements: Record<string, string>): Promise<void> {
  let content = await readFile(file, "utf8");
  for (const [token, value] of Object.entries(replacements))
    content = content.replaceAll(token, value);
  await writeFile(file, content, "utf8");
}

export class ProjectService {
  private readonly store: ProjectStore;
  private readonly templatesRoot: string;
  private readonly git: GitRunner;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(options: ProjectServiceOptions) {
    this.store = options.store;
    this.templatesRoot = options.templatesRoot;
    this.git = options.git;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  async list(): Promise<ProjectSummary[]> {
    const records = await this.store.list();
    return Promise.all(records.map((record) => this.summarize(record)));
  }

  async get(id: string): Promise<ProjectSummary> {
    return this.summarize(await this.requireRecord(id));
  }

  async findByPath(folder: string): Promise<ProjectRecord | undefined> {
    const resolved = await realpath(folder).catch(() => folder);
    return (await this.store.list()).find((r) => r.path === resolved);
  }

  /** Creates `<parentDir>/<slug of name>` from a template. Never touches an existing folder. */
  async create(
    parentDir: string,
    details: ProjectDetails,
    templateId: TemplateId,
  ): Promise<CreateResult> {
    const template = TEMPLATES[templateId];
    const folderName = toFolderName(details.name);
    const parent = await realpath(parentDir);
    if (!(await stat(parent)).isDirectory())
      throw new IbpError("io_error", `${parent} is not a folder`);
    const target = join(parent, folderName);

    try {
      await mkdir(target); // fails with EEXIST instead of merging into an existing folder
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) throw new IbpError("folder_exists", target);
      throw error;
    }

    try {
      await this.copyTemplate(target, templateId, folderName, details);
      const metadata: ProjectMetadata = {
        schemaVersion: 1,
        id: this.newId(),
        ...details,
        stack: template.stack,
        template: template.id,
        createdAt: this.now().toISOString(),
      };
      await writeMetadata(target, metadata);
      const git = await this.initGit(target);
      await this.store.add(this.recordFor(metadata, target));
      return { project: await this.get(metadata.id), git };
    } catch (error) {
      // Only remove the folder this call created, so a failed create leaves nothing half-made.
      await rm(target, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * Adds an existing React project. When it has no `.ibp/project.json` yet, `confirmWrite`
   * is asked before anything is written into the user's folder.
   */
  async import(
    folder: string,
    confirmWrite: (folder: string) => Promise<boolean>,
  ): Promise<ProjectSummary> {
    const dir = await realpath(folder);
    const pkg = await readFile(join(dir, "package.json"), "utf8")
      .then((raw) => JSON.parse(raw) as unknown)
      .catch(() => null);
    if (!isReactPackage(pkg)) throw new IbpError("not_react_project", dir);

    const records = await this.store.list();
    if (records.some((r) => r.path === dir)) throw new IbpError("already_registered", dir);

    let metadata = await readMetadata(dir);
    if (metadata) {
      const clash = records.find((r) => r.id === metadata?.id);
      if (clash) throw new IbpError("already_registered", `same project id as ${clash.path}`);
    } else {
      if (!(await confirmWrite(dir))) throw new IbpError("cancelled");
      metadata = {
        schemaVersion: 1,
        id: this.newId(),
        name: (typeof pkg.name === "string" && pkg.name.trim() ? pkg.name : basename(dir))
          .trim()
          .slice(0, 80),
        client: "",
        industry: "other",
        description: "",
        stack: hasDependency(pkg, "next")
          ? "next"
          : hasDependency(pkg, "vite")
            ? "vite-react"
            : "react",
        template: null,
        createdAt: this.now().toISOString(),
      };
      await writeMetadata(dir, metadata);
    }
    await this.store.add(this.recordFor(metadata, dir));
    return this.get(metadata.id);
  }

  /** Updates name, client, industry and description. The folder keeps its name. */
  async update(id: string, details: ProjectDetails): Promise<ProjectSummary> {
    const record = await this.requireRecord(id);
    if (!(await exists(record.path))) throw new IbpError("folder_missing", record.path);
    const metadata = await readMetadata(record.path);
    if (!metadata)
      throw new IbpError("invalid_metadata", `${record.path} has no .ibp/project.json`);
    await writeMetadata(record.path, { ...metadata, ...details });
    await this.store.update(id, { name: details.name });
    return this.get(id);
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    await this.requireRecord(id);
    await this.store.update(id, { archived });
  }

  async markOpened(id: string): Promise<void> {
    await this.store.update(id, { lastOpenedAt: this.now().toISOString() });
  }

  private async requireRecord(id: string): Promise<ProjectRecord> {
    const record = await this.store.get(id);
    if (!record) throw new IbpError("project_not_found", id);
    return record;
  }

  private recordFor(metadata: ProjectMetadata, path: string): ProjectRecord {
    return {
      id: metadata.id,
      path,
      name: metadata.name,
      archived: false,
      addedAt: this.now().toISOString(),
      lastOpenedAt: null,
    };
  }

  private async copyTemplate(
    target: string,
    templateId: TemplateId,
    folderName: string,
    details: ProjectDetails,
  ) {
    // Shared sections first, then the stack-specific files. `target` was just created empty by
    // this call, and force:false never overwrites a file (the two trees must not overlap).
    for (const dir of [SHARED_TEMPLATE_DIR, templateId]) {
      const source = join(this.templatesRoot, dir);
      await cp(source, target, {
        recursive: true,
        force: false,
        filter: (path) =>
          !relative(source, path)
            .split(sep)
            .some((p) => SKIPPED_TEMPLATE_DIRS.has(p)),
      });
    }
    // Stored without the dot so packaging tools never treat it as an ignore file of their own.
    await rename(join(target, "_gitignore"), join(target, ".gitignore"));
    // Values are JSON-encoded (valid TS/JSON string literals) or HTML-escaped, never pasted raw.
    await replaceInFile(join(target, "package.json"), {
      '"__IBP_PACKAGE_NAME__"': JSON.stringify(folderName),
    });
    if (await exists(join(target, "index.html"))) {
      await replaceInFile(join(target, "index.html"), {
        __IBP_SITE_TITLE__: escapeHtml(details.name),
      });
    }
    // All texts, pages and the theme: validated JSON the content editor and the AI can rewrite.
    await writeFile(
      join(target, SITE_CONTENT_FILE),
      `${JSON.stringify(presetContent(details), null, 2)}\n`,
      "utf8",
    );
  }

  private async initGit(dir: string): Promise<GitOutcome> {
    const init = await this.git(["init", "-b", "main"], dir);
    if (!init.ok) return { status: "failed", detail: init.stderr };
    const email = await this.git(["config", "user.email"], dir);
    const name = await this.git(["config", "user.name"], dir);
    if (!email.ok || !name.ok) return { status: "no_identity" };
    const add = await this.git(["add", "-A"], dir);
    if (!add.ok) return { status: "failed", detail: add.stderr };
    const commit = await this.git(["commit", "-m", "chore: create website from IBP template"], dir);
    return commit.ok ? { status: "committed" } : { status: "failed", detail: commit.stderr };
  }

  private async summarize(record: ProjectRecord): Promise<ProjectSummary> {
    const missing = !(await exists(record.path));
    const metadata = missing ? null : await readMetadata(record.path).catch(() => null);
    const details: ProjectDetails = metadata
      ? {
          name: metadata.name,
          client: metadata.client,
          industry: metadata.industry,
          description: metadata.description,
        }
      : { name: record.name, client: "", industry: "other", description: "" };
    return {
      ...details,
      id: record.id,
      path: record.path,
      stack: metadata?.stack ?? "unknown",
      createdAt: metadata?.createdAt ?? record.addedAt,
      lastModified: missing ? null : await lastModified(record.path),
      hasGit: !missing && (await exists(join(record.path, ".git"))),
      dependenciesInstalled: !missing && (await exists(join(record.path, "node_modules"))),
      archived: record.archived,
      missing,
    };
  }
}

// shortcut: uses folder + src mtimes (changes when files are added/removed, not on every edit);
// switch to git log or a file watcher when the dashboard needs exact edit times.
async function lastModified(dir: string): Promise<string | null> {
  const times = await Promise.all(
    [dir, join(dir, "src")].map((p) =>
      stat(p).then(
        (s) => s.mtimeMs,
        () => 0,
      ),
    ),
  );
  const latest = Math.max(...times);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

type PackageJson = { name?: unknown; dependencies?: unknown; devDependencies?: unknown };

function hasDependency(pkg: PackageJson, name: string): boolean {
  return [pkg.dependencies, pkg.devDependencies].some(
    (deps) => typeof deps === "object" && deps !== null && name in deps,
  );
}

function isReactPackage(pkg: unknown): pkg is PackageJson {
  return typeof pkg === "object" && pkg !== null && hasDependency(pkg as PackageJson, "react");
}
