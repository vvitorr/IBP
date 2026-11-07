import { join } from "node:path";
import * as vscode from "vscode";
import {
  translate,
  webviewMessageSchema,
  type HostMessage,
  type MessageKey,
  type WebviewRequest,
} from "@ibp/shared";
import { projectsRoot, readSettings, updateSetting } from "../config";
import { IbpError, toAppError } from "../errors";
import { exists } from "../fsutil";
import type { ProjectService } from "../projects/ProjectService";
import { renderStudioHtml } from "./html";

export interface StudioDeps {
  service: ProjectService;
  /** dist/webview inside the extension: the only folder the webview may load files from. */
  webviewRoot: vscode.Uri;
  log: vscode.LogOutputChannel;
}

function t(key: MessageKey, params?: Record<string, string>): string {
  return translate(readSettings().language, key, params);
}

function requestIdOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null || !("requestId" in raw)) return undefined;
  const { requestId } = raw;
  return typeof requestId === "string" && requestId.length > 0 && requestId.length <= 64
    ? requestId
    : undefined;
}

async function confirm(message: string, action: string): Promise<boolean> {
  return (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action;
}

async function pickFolder(title: string, openLabel: string, defaultPath: string) {
  const picked = await vscode.window.showOpenDialog({
    title,
    openLabel,
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(defaultPath),
  });
  const folder = picked?.[0]?.fsPath;
  if (!folder) throw new IbpError("cancelled");
  return folder;
}

/** The IBP Studio editor tab. All privileged work happens here, in the extension host. */
export class StudioPanel implements vscode.Disposable {
  private static current: StudioPanel | undefined;
  private static readyWaiters: (() => void)[] = [];

  private readonly disposables: vscode.Disposable[] = [];

  static disposeCurrent(): void {
    StudioPanel.current?.dispose();
  }

  static show(deps: StudioDeps, view?: "create"): void {
    if (StudioPanel.current) {
      StudioPanel.current.panel.reveal();
    } else {
      const panel = vscode.window.createWebviewPanel(
        "ibp.studio",
        t("host.studioTitle"),
        vscode.ViewColumn.Active,
        { enableScripts: true, localResourceRoots: [deps.webviewRoot] },
      );
      StudioPanel.current = new StudioPanel(panel, deps);
    }
    if (view) StudioPanel.current.post({ type: "navigate", view });
  }

  /** Resolves once a Studio webview has loaded and said "ready" (used by integration tests). */
  static whenReady(): Promise<void> {
    return new Promise((resolve) => StudioPanel.readyWaiters.push(resolve));
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly deps: StudioDeps,
  ) {
    panel.iconPath = vscode.Uri.joinPath(deps.webviewRoot, "icon.svg");
    panel.webview.html = renderStudioHtml(panel.webview, deps.webviewRoot, readSettings().language);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((raw: unknown) => void this.onMessage(raw)),
      panel.onDidDispose(() => this.dispose()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("ibp")) return;
        panel.title = t("host.studioTitle");
        void this.pushState();
      }),
    );
  }

  dispose(): void {
    StudioPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables.splice(0)) d.dispose();
  }

  private post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private async onMessage(raw: unknown): Promise<void> {
    const parsed = webviewMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.deps.log.warn(`Rejected webview message: ${parsed.error.message}`);
      const requestId = requestIdOf(raw);
      if (requestId) {
        this.post({ type: "response", requestId, ok: false, error: { code: "invalid_message" } });
      }
      return;
    }
    const message = parsed.data;
    if (message.type === "ready") {
      for (const resolve of StudioPanel.readyWaiters.splice(0)) resolve();
      await this.pushState();
      return;
    }
    try {
      const projectId = await this.handle(message);
      this.post({
        type: "response",
        requestId: message.requestId,
        ok: true,
        ...(projectId ? { projectId } : {}),
      });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code !== "cancelled") this.deps.log.error(`${message.type}: ${String(error)}`);
      this.post({ type: "response", requestId: message.requestId, ok: false, error: appError });
    }
    await this.pushState();
  }

  /** Returns a project id when the request created or selected one. */
  private async handle(message: WebviewRequest): Promise<string | undefined> {
    const { service } = this.deps;
    switch (message.type) {
      case "projects/list":
        return undefined;

      case "projects/create": {
        const parent = await pickFolder(
          t("host.pickParent.title"),
          t("host.pickParent.button"),
          projectsRoot(),
        );
        const { project, git } = await service.create(parent, message.details);
        if (git.status === "no_identity")
          void vscode.window.showWarningMessage(t("host.created.noGitCommit"));
        if (git.status === "failed") {
          void vscode.window.showWarningMessage(
            t("host.created.gitFailed", { detail: git.detail }),
          );
        }
        return project.id;
      }

      case "projects/import": {
        const folder = await pickFolder(
          t("host.import.title"),
          t("host.import.button"),
          projectsRoot(),
        );
        const project = await service.import(folder, (dir) =>
          confirm(t("host.import.confirmWrite", { folder: dir }), t("host.continue")),
        );
        return project.id;
      }

      case "projects/open": {
        await this.openFolder(message.id);
        return message.id;
      }

      case "projects/openCode": {
        const project = await this.requireFolder(message.id);
        if (!(await this.isCurrentWorkspace(project.path))) {
          await this.openFolder(message.id);
          return message.id;
        }
        const entry = join(project.path, "src", "App.tsx");
        if (await exists(entry)) await vscode.window.showTextDocument(vscode.Uri.file(entry));
        else await vscode.commands.executeCommand("workbench.view.explorer");
        return message.id;
      }

      case "projects/installDeps": {
        const project = await this.requireFolder(message.id);
        const approved = await confirm(
          t("host.installDeps.confirm", { name: project.name }),
          t("host.installDeps.button"),
        );
        if (!approved) throw new IbpError("cancelled");
        // Fixed command, cwd from the registry: nothing from the webview reaches the shell.
        const terminal = vscode.window.createTerminal({
          name: t("host.terminal.install"),
          cwd: project.path,
        });
        terminal.show();
        terminal.sendText("npm install");
        return message.id;
      }

      case "projects/openTerminal": {
        const project = await this.requireFolder(message.id);
        vscode.window
          .createTerminal({
            name: t("host.terminal.project", { name: project.name }),
            cwd: project.path,
          })
          .show();
        return message.id;
      }

      case "projects/update":
        return (await service.update(message.id, message.details)).id;

      case "projects/setArchived":
        await service.setArchived(message.id, message.archived);
        return message.id;

      case "settings/update":
        await updateSetting(message.update); // the configuration listener pushes the new state
        return undefined;
    }
  }

  private async requireFolder(id: string) {
    const project = await this.deps.service.get(id);
    if (project.missing) throw new IbpError("folder_missing", project.path);
    return project;
  }

  private async isCurrentWorkspace(path: string): Promise<boolean> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return false;
    return (await this.deps.service.findByPath(folder.uri.fsPath))?.path === path;
  }

  private async openFolder(id: string): Promise<void> {
    const project = await this.requireFolder(id);
    await this.deps.service.markOpened(id);
    if (await this.isCurrentWorkspace(project.path)) return;
    // Reloads the window; activation on `.ibp/project.json` reopens the Studio afterwards.
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(project.path), {
      forceNewWindow: false,
    });
  }

  private async pushState(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const current = folder ? await this.deps.service.findByPath(folder.uri.fsPath) : undefined;
    this.post({
      type: "state",
      settings: readSettings(),
      projects: await this.deps.service.list(),
      currentProjectId: current?.id ?? null,
    });
  }
}
