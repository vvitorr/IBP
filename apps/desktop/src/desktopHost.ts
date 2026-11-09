import { dialog, shell, type BrowserWindow } from "electron";
import { previewUrlSchema, translate, type MessageKey } from "@ibp/shared";
import type { HostPlatform, SecretVault } from "@ibp/core";
import type { SettingsStore } from "./settings";

/**
 * Test hooks, honoured only when IBP_TEST_MODE=1: the folder picker returns IBP_TEST_PICK_FOLDER,
 * the file picker IBP_TEST_PICK_FILE,
 * and confirmations answer IBP_TEST_CONFIRM ("yes"/"no") instead of showing native dialogs.
 */
const testMode = process.env.IBP_TEST_MODE === "1";

/** HostPlatform backed by Electron: native dialogs, a JSON settings file, the system browser. */
export function createDesktopHost(
  win: BrowserWindow,
  settings: SettingsStore,
  storage: { dataDir: string; secrets: SecretVault },
): HostPlatform {
  const t = (key: MessageKey) => translate(settings.get().language, key);

  return {
    kind: "desktop",
    capabilities: { terminal: false }, // built-in terminal arrives with Milestone B
    dataDir: storage.dataDir,
    secrets: storage.secrets,
    post: (message) => {
      if (!win.isDestroyed()) win.webContents.send("ibp:message", message);
    },
    log: (level, message) => console[level === "info" ? "log" : level](`[ibp] ${message}`),
    readSettings: () => settings.studio(),
    updateSetting: (update) => settings.update({ [update.key]: update.value }),
    projectsRoot: () => settings.projectsRoot(),

    async pickFolder({ title, button, defaultPath }) {
      if (testMode && process.env.IBP_TEST_PICK_FOLDER) return process.env.IBP_TEST_PICK_FOLDER;
      const result = await dialog.showOpenDialog(win, {
        title,
        buttonLabel: button,
        defaultPath,
        properties: ["openDirectory", "createDirectory"],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },

    async pickFile({ title, button, filters }) {
      if (testMode && process.env.IBP_TEST_PICK_FILE) return process.env.IBP_TEST_PICK_FILE;
      const result = await dialog.showOpenDialog(win, {
        title,
        buttonLabel: button,
        filters,
        properties: ["openFile"],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },

    async confirm(message, action) {
      if (testMode && process.env.IBP_TEST_CONFIRM) return process.env.IBP_TEST_CONFIRM === "yes";
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        message,
        buttons: [action, t("host.cancel")],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      return response === 0;
    },

    notify(level, message) {
      if (testMode) return;
      void dialog.showMessageBox(win, { type: level === "warning" ? "warning" : "info", message });
    },

    currentProjectPath: () => settings.get().currentProjectPath ?? undefined,

    async openProject(project) {
      await settings.update({ currentProjectPath: project.path });
    },

    async openCode(project) {
      // Until the built-in editor (Milestone B): hand the folder to VS Code, else reveal it.
      try {
        await shell.openExternal(`vscode://file${encodeURI(project.path)}/`);
      } catch {
        await shell.openPath(project.path);
      }
    },

    async openTerminal() {
      throw new Error("The desktop app has no terminal yet");
    },

    async openExternal(url) {
      // Defence in depth: the controller only passes the running preview URL.
      if (previewUrlSchema.safeParse(url).success) await shell.openExternal(url);
    },
  };
}
