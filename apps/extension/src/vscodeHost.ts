import { realpath } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";
import { translate, type ProjectSummary } from "@ibp/shared";
import { exists, type HostPlatform } from "@ibp/core";
import { projectsRoot, readSettings, updateSetting } from "./config";

async function isCurrentWorkspace(path: string): Promise<boolean> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) return false;
  return (await realpath(folder).catch(() => folder)) === path;
}

/** HostPlatform backed by VS Code: native dialogs, settings, workspace and terminals. */
export function createVsCodeHost(
  panel: vscode.WebviewPanel,
  log: vscode.LogOutputChannel,
): HostPlatform {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string>) =>
    translate(readSettings().language, key, params);

  async function openProject(project: ProjectSummary): Promise<void> {
    if (await isCurrentWorkspace(project.path)) return;
    // Reloads the window; activation on `.ibp/project.json` reopens the Studio afterwards.
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(project.path), {
      forceNewWindow: false,
    });
  }

  return {
    kind: "vscode",
    capabilities: { terminal: true },
    post: (message) => void panel.webview.postMessage(message),
    log: (level, message) => log[level](message),
    readSettings,
    updateSetting,
    projectsRoot,

    async pickFolder({ title, button, defaultPath }) {
      const picked = await vscode.window.showOpenDialog({
        title,
        openLabel: button,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(defaultPath),
      });
      return picked?.[0]?.fsPath;
    },

    async confirm(message, action) {
      return (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action;
    },

    notify(level, message) {
      if (level === "warning") void vscode.window.showWarningMessage(message);
      else void vscode.window.showInformationMessage(message);
    },

    currentProjectPath: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,

    openProject,

    async openCode(project) {
      if (!(await isCurrentWorkspace(project.path))) return openProject(project);
      for (const entry of ["src/App.tsx", "src/app/page.tsx"]) {
        const file = join(project.path, entry);
        if (await exists(file)) {
          await vscode.window.showTextDocument(vscode.Uri.file(file));
          return;
        }
      }
      await vscode.commands.executeCommand("workbench.view.explorer");
    },

    async openTerminal(project) {
      vscode.window
        .createTerminal({
          name: t("host.terminal.project", { name: project.name }),
          cwd: project.path,
        })
        .show();
    },

    async openExternal(url) {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    },
  };
}
