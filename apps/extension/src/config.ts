import { homedir } from "node:os";
import * as vscode from "vscode";
import { LOCALES, MODES, THEMES, type Settings, type SettingUpdate } from "@ibp/shared";

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads `ibp.*` settings, falling back to defaults when settings.json holds invalid values. */
export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration("ibp");
  return {
    language: pick(config.get("language"), LOCALES, "pt-PT"),
    mode: pick(config.get("mode"), MODES, "beginner"),
    theme: pick(config.get("theme"), THEMES, "dark"),
  };
}

export async function updateSetting(update: SettingUpdate): Promise<void> {
  await vscode.workspace
    .getConfiguration("ibp")
    .update(update.key, update.value, vscode.ConfigurationTarget.Global);
}

/** Default folder for new projects; `~` is expanded. */
export function projectsRoot(): string {
  const value = vscode.workspace.getConfiguration("ibp").get<string>("projectsRoot")?.trim();
  return value ? value.replace(/^~(?=$|[\\/])/, homedir()) : homedir();
}
