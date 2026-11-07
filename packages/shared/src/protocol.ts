/**
 * Messages between the host (VS Code extension or desktop main process, trusted) and the Studio
 * UI (untrusted).
 * Both sides validate every message with these schemas before acting on it.
 * The webview sends project ids, never file paths: folders are always chosen host-side.
 */
import { z } from "zod";
import { LOCALES, type MessageKey } from "./i18n/index.ts";

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

const withId = <T extends string>(type: T) =>
  z.strictObject({ type: z.literal(type), requestId: requestIdSchema, id: projectIdSchema });

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
]);
export type WebviewMessage = z.infer<typeof webviewMessageSchema>;
export type WebviewRequest = Exclude<WebviewMessage, { type: "ready" }>;

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
  unknown: "error.unknown",
};

export const appErrorSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  detail: z.string().max(4000).optional(),
});
export type AppError = z.infer<typeof appErrorSchema>;

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
  responseSchema,
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;
export type StateMessage = Extract<HostMessage, { type: "state" }>;
export type ResponseMessage = Extract<HostMessage, { type: "response" }>;
