/**
 * Messages between the host (VS Code extension or desktop main process, trusted) and the Studio
 * UI (untrusted).
 * Both sides validate every message with these schemas before acting on it.
 * The webview sends project ids, never file paths: folders are always chosen host-side.
 */
import { z } from "zod";
import { LOCALES, type MessageKey } from "./i18n/index.ts";
import { siteContentSchema } from "./site.ts";

export const MODES = ["beginner", "developer"] as const;
export const THEMES = ["auto", "dark", "light"] as const;
export const INDUSTRIES = [
  "restaurant",
  "cafe",
  "professional-services",
  "automotive",
  "construction",
  "healthcare",
  "retail",
  "corporate",
  "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** Starter templates; each one is a folder under templates/ (plus templates/shared). */
export const TEMPLATE_IDS = ["base-vite-react", "base-next"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const projectIdSchema = z.uuid();
const requestIdSchema = z.string().min(1).max(64);

export const projectDetailsSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  client: z.string().trim().max(80),
  industry: z.enum(INDUSTRIES),
  description: z.string().trim().max(2000),
});
export type ProjectDetails = z.infer<typeof projectDetailsSchema>;

export const settingsSchema = z.strictObject({
  language: z.enum(LOCALES),
  mode: z.enum(MODES),
  theme: z.enum(THEMES),
});
export type Settings = z.infer<typeof settingsSchema>;

/** Only these settings may be changed from the webview; `projectsRoot` (a path) is not one of them. */
export const settingUpdateSchema = z.discriminatedUnion("key", [
  z.strictObject({ key: z.literal("language"), value: z.enum(LOCALES) }),
  z.strictObject({ key: z.literal("mode"), value: z.enum(MODES) }),
  z.strictObject({ key: z.literal("theme"), value: z.enum(THEMES) }),
]);
export type SettingUpdate = z.infer<typeof settingUpdateSchema>;

export const ERROR_CODES = [
  "cancelled",
  "invalid_message",
  "project_not_found",
  "folder_exists",
  "invalid_name",
  "not_react_project",
  "already_registered",
  "folder_missing",
  "invalid_metadata",
  "io_error",
  "deps_missing",
  "install_failed",
  "preview_failed",
  "preview_unsupported",
  "command_not_found",
  "ai_no_model",
  "ai_auth",
  "ai_rate_limited",
  "ai_unavailable",
  "ai_bad_request",
  "ai_all_failed",
  "ai_interrupted",
  "ai_invalid_url",
  "ai_busy",
  "secret_storage_unavailable",
  "ai_no_tool_model",
  "git_no_identity",
  "git_failed",
  "content_invalid",
  "image_invalid",
  "unknown",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Friendly message per error code; `detail` carries the technical explanation. */
export const ERROR_MESSAGE_KEYS: Record<ErrorCode, MessageKey> = {
  cancelled: "error.cancelled",
  invalid_message: "error.invalidMessage",
  project_not_found: "error.projectNotFound",
  folder_exists: "error.folderExists",
  invalid_name: "error.invalidName",
  not_react_project: "error.notReactProject",
  already_registered: "error.alreadyRegistered",
  folder_missing: "error.folderMissing",
  invalid_metadata: "error.invalidMetadata",
  io_error: "error.io",
  deps_missing: "error.depsMissing",
  install_failed: "error.installFailed",
  preview_failed: "error.previewFailed",
  preview_unsupported: "error.previewUnsupported",
  command_not_found: "error.commandNotFound",
  ai_no_model: "error.aiNoModel",
  ai_auth: "error.aiAuth",
  ai_rate_limited: "error.aiRateLimited",
  ai_unavailable: "error.aiUnavailable",
  ai_bad_request: "error.aiBadRequest",
  ai_all_failed: "error.aiAllFailed",
  ai_interrupted: "error.aiInterrupted",
  ai_invalid_url: "error.aiInvalidUrl",
  ai_busy: "error.aiBusy",
  secret_storage_unavailable: "error.secretStorageUnavailable",
  ai_no_tool_model: "error.aiNoToolModel",
  git_no_identity: "error.gitNoIdentity",
  git_failed: "error.gitFailed",
  content_invalid: "error.contentInvalid",
  image_invalid: "error.imageInvalid",
  unknown: "error.unknown",
};

export const appErrorSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  detail: z.string().max(4000).optional(),
});
export type AppError = z.infer<typeof appErrorSchema>;

// --- AI settings and chat. API keys never appear in these schemas: only `hasKey`. ---

export const PROVIDER_PRESETS = [
  "openrouter",
  "ollama",
  "lmstudio",
  "freellmapi",
  "custom",
] as const;
export type ProviderPreset = (typeof PROVIDER_PRESETS)[number];

export const TRISTATES = ["yes", "no", "unknown"] as const;
export const SECURE_STORAGE = ["os", "weak", "unavailable"] as const;
export type SecureStorageStatus = (typeof SECURE_STORAGE)[number];

export const providerIdSchema = z.string().regex(/^p-[a-f0-9]{12}$/);
export const modelIdSchema = z.string().min(1).max(200);
export const modelRefSchema = z.strictObject({
  providerId: providerIdSchema,
  modelId: modelIdSchema,
});
export type ModelRef = z.infer<typeof modelRefSchema>;

export const modelViewSchema = z.strictObject({
  id: modelIdSchema,
  contextWindow: z.number().int().positive().nullable(),
  tools: z.enum(TRISTATES),
  streaming: z.enum(TRISTATES),
  free: z.boolean().nullable(),
  probedAt: z.string().nullable(),
});
export type ModelView = z.infer<typeof modelViewSchema>;

export const providerViewSchema = z.strictObject({
  id: providerIdSchema,
  preset: z.enum(PROVIDER_PRESETS),
  name: z.string().max(80),
  baseUrl: z.string().max(500),
  enabled: z.boolean(),
  keyRequired: z.boolean(),
  hasKey: z.boolean(),
  health: z.strictObject({
    status: z.enum(["unknown", "ok", "error"]),
    checkedAt: z.string().nullable(),
    latencyMs: z.number().nullable(),
    error: appErrorSchema.optional(),
  }),
  cooldownUntil: z.string().nullable(),
  models: z.array(modelViewSchema).max(5000),
});
export type ProviderView = z.infer<typeof providerViewSchema>;

export const usageRowSchema = z.strictObject({
  providerId: z.string().max(40),
  modelId: modelIdSchema,
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
});
export type UsageRow = z.infer<typeof usageRowSchema>;

export const aiStateSchema = z.strictObject({
  providers: z.array(providerViewSchema).max(50),
  preferences: z.array(modelRefSchema).max(50),
  secureStorage: z.enum(SECURE_STORAGE),
  usageToday: z.array(usageRowSchema).max(500),
});
export type AiState = z.infer<typeof aiStateSchema>;

// --- Coding agent (Phase 3). Steps, approvals and file changes shown in the Assistant. ---
export const AGENT_TOOLS = [
  "list_files",
  "read_file",
  "search",
  "write_file",
  "edit_file",
  "delete_file",
  "run_check",
  "install_package",
  "finish",
  "generate_content",
  "unknown",
] as const;

export const agentStepSchema = z.strictObject({
  id: z.string().min(1).max(64),
  tool: z.enum(AGENT_TOOLS),
  target: z.string().max(500),
  status: z.enum(["running", "done", "failed", "denied"]),
  detail: z.string().max(2000).optional(),
});
export type AgentStepView = z.infer<typeof agentStepSchema>;

export const fileChangeSchema = z.strictObject({
  path: z.string().max(500),
  kind: z.enum(["created", "modified", "deleted"]),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  diff: z.string().max(45_000),
});
export type FileChangeView = z.infer<typeof fileChangeSchema>;

export const agentApprovalSchema = z.strictObject({
  id: z.string().min(1).max(64),
  tool: z.enum(AGENT_TOOLS),
  target: z.string().max(500),
  preview: z.string().max(45_000),
});

export const AGENT_RUN_STATUSES = [
  "running",
  "done",
  "failed",
  "stopped",
  "accepted",
  "reverted",
] as const;

export const agentRunSchema = z.strictObject({
  projectId: projectIdSchema,
  status: z.enum(AGENT_RUN_STATUSES),
  steps: z.array(agentStepSchema).max(300),
  approval: agentApprovalSchema.nullable(),
  changes: z.array(fileChangeSchema).max(200),
  stoppedAtLimit: z.boolean(),
  notice: z.enum(["accepted_commit", "accepted_no_git", "reverted"]).nullable(),
});
export type AgentRunView = z.infer<typeof agentRunSchema>;

export const chatMessageSchema = z.strictObject({
  id: z.string().min(1).max(64),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(200_000),
  model: modelRefSchema.nullable(),
  at: z.string(),
  error: appErrorSchema.optional(),
  run: agentRunSchema.optional(),
});
export type ChatMessageView = z.infer<typeof chatMessageSchema>;

export const chatStateSchema = z.strictObject({
  messages: z.array(chatMessageSchema).max(500),
  streaming: z.boolean(),
});
export type ChatState = z.infer<typeof chatStateSchema>;

const withId = <T extends string>(type: T) =>
  z.strictObject({ type: z.literal(type), requestId: requestIdSchema, id: projectIdSchema });
const withProvider = <T extends string>(type: T) =>
  z.strictObject({
    type: z.literal(type),
    requestId: requestIdSchema,
    providerId: providerIdSchema,
  });

export const webviewMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready") }),
  z.strictObject({ type: z.literal("projects/list"), requestId: requestIdSchema }),
  z.strictObject({
    type: z.literal("projects/create"),
    requestId: requestIdSchema,
    details: projectDetailsSchema,
    template: z.enum(TEMPLATE_IDS),
  }),
  z.strictObject({ type: z.literal("projects/import"), requestId: requestIdSchema }),
  withId("projects/open"),
  z.strictObject({
    type: z.literal("projects/update"),
    requestId: requestIdSchema,
    id: projectIdSchema,
    details: projectDetailsSchema,
  }),
  z.strictObject({
    type: z.literal("projects/setArchived"),
    requestId: requestIdSchema,
    id: projectIdSchema,
    archived: z.boolean(),
  }),
  withId("projects/installDeps"),
  withId("projects/openCode"),
  withId("projects/openTerminal"),
  z.strictObject({
    type: z.literal("settings/update"),
    requestId: requestIdSchema,
    update: settingUpdateSchema,
  }),
  withId("preview/start"),
  z.strictObject({ type: z.literal("preview/stop"), requestId: requestIdSchema }),
  z.strictObject({ type: z.literal("preview/restart"), requestId: requestIdSchema }),
  // Opens the running preview's own URL; the webview never supplies a URL.
  z.strictObject({ type: z.literal("preview/openExternal"), requestId: requestIdSchema }),

  // AI providers. The key travels once, from the Studio to the host's secret storage.
  z.strictObject({
    type: z.literal("ai/provider/add"),
    requestId: requestIdSchema,
    preset: z.enum(PROVIDER_PRESETS),
  }),
  z.strictObject({
    type: z.literal("ai/provider/update"),
    requestId: requestIdSchema,
    providerId: providerIdSchema,
    name: z.string().trim().min(1).max(80).optional(),
    baseUrl: z.string().trim().max(500).optional(),
    enabled: z.boolean().optional(),
  }),
  withProvider("ai/provider/remove"),
  z.strictObject({
    type: z.literal("ai/provider/setKey"),
    requestId: requestIdSchema,
    providerId: providerIdSchema,
    key: z.string().trim().min(1).max(1000),
  }),
  withProvider("ai/provider/clearKey"),
  withProvider("ai/provider/test"),
  z.strictObject({
    type: z.literal("ai/model/probe"),
    requestId: requestIdSchema,
    providerId: providerIdSchema,
    modelId: modelIdSchema,
  }),
  z.strictObject({
    type: z.literal("ai/preferences/set"),
    requestId: requestIdSchema,
    order: z.array(modelRefSchema).max(50),
  }),

  // Chat
  z.strictObject({
    type: z.literal("chat/send"),
    requestId: requestIdSchema,
    text: z.string().trim().min(1).max(20_000),
    model: z.union([z.literal("auto"), modelRefSchema]),
    projectId: projectIdSchema.nullable(),
  }),
  z.strictObject({ type: z.literal("chat/stop"), requestId: requestIdSchema }),
  z.strictObject({ type: z.literal("chat/clear"), requestId: requestIdSchema }),

  // Coding agent: answer an approval card; accept (commit) or revert a finished run.
  z.strictObject({
    type: z.literal("agent/approve"),
    requestId: requestIdSchema,
    messageId: z.string().min(1).max(64),
    approvalId: z.string().min(1).max(64),
    approved: z.boolean(),
  }),
  // Content editor: read/save site.json (validated) and import an image picked host-side.
  withId("site/get"),
  z.strictObject({
    type: z.literal("site/save"),
    requestId: requestIdSchema,
    id: projectIdSchema,
    content: siteContentSchema,
  }),
  withId("site/image"),
  // Writes the site's copy from the project description (reviewed like an agent run).
  z.strictObject({
    type: z.literal("site/generate"),
    requestId: requestIdSchema,
    id: projectIdSchema,
    model: z.union([z.literal("auto"), modelRefSchema]),
  }),
  z.strictObject({
    type: z.literal("agent/accept"),
    requestId: requestIdSchema,
    messageId: z.string().min(1).max(64),
  }),
  z.strictObject({
    type: z.literal("agent/revert"),
    requestId: requestIdSchema,
    messageId: z.string().min(1).max(64),
  }),
]);
export type WebviewMessage = z.infer<typeof webviewMessageSchema>;
export type WebviewRequest = Exclude<WebviewMessage, { type: "ready" }>;

export const projectSummarySchema = z.strictObject({
  ...projectDetailsSchema.shape,
  id: projectIdSchema,
  path: z.string(),
  stack: z.string(),
  createdAt: z.string(),
  lastModified: z.string().nullable(),
  hasGit: z.boolean(),
  dependenciesInstalled: z.boolean(),
  archived: z.boolean(),
  missing: z.boolean(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const PREVIEW_STATUSES = ["stopped", "installing", "starting", "running", "error"] as const;
export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];
export const PREVIEW_LOG_LINES = 200;

/** Dev servers only ever listen on loopback; anything else is rejected. */
export const previewUrlSchema = z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}\/$/);

export const previewStateSchema = z.strictObject({
  projectId: projectIdSchema.nullable(),
  status: z.enum(PREVIEW_STATUSES),
  url: previewUrlSchema.nullable(),
  log: z.array(z.string().max(2000)).max(PREVIEW_LOG_LINES),
  error: appErrorSchema.optional(),
});
export type PreviewState = z.infer<typeof previewStateSchema>;

export const HOST_KINDS = ["vscode", "desktop"] as const;
export type HostKind = (typeof HOST_KINDS)[number];

export const capabilitiesSchema = z.strictObject({ terminal: z.boolean() });
export type Capabilities = z.infer<typeof capabilitiesSchema>;

const responseSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    type: z.literal("response"),
    requestId: requestIdSchema,
    ok: z.literal(true),
    projectId: projectIdSchema.optional(),
    /** Extra result of some requests, e.g. the /images/… path of an imported image. */
    value: z.string().max(500).optional(),
  }),
  z.strictObject({
    type: z.literal("response"),
    requestId: requestIdSchema,
    ok: z.literal(false),
    error: appErrorSchema,
  }),
]);

export const hostMessageSchema = z.union([
  z.strictObject({
    type: z.literal("state"),
    settings: settingsSchema,
    projects: z.array(projectSummarySchema),
    currentProjectId: projectIdSchema.nullable(),
    host: z.enum(HOST_KINDS),
    capabilities: capabilitiesSchema,
    preview: previewStateSchema,
  }),
  z.strictObject({ type: z.literal("navigate"), view: z.enum(["create"]) }),
  z.strictObject({ type: z.literal("ai/state"), ai: aiStateSchema }),
  z.strictObject({
    type: z.literal("site/content"),
    projectId: projectIdSchema,
    content: siteContentSchema.nullable(),
  }),
  z.strictObject({ type: z.literal("chat/state"), chat: chatStateSchema }),
  // Streamed tokens of one assistant message, appended by the Studio.
  z.strictObject({
    type: z.literal("chat/delta"),
    messageId: z.string().min(1).max(64),
    text: z.string().max(20_000),
  }),
  responseSchema,
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;
export type StateMessage = Extract<HostMessage, { type: "state" }>;
export type ResponseMessage = Extract<HostMessage, { type: "response" }>;
