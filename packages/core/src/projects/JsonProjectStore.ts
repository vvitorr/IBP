import { readFile, rename } from "node:fs/promises";
import { hasErrorCode, IbpError } from "../errors";
import { writeFileAtomic } from "../fsutil";
import type { ProjectStore } from "./ProjectStore";
import { registrySchema, type ProjectRecord } from "./types";

export class JsonProjectStore implements ProjectStore {
  private cache: ProjectRecord[] | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly log: (message: string) => void = () => {},
  ) {}

  async list(): Promise<ProjectRecord[]> {
    return [...(await this.load())];
  }

  async get(id: string): Promise<ProjectRecord | undefined> {
    return (await this.load()).find((p) => p.id === id);
  }

  add(record: ProjectRecord): Promise<void> {
    return this.mutate((projects) => {
      if (projects.some((p) => p.id === record.id || p.path === record.path)) {
        throw new IbpError("already_registered", record.path);
      }
      return [...projects, record];
    });
  }

  update(id: string, patch: Partial<Omit<ProjectRecord, "id">>): Promise<void> {
    return this.mutate((projects) => {
      if (!projects.some((p) => p.id === id)) throw new IbpError("project_not_found", id);
      return projects.map((p) => (p.id === id ? { ...p, ...patch, id } : p));
    });
  }

  remove(id: string): Promise<void> {
    return this.mutate((projects) => projects.filter((p) => p.id !== id));
  }

  /** Writes are serialised so concurrent requests cannot overwrite each other. */
  private mutate(change: (projects: ProjectRecord[]) => ProjectRecord[]): Promise<void> {
    const run = this.queue.then(async () => {
      const next = change(await this.load());
      await writeFileAtomic(this.file, JSON.stringify({ version: 1, projects: next }, null, 2));
      this.cache = next;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<ProjectRecord[]> {
    if (this.cache) return this.cache;
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return (this.cache = []);
      throw error;
    }
    try {
      return (this.cache = registrySchema.parse(JSON.parse(raw)).projects);
    } catch (error) {
      // The registry only indexes folders that keep their own .ibp/project.json, so it can be
      // rebuilt by re-importing. Keep the damaged file for inspection instead of overwriting it.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      await rename(this.file, backup);
      this.log(`Project registry was unreadable and was moved to ${backup}: ${String(error)}`);
      return (this.cache = []);
    }
  }
}
