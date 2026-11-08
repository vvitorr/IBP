import { randomUUID } from "node:crypto";
import {
  translate,
  webviewMessageSchema,
  type ChatMessageView,
  type MessageKey,
  type ModelRef,
  type ProjectSummary,
  type WebviewRequest,
} from "@ibp/shared";
import { AiService, toAiError } from "./ai/AiService";
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
  fetch?: typeof fetch;
}

const CHAT_HISTORY = 200;

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
  private readonly ai: AiService;
  private readonly aiReady: Promise<void>;
  private chat: ChatMessageView[] = [];
  private chatAbort: AbortController | undefined;

  constructor(options: StudioControllerOptions) {
    this.host = options.host;
    this.service = options.service;
    this.ai = new AiService({
      dataDir: options.host.dataDir,
      secrets: options.host.secrets,
      log: (m) => options.host.log("warn", m),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    this.aiReady = this.ai.load().catch((error: unknown) => {
      options.host.log("error", `AI settings: ${String(error)}`);
    });
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
    this.chatAbort?.abort();
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
      await this.pushAi();
      this.pushChat();
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
    if (message.type.startsWith("ai/")) await this.pushAi();
    else if (message.type.startsWith("chat/")) this.pushChat();
    else await this.pushState(!message.type.startsWith("preview/"));
  }

  async pushAi(): Promise<void> {
    await this.aiReady;
    this.host.post({ type: "ai/state", ai: await this.ai.view() });
  }

  private pushChat(): void {
    this.host.post({
      type: "chat/state",
      chat: { messages: this.chat, streaming: this.chatAbort !== undefined },
    });
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

      default:
        await this.aiReady;
        return this.handleAi(message);
    }
  }

  private async handleAi(message: WebviewRequest): Promise<undefined> {
    const { ai } = this;
    switch (message.type) {
      case "ai/provider/add":
        await ai.addProvider(message.preset);
        break;
      case "ai/provider/update":
        await ai.updateProvider(message.providerId, {
          ...(message.name !== undefined ? { name: message.name } : {}),
          ...(message.baseUrl !== undefined ? { baseUrl: message.baseUrl } : {}),
          ...(message.enabled !== undefined ? { enabled: message.enabled } : {}),
        });
        break;
      case "ai/provider/remove": {
        const provider = (await ai.view()).providers.find((p) => p.id === message.providerId);
        const approved = await this.host.confirm(
          this.t("ai.provider.removeConfirm", { name: provider?.name ?? "" }),
          this.t("ai.provider.remove"),
        );
        if (!approved) throw new IbpError("cancelled");
        await ai.removeProvider(message.providerId);
        break;
      }
      case "ai/provider/setKey":
        await ai.setKey(message.providerId, message.key);
        break;
      case "ai/provider/clearKey":
        await ai.clearKey(message.providerId);
        break;
      case "ai/provider/test":
        await ai.test(message.providerId);
        break;
      case "ai/model/probe":
        await ai.probe(message.providerId, message.modelId);
        break;
      case "ai/preferences/set":
        await ai.setPreferences(message.order);
        break;
      case "chat/send":
        await this.startChat(message.text, message.model, message.projectId);
        break;
      case "chat/stop":
        this.chatAbort?.abort();
        break;
      case "chat/clear":
        this.chatAbort?.abort();
        this.chat = [];
        break;
    }
    return undefined;
  }

  private async startChat(text: string, model: "auto" | ModelRef, projectId: string | null) {
    if (this.chatAbort) throw new IbpError("ai_busy");
    const project = projectId
      ? await this.service.get(projectId).catch(() => undefined)
      : undefined;
    const at = new Date().toISOString();
    const user: ChatMessageView = {
      id: randomUUID(),
      role: "user",
      content: text,
      model: null,
      at,
    };
    const answer: ChatMessageView = {
      id: randomUUID(),
      role: "assistant",
      content: "",
      model: null,
      at,
    };
    // Earlier failed answers are not sent back to the model.
    const history = this.chat
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    this.chat = [...this.chat, user, answer].slice(-CHAT_HISTORY);
    this.chatAbort = new AbortController();
    this.pushChat();

    const system = this.t("chat.system", {
      project: project
        ? this.t("chat.systemProject", { name: project.name, stack: project.stack })
        : "",
    });
    void this.runChat(
      answer,
      [{ role: "system", content: system }, ...history, { role: "user", content: text }],
      model,
      this.chatAbort.signal,
    );
  }

  private async runChat(
    answer: ChatMessageView,
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    model: "auto" | ModelRef,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      for await (const chunk of this.ai.chat("chat", messages, model, signal)) {
        if (chunk.type === "route") {
          answer.model = { providerId: chunk.providerId, modelId: chunk.modelId };
          answer.content = "";
          this.pushChat();
        } else if (chunk.type === "text") {
          answer.content += chunk.text;
          this.host.post({ type: "chat/delta", messageId: answer.id, text: chunk.text });
        }
      }
    } catch (raw) {
      const error = toAppError(toAiError(raw));
      if (error.code !== "cancelled") answer.error = error;
    } finally {
      this.chatAbort = undefined;
      this.pushChat();
      await this.pushAi(); // usage and cooldowns changed
    }
  }
}
