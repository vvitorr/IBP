import { readFile, rename } from "node:fs/promises";
import { z } from "zod";
import {
  appErrorSchema,
  modelRefSchema,
  PROVIDER_PRESETS,
  providerIdSchema,
  TRISTATES,
} from "@ibp/shared";
import { hasErrorCode } from "../errors";
import { writeFileAtomic } from "../fsutil";

// Data at rest: non-strict objects and per-field fallbacks, so newer/older files still load.
const modelSchema = z.object({
  id: z.string().min(1).max(200),
  contextWindow: z.number().int().positive().nullable().catch(null),
  tools: z.enum(TRISTATES).catch("unknown"),
  streaming: z.enum(TRISTATES).catch("unknown"),
  free: z.boolean().nullable().catch(null),
  probedAt: z.string().nullable().catch(null),
});

export const UNKNOWN_HEALTH = { status: "unknown" as const, checkedAt: null, latencyMs: null };

const providerSchema = z.object({
  id: providerIdSchema,
  preset: z.enum(PROVIDER_PRESETS),
  name: z.string().max(80),
  baseUrl: z.string().max(500),
  enabled: z.boolean().catch(true),
  models: z.array(modelSchema).catch([]),
  health: z
    .object({
      status: z.enum(["unknown", "ok", "error"]),
      checkedAt: z.string().nullable(),
      latencyMs: z.number().nullable(),
      error: appErrorSchema.optional(),
    })
    .catch(UNKNOWN_HEALTH),
});

const fileSchema = z.object({
  version: z.literal(1),
  providers: z.array(providerSchema),
  preferences: z.array(modelRefSchema).catch([]),
});

export type StoredModel = z.infer<typeof modelSchema>;
export type StoredProvider = z.infer<typeof providerSchema>;
export type AiConfig = z.infer<typeof fileSchema>;

const EMPTY: AiConfig = { version: 1, providers: [], preferences: [] };

/** `ai.json`: providers (no keys), model capabilities, preference order. */
export class AiConfigStore {
  private value: AiConfig = EMPTY;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly log: (message: string) => void = () => {},
  ) {}

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return;
      throw error;
    }
    try {
      this.value = fileSchema.parse(JSON.parse(raw));
    } catch (error) {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      await rename(this.file, backup);
      this.log(`AI settings were unreadable and were moved to ${backup}: ${String(error)}`);
      this.value = EMPTY;
    }
  }

  get(): AiConfig {
    return this.value;
  }

  /** Serialised read-modify-write. */
  update(change: (config: AiConfig) => AiConfig): Promise<void> {
    const run = this.queue.then(async () => {
      const next = change(this.value);
      await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
      this.value = next;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
