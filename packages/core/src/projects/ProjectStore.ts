import type { ProjectRecord } from "./types";

/**
 * Persistence boundary for the project list. The MVP stores it in a local JSON file;
 * a cloud-synced implementation can replace it without touching ProjectService.
 */
export interface ProjectStore {
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | undefined>;
  add(record: ProjectRecord): Promise<void>;
  update(id: string, patch: Partial<Omit<ProjectRecord, "id">>): Promise<void>;
  remove(id: string): Promise<void>;
}
