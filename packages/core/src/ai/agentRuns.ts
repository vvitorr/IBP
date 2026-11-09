import { join } from "node:path";
import {
  ContentGenerator,
  IbpAgent,
  Workspace,
  type AgentAdapter,
  type AgentEvent,
  type AgentIO,
  type ApprovalRequest,
  type CommandRunner,
} from "@ibp/agent";
import type {
  ChatMessageView,
  ErrorCode,
  HostMessage,
  Locale,
  ModelRef,
  ProjectSummary,
} from "@ibp/shared";
import { IbpError, toAppError } from "../errors";
import { exists } from "../fsutil";
import type { GitRunner } from "../projects/git";
import { toAiError, type AiService } from "./AiService";

export interface AgentRunsDeps {
  ai: AiService;
  commands: CommandRunner;
  git: GitRunner;
  post(message: HostMessage): void;
  pushChat(): void;
  language(): Locale;
}

interface Entry {
  workspace: Workspace;
  request: string;
  running: boolean;
  pending?: { id: string; resolve(approved: boolean): void };
}

const DELTA_CHARS = 20_000;
const PREVIEW_CHARS = 45_000;

/**
 * Coding-agent runs inside the Assistant: streams text, shows steps, holds approvals, and
 * keeps each run's workspace journal so its changes can be accepted (commit) or reverted.
 */
export class AgentRuns {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly deps: AgentRunsDeps) {}

  /** Coding-agent run on a project. Never throws (failures end up on the answer message). */
  start(
    answer: ChatMessageView,
    project: ProjectSummary,
    request: string,
    history: { role: "user" | "assistant"; content: string }[],
    model: "auto" | ModelRef,
    signal: AbortSignal,
  ): Promise<void> {
    const agent: AgentAdapter = new IbpAgent({
      model: (messages, tools, s) => this.deps.ai.chat("component", messages, model, s, tools),
      commands: this.deps.commands,
    });
    return this.runJob(answer, project, request, signal, "ai_no_tool_model", (workspace, io) =>
      agent.run(
        { workspace, stack: project.stack, request, language: this.deps.language(), history },
        io,
        signal,
      ),
    );
  }

  /** Writes the site's copy from the project description; reviewed like an agent run. */
  generate(
    answer: ChatMessageView,
    project: ProjectSummary,
    request: string,
    model: "auto" | ModelRef,
    signal: AbortSignal,
  ): Promise<void> {
    const generator = new ContentGenerator((messages, s) =>
      this.deps.ai.chat("copy", messages, model, s),
    );
    const details = {
      name: project.name,
      client: project.client,
      industry: project.industry,
      description: project.description,
    };
    return this.runJob(answer, project, request, signal, "ai_no_model", (workspace, io) =>
      generator.run({ workspace, details, language: this.deps.language() }, io, signal),
    );
  }

  private async runJob(
    answer: ChatMessageView,
    project: ProjectSummary,
    request: string,
    signal: AbortSignal,
    noModelCode: ErrorCode,
    job: (
      workspace: Workspace,
      io: AgentIO,
    ) => Promise<{ summary: string; stoppedAtLimit: boolean }>,
  ): Promise<void> {
    const run = {
      projectId: project.id,
      status: "running" as const,
      steps: [],
      approval: null,
      changes: [],
      stoppedAtLimit: false,
      notice: null,
    };
    answer.run = run;
    let workspace: Workspace;
    try {
      workspace = await Workspace.open(project.path);
    } catch (error) {
      answer.run = { ...run, status: "failed" };
      answer.error = toAppError(error);
      return;
    }
    const entry: Entry = { workspace, request, running: true };
    this.entries.set(answer.id, entry);

    try {
      const result = await job(workspace, {
        emit: (event) => this.onEvent(answer, event),
        approve: (req) => this.askApproval(answer, entry, req, signal),
      });
      answer.run = { ...answer.run, status: "done", stoppedAtLimit: result.stoppedAtLimit };
      if (!answer.content.trim() && result.summary) answer.content = result.summary;
    } catch (raw) {
      answer.run = { ...answer.run, status: signal.aborted ? "stopped" : "failed" };
      let error = toAiError(raw);
      if (error.code === "ai_no_model") error = new IbpError(noModelCode, error.message);
      const appError = toAppError(error);
      if (appError.code !== "cancelled") answer.error = appError;
    } finally {
      entry.running = false;
      entry.pending = undefined;
      const changes = await workspace.changes().catch(() => answer.run?.changes ?? []);
      answer.run = { ...answer.run, approval: null, changes };
      if (!changes.length) this.entries.delete(answer.id); // nothing to review
    }
  }

  approve(messageId: string, approvalId: string, approved: boolean): void {
    const pending = this.entries.get(messageId)?.pending;
    if (pending?.id !== approvalId) throw new IbpError("invalid_message", "no such approval");
    pending.resolve(approved);
  }

  /** Commits only the files this run touched (when the project uses Git). */
  async accept(answer: ChatMessageView): Promise<void> {
    const entry = this.reviewable(answer);
    const paths = (await entry.workspace.changes()).map((c) => c.path);
    const root = entry.workspace.root;
    let notice: "accepted_commit" | "accepted_no_git" = "accepted_no_git";
    if (paths.length && (await exists(join(root, ".git")))) {
      const email = await this.deps.git(["config", "user.email"], root);
      const name = await this.deps.git(["config", "user.name"], root);
      if (!email.ok || !name.ok) throw new IbpError("git_no_identity");
      const add = await this.deps.git(["add", "-A", "--", ...paths], root);
      if (!add.ok) throw new IbpError("git_failed", add.stderr);
      const subject = entry.request.split("\n")[0]?.trim().slice(0, 60) || "changes";
      // `-- paths` commits only these files, never other changes the user had staged.
      const commit = await this.deps.git(["commit", "-m", `ibp: ${subject}`, "--", ...paths], root);
      if (!commit.ok) throw new IbpError("git_failed", commit.stderr);
      notice = "accepted_commit";
    }
    answer.run = { ...(answer.run ?? this.missing()), status: "accepted", notice };
    this.entries.delete(answer.id);
  }

  async revert(answer: ChatMessageView): Promise<void> {
    const entry = this.reviewable(answer);
    await entry.workspace.revert();
    answer.run = { ...(answer.run ?? this.missing()), status: "reverted", notice: "reverted" };
    this.entries.delete(answer.id);
  }

  private reviewable(answer: ChatMessageView): Entry {
    const entry = this.entries.get(answer.id);
    if (!entry || entry.running || !answer.run)
      throw new IbpError("invalid_message", "nothing to review");
    return entry;
  }

  private missing(): never {
    throw new IbpError("invalid_message", "not an agent answer");
  }

  private onEvent(answer: ChatMessageView, event: AgentEvent): void {
    const run = answer.run;
    if (!run) return;
    switch (event.type) {
      case "text":
        answer.content += event.text;
        for (let i = 0; i < event.text.length; i += DELTA_CHARS) {
          this.deps.post({
            type: "chat/delta",
            messageId: answer.id,
            text: event.text.slice(i, i + DELTA_CHARS),
          });
        }
        return;
      case "route":
        answer.model = { providerId: event.providerId, modelId: event.modelId };
        break;
      case "step": {
        const steps = run.steps.filter((s) => s.id !== event.step.id);
        const index = run.steps.findIndex((s) => s.id === event.step.id);
        steps.splice(index === -1 ? steps.length : index, 0, {
          ...event.step,
          target: event.step.target.slice(0, 500),
          ...(event.step.detail ? { detail: event.step.detail.slice(0, 2000) } : {}),
        });
        answer.run = { ...run, steps: steps.slice(-300) };
        break;
      }
      case "changes":
        answer.run = { ...run, changes: event.changes };
        break;
    }
    this.deps.pushChat();
  }

  private askApproval(
    answer: ChatMessageView,
    entry: Entry,
    request: ApprovalRequest,
    signal: AbortSignal,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (approved: boolean) => {
        if (!entry.pending) return;
        entry.pending = undefined;
        if (answer.run) answer.run = { ...answer.run, approval: null };
        this.deps.pushChat();
        resolve(approved);
      };
      entry.pending = { id: request.id, resolve: done };
      if (answer.run) {
        answer.run = {
          ...answer.run,
          approval: {
            ...request,
            target: request.target.slice(0, 500),
            preview: request.preview.slice(0, PREVIEW_CHARS),
          },
        };
      }
      signal.addEventListener("abort", () => done(false), { once: true });
      this.deps.pushChat();
    });
  }
}
