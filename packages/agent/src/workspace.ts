import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff";

export type WorkspaceErrorReason =
  | "outside"
  | "denied"
  | "secret"
  | "binary"
  | "too_large"
  | "not_found"
  | "not_unique"
  | "no_match";

/** A refused or failed file operation; the message is written for the model to act on. */
export class WorkspaceError extends Error {
  constructor(
    readonly reason: WorkspaceErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export interface FileChange {
  path: string;
  kind: "created" | "modified" | "deleted";
  additions: number;
  deletions: number;
  /** Unified diff, truncated for display. */
  diff: string;
}

/** Folders the agent never reads or writes: VCS, dependencies, IBP metadata, build output. */
const DENIED_DIRS = new Set([
  ".git",
  "node_modules",
  ".ibp",
  "dist",
  ".next",
  "out",
  ".vercel",
  ".turbo",
  "coverage",
]);
/** Files that may hold credentials: never read, never listed. */
const SECRET_FILES = [
  /^\.env(\..+)?$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /^\.npmrc$/,
  /^id_[a-z0-9]+$/i,
];
/** Project configuration: writing these needs the user's approval. */
const CONFIG_FILES = [
  /^package(-lock)?\.json$/,
  /^tsconfig.*\.json$/,
  /\.config\.[cm]?[jt]s$/,
  /^\.env/,
  /^postcss\./,
  /^tailwind\./,
  /^\.npmrc$/,
];

export const MAX_READ_BYTES = 200_000;
export const MAX_WRITE_BYTES = 500_000;
const MAX_LIST = 400;
const MAX_DIFF_CHARS = 40_000;

const isSecret = (path: string) => SECRET_FILES.some((re) => re.test(basename(path)));
export const isConfigFile = (path: string) => CONFIG_FILES.some((re) => re.test(basename(path)));
const looksBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);

async function readOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * The project folder as the agent sees it. Every path from the model is resolved here (no
 * escaping the root, symlink-safe), and the first time a file is touched its previous
 * content is kept, so the whole run can be reviewed as a diff and reverted exactly.
 */
export class Workspace {
  private readonly journal = new Map<string, Buffer | null>();

  private constructor(readonly root: string) {}

  static async open(root: string): Promise<Workspace> {
    return new Workspace(await realpath(root));
  }

  /** Resolves a model-supplied path; throws WorkspaceError if it is not allowed. */
  async resolve(path: string): Promise<{ abs: string; rel: string }> {
    if (typeof path !== "string" || !path.trim() || path.includes("\0") || isAbsolute(path)) {
      throw new WorkspaceError("outside", `"${path}" is not a path relative to the project root`);
    }
    const abs = resolve(this.root, normalize(path));
    const rel = relative(this.root, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new WorkspaceError("outside", `"${path}" is outside the project`);
    }
    const parts = rel.split(sep);
    if (parts.some((part) => DENIED_DIRS.has(part))) {
      throw new WorkspaceError(
        "denied",
        `"${path}" is in a folder the assistant may not touch (${parts.find((p) => DENIED_DIRS.has(p))})`,
      );
    }
    // Symlinks: the deepest existing ancestor must really be inside the project.
    let probe = abs;
    for (;;) {
      try {
        await stat(probe);
        break;
      } catch {
        if (probe === this.root) break;
        probe = dirname(probe);
      }
    }
    const real = await realpath(probe);
    if (real !== this.root && !real.startsWith(this.root + sep)) {
      throw new WorkspaceError("outside", `"${path}" leads outside the project`);
    }
    return { abs, rel: rel.split(sep).join("/") || "." };
  }

  /** Project files (not folders), excluding dependencies, build output, VCS and secrets. */
  async list(dir = "."): Promise<string[]> {
    const { abs } = await this.resolve(dir);
    const out: string[] = [];
    const walk = async (folder: string) => {
      const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (out.length >= MAX_LIST) return;
        if (DENIED_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
        const full = join(folder, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && !isSecret(entry.name)) {
          out.push(relative(this.root, full).split(sep).join("/"));
        }
      }
    };
    await walk(abs);
    return out;
  }

  async read(path: string): Promise<string> {
    const { abs, rel } = await this.resolve(path);
    if (isSecret(rel))
      throw new WorkspaceError("secret", `"${rel}" may contain secrets and cannot be read`);
    const bytes = await readOrNull(abs);
    if (!bytes) throw new WorkspaceError("not_found", `"${rel}" does not exist`);
    if (bytes.length > MAX_READ_BYTES)
      throw new WorkspaceError("too_large", `"${rel}" is larger than ${MAX_READ_BYTES} bytes`);
    if (looksBinary(bytes)) throw new WorkspaceError("binary", `"${rel}" is a binary file`);
    return bytes.toString("utf8");
  }

  /** Plain-text search over readable project files: "path:line: text". */
  async search(query: string, limit = 50): Promise<string[]> {
    const hits: string[] = [];
    for (const rel of await this.list()) {
      if (hits.length >= limit) break;
      const bytes = await readOrNull(join(this.root, rel));
      if (!bytes || bytes.length > MAX_READ_BYTES || looksBinary(bytes)) continue;
      bytes
        .toString("utf8")
        .split("\n")
        .forEach((line, i) => {
          if (hits.length < limit && line.includes(query))
            hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 200)}`);
        });
    }
    return hits;
  }

  async write(path: string, content: string): Promise<"created" | "modified"> {
    const { abs, rel } = await this.resolve(path);
    if (Buffer.byteLength(content) > MAX_WRITE_BYTES) {
      throw new WorkspaceError(
        "too_large",
        `content for "${rel}" is larger than ${MAX_WRITE_BYTES} bytes`,
      );
    }
    const existed = await this.remember(abs, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return existed ? "modified" : "created";
  }

  /** Replaces `old` with `next`; `old` must appear exactly once. */
  async edit(path: string, old: string, next: string): Promise<void> {
    const content = await this.read(path);
    const count = old ? content.split(old).length - 1 : 0;
    if (count === 0)
      throw new WorkspaceError(
        "no_match",
        `the text to replace was not found in "${path}"; read the file again`,
      );
    if (count > 1)
      throw new WorkspaceError(
        "not_unique",
        `the text to replace appears ${count} times in "${path}"; include more surrounding lines`,
      );
    await this.write(
      path,
      content.replace(old, () => next),
    );
  }

  async delete(path: string): Promise<void> {
    const { abs, rel } = await this.resolve(path);
    if (
      !(await stat(abs).then(
        (s) => s.isFile(),
        () => false,
      ))
    ) {
      throw new WorkspaceError("not_found", `"${rel}" is not an existing file`);
    }
    await this.remember(abs, rel);
    await rm(abs);
  }

  /** What the run changed, compared with each file's state before its first touch. */
  async changes(): Promise<FileChange[]> {
    const out: FileChange[] = [];
    for (const [rel, before] of this.journal) {
      const after = await readOrNull(join(this.root, rel));
      if (before === null && after === null) continue;
      if (before && after && before.equals(after)) continue;
      const diff = createTwoFilesPatch(
        before ? `a/${rel}` : "/dev/null",
        after ? `b/${rel}` : "/dev/null",
        before?.toString("utf8") ?? "",
        after?.toString("utf8") ?? "",
        undefined,
        undefined,
        { context: 3, headerOptions: FILE_HEADERS_ONLY },
      );
      const lines = diff.split("\n");
      out.push({
        path: rel,
        kind: before === null ? "created" : after === null ? "deleted" : "modified",
        additions: lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
        deletions: lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length,
        diff:
          diff.length > MAX_DIFF_CHARS
            ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… (diff truncated)`
            : diff,
      });
    }
    return out;
  }

  /** Puts every touched file back exactly as it was before the run. */
  async revert(): Promise<void> {
    for (const [rel, before] of this.journal) {
      const abs = join(this.root, rel);
      if (before === null) await rm(abs, { force: true });
      else {
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, before);
      }
    }
    this.journal.clear();
  }

  /** Returns whether the file existed; records its content the first time it is touched. */
  private async remember(abs: string, rel: string): Promise<boolean> {
    const current = await readOrNull(abs);
    if (!this.journal.has(rel)) this.journal.set(rel, current);
    return current !== null;
  }
}
