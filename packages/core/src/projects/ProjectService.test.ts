import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { siteContentSchema, type ProjectDetails } from "@ibp/shared";
import { IbpError } from "../errors";
import { exists } from "../fsutil";
import { toFolderName } from "./folderName";
import type { GitResult, GitRunner } from "./git";
import { JsonProjectStore } from "./JsonProjectStore";
import { metadataPath, readMetadata } from "./metadata";
import { ProjectService } from "./ProjectService";

const templatesRoot = join(__dirname, "..", "..", "..", "..", "templates");
const details: ProjectDetails = {
  name: 'Tasca "Zé" <Porto>',
  client: "José Silva",
  industry: "restaurant",
  description: "Petiscos desde 1990.",
};

function fakeGit(overrides: Record<string, Partial<GitResult>> = {}) {
  const calls: string[] = [];
  const runner: GitRunner = async (args) => {
    const key = args.join(" ");
    calls.push(key);
    return {
      ok: true,
      stdout: "",
      stderr: "",
      ...overrides[args[0] === "config" ? key : (args[0] ?? "")],
    };
  };
  return { runner, calls };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(IbpError);
  await expect(promise).rejects.toMatchObject({ code });
}

let root: string;
let parent: string;
let store: JsonProjectStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-test-"));
  parent = join(root, "sites");
  await mkdir(parent);
  store = new JsonProjectStore(join(root, "storage", "projects.json"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function service(git = fakeGit().runner) {
  return new ProjectService({ store, templatesRoot, git });
}

describe("toFolderName", () => {
  it("makes safe, readable folder names", () => {
    expect(toFolderName("Café Central")).toBe("cafe-central");
    expect(toFolderName("  Oficina São João  ")).toBe("oficina-sao-joao");
    expect(toFolderName("../../etc/passwd")).toBe("etc-passwd");
    expect(toFolderName("con")).toBe("con-site");
    expect(toFolderName("a".repeat(100))).toHaveLength(64);
  });

  it("rejects names without letters or digits", () => {
    expect(() => toFolderName("!!!")).toThrow(IbpError);
  });
});

describe("ProjectService.create", () => {
  it("copies the template, fills placeholders safely and registers the project", async () => {
    const git = fakeGit();
    const { project, git: outcome } = await service(git.runner).create(
      parent,
      details,
      "base-vite-react",
    );

    expect(project.path).toBe(join(await realParent(), "tasca-ze-porto"));
    expect(outcome).toEqual({ status: "committed" });
    expect(git.calls).toEqual([
      "init -b main",
      "config user.email",
      "config user.name",
      "add -A",
      "commit -m chore: create website from IBP template",
    ]);

    const pkg = JSON.parse(await readFile(join(project.path, "package.json"), "utf8"));
    expect(pkg.name).toBe("tasca-ze-porto");
    const html = await readFile(join(project.path, "index.html"), "utf8");
    expect(html).toContain("<title>Tasca &#34;Zé&#34; &#60;Porto&#62;</title>");
    const site = siteContentSchema.parse(
      JSON.parse(await readFile(join(project.path, "src", "content", "site.json"), "utf8")),
    );
    expect(site.business).toMatchObject({ name: details.name, client: details.client });
    expect(site.theme).toBe("terracotta"); // restaurant theme
    expect(site.pages.map((p) => p.slug)).toEqual(["", "menu"]);
    expect(JSON.stringify(site)).not.toContain("__IBP_");
    expect(await exists(join(project.path, ".gitignore"))).toBe(true);
    expect(await exists(join(project.path, "_gitignore"))).toBe(false);

    const metadata = await readMetadata(project.path);
    expect(metadata).toMatchObject({ ...details, id: project.id, template: "base-vite-react" });
    expect((await store.list()).map((r) => r.id)).toEqual([project.id]);
  });

  it("creates a Next.js project from the shared sections plus the Next files", async () => {
    const { project } = await service().create(parent, details, "base-next");
    expect(project.stack).toBe("next-app-ts-tailwind");
    for (const file of [
      "src/app/layout.tsx",
      "src/app/page.tsx",
      "src/components/sections/Sections.tsx",
      "next.config.ts",
    ]) {
      expect(await exists(join(project.path, file))).toBe(true);
    }
    expect(await exists(join(project.path, "index.html"))).toBe(false);
    const pkg = JSON.parse(await readFile(join(project.path, "package.json"), "utf8"));
    expect(pkg.name).toBe("tasca-ze-porto");
    expect(pkg.dependencies.next).toBeDefined();
    expect(await readMetadata(project.path)).toMatchObject({ template: "base-next" });
  });

  it("keeps template folders disjoint from the shared folder", async () => {
    const files = async (dir: string) =>
      (await readdir(dir, { recursive: true, withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) => relative(dir, join(e.parentPath, e.name)));
    const shared = new Set(await files(join(templatesRoot, "shared")));
    for (const template of ["base-vite-react", "base-next"]) {
      const overlap = (await files(join(templatesRoot, template))).filter((f) => shared.has(f));
      expect(overlap).toEqual([]);
    }
  });

  it("never touches an existing folder", async () => {
    const existing = join(parent, "tasca-ze-porto");
    await mkdir(existing);
    await writeFile(join(existing, "keep.txt"), "user file");

    await expectCode(service().create(parent, details, "base-vite-react"), "folder_exists");
    expect(await readFile(join(existing, "keep.txt"), "utf8")).toBe("user file");
    expect(await store.list()).toEqual([]);
  });

  it("rejects names that produce no folder name", async () => {
    await expectCode(
      service().create(parent, { ...details, name: "???" }, "base-vite-react"),
      "invalid_name",
    );
  });

  it("removes the half-created folder when a step fails", async () => {
    const broken = new ProjectService({
      store,
      templatesRoot: join(root, "no-templates"),
      git: fakeGit().runner,
    });
    await expect(broken.create(parent, details, "base-vite-react")).rejects.toThrow();
    expect(await exists(join(parent, "tasca-ze-porto"))).toBe(false);
  });

  it("still creates the project when git has no identity or fails", async () => {
    const noIdentity = fakeGit({ "config user.email": { ok: false } });
    const first = await service(noIdentity.runner).create(parent, details, "base-vite-react");
    expect(first.git).toEqual({ status: "no_identity" });
    expect(noIdentity.calls).not.toContain("add -A");

    const failing = fakeGit({ init: { ok: false, stderr: "git: command not found" } });
    const second = await service(failing.runner).create(
      parent,
      { ...details, name: "Outro site" },
      "base-vite-react",
    );
    expect(second.git).toEqual({ status: "failed", detail: "git: command not found" });
    expect(await store.list()).toHaveLength(2);
  });
});

describe("ProjectService.import", () => {
  async function reactFolder(name: string, extra: object = {}) {
    const dir = join(root, name);
    await mkdir(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name, dependencies: { react: "19" }, ...extra }),
    );
    return dir;
  }

  it("asks before writing metadata, then registers the folder", async () => {
    const dir = await reactFolder("loja-antiga", { devDependencies: { vite: "8" } });
    const next = await reactFolder("loja-next", { dependencies: { react: "19", next: "16" } });
    expect((await service().import(next, async () => true)).stack).toBe("next");
    const asked: string[] = [];
    const project = await service().import(dir, async (folder) => (asked.push(folder), true));

    expect(asked).toHaveLength(1);
    expect(project).toMatchObject({ name: "loja-antiga", stack: "vite-react", industry: "other" });
    expect(await exists(metadataPath(dir))).toBe(true);
  });

  it("writes nothing when the user declines", async () => {
    const dir = await reactFolder("recusado");
    await expectCode(
      service().import(dir, async () => false),
      "cancelled",
    );
    expect(await exists(join(dir, ".ibp"))).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it("rejects folders that are not React projects", async () => {
    const dir = join(root, "vazio");
    await mkdir(dir);
    await expectCode(
      service().import(dir, async () => true),
      "not_react_project",
    );
  });

  it("rejects a folder that is already registered", async () => {
    const dir = await reactFolder("duplicado");
    await service().import(dir, async () => true);
    await expectCode(
      service().import(dir, async () => true),
      "already_registered",
    );
  });

  it("reuses existing metadata without asking", async () => {
    const { project } = await service().create(parent, details, "base-vite-react");
    await store.remove(project.id);
    const reimported = await service().import(project.path, async () => {
      throw new Error("should not ask");
    });
    expect(reimported.id).toBe(project.id);
  });

  it("reports damaged metadata", async () => {
    const dir = await reactFolder("danificado");
    await mkdir(join(dir, ".ibp"));
    await writeFile(metadataPath(dir), "{ not json");
    await expectCode(
      service().import(dir, async () => true),
      "invalid_metadata",
    );
  });
});

describe("ProjectService update / archive / list", () => {
  it("updates details in metadata and registry without renaming the folder", async () => {
    const { project } = await service().create(parent, details, "base-vite-react");
    const updated = await service().update(project.id, { ...details, name: "Tasca Nova" });

    expect(updated.name).toBe("Tasca Nova");
    expect(updated.path).toBe(project.path);
    expect((await readMetadata(project.path))?.name).toBe("Tasca Nova");
    expect((await store.get(project.id))?.name).toBe("Tasca Nova");
  });

  it("archives and restores", async () => {
    const { project } = await service().create(parent, details, "base-vite-react");
    await service().setArchived(project.id, true);
    expect((await service().get(project.id)).archived).toBe(true);
    await service().setArchived(project.id, false);
    expect((await service().get(project.id)).archived).toBe(false);
  });

  it("flags projects whose folder disappeared", async () => {
    const { project } = await service().create(parent, details, "base-vite-react");
    await rm(project.path, { recursive: true });
    const [listed] = await service().list();
    expect(listed).toMatchObject({ id: project.id, missing: true, name: details.name });
    await expectCode(service().update(project.id, details), "folder_missing");
  });

  it("fails clearly for unknown ids", async () => {
    await expectCode(service().get("6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d"), "project_not_found");
  });
});

describe("JsonProjectStore", () => {
  it("survives a restart and serialises concurrent writes", async () => {
    const first = await service().create(parent, details, "base-vite-react");
    await Promise.all([
      service().setArchived(first.project.id, true),
      service().markOpened(first.project.id),
    ]);
    const reopened = new JsonProjectStore(join(root, "storage", "projects.json"));
    expect(await reopened.get(first.project.id)).toMatchObject({ archived: true });
    expect((await reopened.get(first.project.id))?.lastOpenedAt).not.toBeNull();
  });

  it("moves an unreadable registry aside instead of overwriting it", async () => {
    const file = join(root, "storage", "projects.json");
    await mkdir(join(root, "storage"), { recursive: true });
    await writeFile(file, "garbage");
    const logs: string[] = [];
    const damaged = new JsonProjectStore(file, (m) => logs.push(m));

    expect(await damaged.list()).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(await exists(file)).toBe(false);
    const backup = /moved to (\S+):/.exec(logs[0] ?? "")?.[1];
    expect(backup).toBeDefined();
    await expect(stat(backup ?? "")).resolves.toBeTruthy();
  });
});

async function realParent() {
  const { realpath } = await import("node:fs/promises");
  return realpath(parent);
}
