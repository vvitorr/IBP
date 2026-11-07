import * as vscode from "vscode";
import { translate } from "@ibp/shared";
import {
  nodeProcessRunner,
  resolveShellEnv,
  StudioController,
  type ProjectService,
} from "@ibp/core";
import { readSettings } from "../config";
import { createVsCodeHost } from "../vscodeHost";
import { renderStudioHtml } from "./html";

export interface StudioDeps {
  service: ProjectService;
  /** dist/webview inside the extension: the only folder the webview may load files from. */
  webviewRoot: vscode.Uri;
  log: vscode.LogOutputChannel;
}

const title = () => translate(readSettings().language, "host.studioTitle");

/** The IBP Studio editor tab. Request handling lives in the shared StudioController. */
export class StudioPanel {
  private static current: StudioPanel | undefined;
  private static readyWaiters: (() => void)[] = [];

  private readonly controller: StudioController;
  private readonly disposables: vscode.Disposable[] = [];

  static show(deps: StudioDeps, view?: "create"): void {
    if (StudioPanel.current) {
      StudioPanel.current.panel.reveal();
    } else {
      const panel = vscode.window.createWebviewPanel(
        "ibp.studio",
        title(),
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [deps.webviewRoot],
        },
      );
      StudioPanel.current = new StudioPanel(panel, deps);
    }
    if (view) void StudioPanel.current.panel.webview.postMessage({ type: "navigate", view });
  }

  static disposeCurrent(): void {
    StudioPanel.current?.dispose();
  }

  /** Resolves once a Studio webview has loaded and said "ready" (used by integration tests). */
  static whenReady(): Promise<void> {
    return new Promise((resolve) => StudioPanel.readyWaiters.push(resolve));
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    deps: StudioDeps,
  ) {
    this.controller = new StudioController({
      host: createVsCodeHost(panel, deps.log),
      service: deps.service,
      runner: nodeProcessRunner,
      env: resolveShellEnv,
    });
    void this.controller.whenReady().then(() => {
      for (const resolve of StudioPanel.readyWaiters.splice(0)) resolve();
    });

    panel.iconPath = vscode.Uri.joinPath(deps.webviewRoot, "icon.svg");
    panel.webview.html = renderStudioHtml(panel.webview, deps.webviewRoot, readSettings().language);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((raw: unknown) => void this.controller.receive(raw)),
      panel.onDidDispose(() => this.dispose()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("ibp")) return;
        panel.title = title();
        void this.controller.pushState(false);
      }),
    );
  }

  dispose(): void {
    StudioPanel.current = undefined;
    void this.controller.dispose(); // stops the dev server, if any
    this.panel.dispose();
    for (const d of this.disposables.splice(0)) d.dispose();
  }
}
