import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { z } from "zod";
import { LOCALES, MODES, THEMES, type Settings } from "@ibp/shared";
import { writeFileAtomic } from "@ibp/core";

// Each field falls back on its own, so one bad value never resets the others.
const fileSchema = z.object({
  language: z.enum(LOCALES).catch("pt-PT"),
  mode: z.enum(MODES).catch("beginner"),
  theme: z.enum(THEMES).catch("dark"),
  projectsRoot: z.string().catch(""),
  currentProjectPath: z.string().nullable().catch(null),
});
export type DesktopSettings = z.infer<typeof fileSchema>;

/** Desktop settings in userData/settings.json. Holds no secrets (those go to safeStorage later). */
export class SettingsStore {
  private value: DesktopSettings = fileSchema.parse({});

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      this.value = fileSchema.parse(JSON.parse(await readFile(this.file, "utf8")));
    } catch {
      this.value = fileSchema.parse({});
    }
  }

  get(): DesktopSettings {
    return this.value;
  }

  studio(): Settings {
    const { language, mode, theme } = this.value;
    return { language, mode, theme };
  }

  projectsRoot(): string {
    const root = this.value.projectsRoot.trim();
    return root ? root.replace(/^~(?=$|[\\/])/, homedir()) : homedir();
  }

  async update(patch: Partial<DesktopSettings>): Promise<void> {
    this.value = { ...this.value, ...patch };
    await writeFileAtomic(this.file, `${JSON.stringify(this.value, null, 2)}\n`);
  }
}
