import { join } from "node:path";
import * as vscode from "vscode";
import { translate } from "@ibp/shared";
import { readSettings } from "./config";
import { exists, JsonProjectStore, metadataPath, ProjectService, runGit } from "@ibp/core";
import { StudioPanel, type StudioDeps } from "./studio/StudioPanel";

/** Exported for integration tests only. */
export interface IbpApi {
  whenStudioReady(): Promise<void>;
}

export async function activate(context: vscode.ExtensionContext): Promise<IbpApi> {
  const log = vscode.window.createOutputChannel("IBP", { log: true });
  const store = new JsonProjectStore(join(context.globalStorageUri.fsPath, "projects.json"), (m) =>
    log.warn(m),
  );
  const service = new ProjectService({
    store,
    templatesRoot: join(context.extensionPath, "dist", "templates"),
    git: runGit,
  });
  const deps: StudioDeps = {
    service,
    webviewRoot: vscode.Uri.joinPath(context.extensionUri, "dist", "webview"),
    log,
  };

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = "$(sparkle) IBP";
  statusBar.tooltip = translate(readSettings().language, "host.statusBarTooltip");
  statusBar.command = "ibp.openStudio";
  statusBar.show();

  context.subscriptions.push(
    log,
    statusBar,
    vscode.commands.registerCommand("ibp.openStudio", () => StudioPanel.show(deps)),
    vscode.commands.registerCommand("ibp.newProject", () => StudioPanel.show(deps, "create")),
    { dispose: () => StudioPanel.disposeCurrent() },
  );

  // When this window is an IBP project (e.g. right after "Open project"), show the Studio.
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder && (await exists(metadataPath(folder)))) {
    if (!(await service.findByPath(folder))) {
      // A project cloned or copied by a teammate: register it; it already has metadata.
      await service
        .import(folder, async () => false)
        .catch((error: unknown) => {
          log.warn(`Could not register ${folder}: ${String(error)}`);
        });
    }
    StudioPanel.show(deps);
  }

  return { whenStudioReady: () => StudioPanel.whenReady() };
}

export function deactivate(): void {}
