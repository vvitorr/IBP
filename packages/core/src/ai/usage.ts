import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { UsageRow } from "@ibp/shared";
import { hasErrorCode } from "../errors";

export interface UsageEntry {
  at: string;
  providerId: string;
  modelId: string;
  task: string;
  ok: boolean;
  errorCode?: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

const ROTATE_BYTES = 5 * 1024 * 1024;

/** Append-only `usage.jsonl`: one line per model request. Holds no prompts or answers. */
export class UsageLog {
  constructor(private readonly file: string) {}

  async append(entry: UsageEntry): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const size = await stat(this.file).then(
      (s) => s.size,
      () => 0,
    );
    // shortcut: rotate by size and only read the current file for "today"; move to a small
    // database if usage history becomes a feature.
    if (size > ROTATE_BYTES) await rename(this.file, `${this.file}.${Date.now()}`);
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, "utf8");
  }

  /** Totals per provider/model for the UTC day of `now`. */
  async today(now: Date = new Date()): Promise<UsageRow[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return [];
      throw error;
    }
    const day = now.toISOString().slice(0, 10);
    const rows = new Map<string, UsageRow>();
    for (const line of raw.split("\n")) {
      if (!line.startsWith(`{"at":"${day}`)) continue;
      let entry: UsageEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const key = `${entry.providerId}/${entry.modelId}`;
      const row = rows.get(key) ?? {
        providerId: entry.providerId,
        modelId: entry.modelId,
        requests: 0,
        errors: 0,
        promptTokens: 0,
        completionTokens: 0,
      };
      row.requests += 1;
      if (!entry.ok) row.errors += 1;
      row.promptTokens += entry.promptTokens;
      row.completionTokens += entry.completionTokens;
      rows.set(key, row);
    }
    return [...rows.values()];
  }
}
