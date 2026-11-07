import {
  translate,
  webviewMessageSchema,
  type MessageKey,
  type ProjectSummary,
  type WebviewRequest,
} from "@ibp/shared";
import { DevServerManager } from "./devServer";
import { IbpError, toAppError } from "./errors";
import type { HostPlatform } from "./HostPlatform";
import type { ProcessRunner } from "./process";
import type { ProjectService } from "./projects/ProjectService";

export interface StudioControllerOptions {
  host: HostPlatform;
  service: ProjectService;
  runner: ProcessRunner;
  env: () => Promise<NodeJS.ProcessEnv>;
  /** Overrides for tests. */
  preview?: { readyTimeoutMs?: number; pollIntervalMs?: number; npm?: string };
}

function requestIdOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null || !("requestId" in raw)) return undefined;
  const { requestId } = raw;
  return typeof requestId === "string" && requestId.length > 0 && requestId.length <= 64
    ? requestId
    : undefined;
}

/**
 * Handles every Studio request for any host. Messages are untrusted: they are validated
 * here before anything runs, and they carry project ids, never paths or URLs.
 */
export class StudioController {
  private readonly host: HostPlatform;
  private readonly service: ProjectService;
  private readonly preview: DevServerManager;
  private projects: ProjectSummary[] = [];
  private lastPreviewStatus: string = "stopped";
  private readyListeners: (() => void)[] = [];

  constructor(options: StudioControllerOptions) {
    this.host = options.host;
    this.service = options.service;
    this.preview = new DevServerManager({
      runner: options.runner,
      env: options.env,
      // Re-read projects when the status changes (e.g. node_modules exists after an install);
      // log-only updates reuse the cached list.
      onChange: (state) => {
        const changed = state.status !== this.lastPreviewStatus;
        this.lastPreviewStatus = state.status;
        void this.pushState(changed);
      },
      ...options.preview,
    });
  }

  /** Resolves when the Studio UI has loaded and said "ready". */
  whenReady(): Promise<void> {
    return new Promise((resolve) => this.readyListeners.push(resolve));
  }

  async dispose(): Promise<void> {
    await this.preview.stop();
  }

  async receive(raw: unknown): Promise<void> {
    const parsed = webviewMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.host.log("warn", `Rejected Studio message: ${parsed.error.message}`);
      const requestId = requestIdOf(raw);
      if (requestId) {
        this.host.post({
          type: "response",
          requestId,
          ok: false,
          error: { code: "invalid_message" },
        });
      }
      return;
    }
    const message = parsed.data;
    if (message.type === "ready") {
      for (const resolve of this.readyListeners.splice(0)) resolve();
      await this.pushState(true);
      return;
    }
    try {
      const projectId = await this.handle(message);
      this.host.post({
        type: "response",
        requestId: message.requestId,
        ok: true,
        ...(projectId ? { projectId } : {}),
      });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code !== "cancelled")
        this.host.log("error", `${message.type}: ${String(error)}`);
      this.host.post({
        type: "response",
        requestId: message.requestId,
        ok: false,
        error: appError,
      });
    }
    await this.pushState(!message.type.startsWith("preview/"));
  }

  /** Sends the full state; `refresh` re-reads projects from disk (skipped for preview updates). */
  async pushState(refresh = true): Promise<void> {
    if (refresh) this.projects = await this.service.list();
    const currentPath = this.host.currentProjectPath();
    const current = currentPath ? await this.service.findByPath(currentPath) : undefined;
    this.host.post({
      type: "state",
      settings: this.host.readSettings(),
      projects: this.projects,
      currentProjectId: current?.id ?? null,
      host: this.host.kind,
      capabilities: this.host.capabilities,
      preview: this.preview.state(),
    });
  }

  private t(key: MessageKey, params?: Record<string, string>): string {
    return translate(this.host.readSettings().language, key, params);
  }

  private async requireFolder(id: string): Promise<ProjectSummary> {
    const project = await this.service.get(id);
    if (project.missing) throw new IbpError("folder_missing", project.path);
    return project;
  }

  /** Returns a project id when the request created or selected one. */
  private async handle(message: WebviewRequest): Promise<string | undefined> {
    const { host, service, preview } = this;
    switch (message.type) {
      case "projects/list":
        return undefined;

      case "projects/create": {
        const parent = await host.pickFolder({
          title: this.t("host.pickParent.title"),
          button: this.t("host.pickParent.button"),
          defaultPath: host.projectsRoot(),
        });
        if (!parent) throw new IbpError("cancelled");
        const { project, git } = await service.create(parent, message.details, message.template);
        if (git.status === "no_identity")
          host.notify("warning", this.t("host.created.noGitCommit"));
        if (git.status === "failed") {
          host.notify("warning", this.t("host.created.gitFailed", { detail: git.detail }));
        }
        return project.id;
      }

      case "projects/import": {
        const folder = await host.pickFolder({
          title: this.t("host.import.title"),
          button: this.t("host.import.button"),
          defaultPath: host.projectsRoot(),
        });
        if (!folder) throw new IbpError("cancelled");
        const project = await service.import(folder, (dir) =>
          host.confirm(
            this.t("host.import.confirmWrite", { folder: dir }),
            this.t("host.continue"),
          ),
        );
        return project.id;
      }

      case "projects/open": {
        const project = await this.requireFolder(message.id);
        await service.markOpened(project.id);
        await host.openProject(project);
        return project.id;
      }

      case "projects/openCode":
        await host.openCode(await this.requireFolder(message.id));
        return message.id;

      case "projects/openTerminal":
        if (!host.capabilities.terminal)
          throw new IbpError("unknown", "terminal not available here");
        await host.openTerminal(await this.requireFolder(message.id));
        return message.id;

      case "projects/installDeps": {
        const project = await this.requireFolder(message.id);
        const approved = await host.confirm(
          this.t("host.installDeps.confirm", { name: project.name }),
          this.t("host.installDeps.button"),
        );
        if (!approved) throw new IbpError("cancelled");
        await preview.install(project);
        return project.id;
      }

      case "projects/update":
        return (await service.update(message.id, message.details)).id;

      case "projects/setArchived":
        await service.setArchived(message.id, message.archived);
        return message.id;

      case "settings/update":
        await host.updateSetting(message.update);
        return undefined;

      case "preview/start": {
        const project = await this.requireFolder(message.id);
        await preview.start(project);
        return project.id;
      }

      case "preview/stop":
        await preview.stop();
        return undefined;

      case "preview/restart": {
        const id = preview.state().projectId;
        if (!id) return undefined;
        await preview.start(await this.requireFolder(id));
        return id;
      }

      case "preview/openExternal": {
        const { url, status } = preview.state();
        if (url && status === "running") await host.openExternal(url);
        return undefined;
      }
    }
  }
}
