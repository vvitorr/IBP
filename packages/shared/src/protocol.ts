/**
 * Messages between the extension host (trusted) and the Studio webview (untrusted UI).
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
  }),
  z.strictObject({ type: z.literal("navigate"), view: z.enum(["create"]) }),
  responseSchema,
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;
export type StateMessage = Extract<HostMessage, { type: "state" }>;
export type ResponseMessage = Extract<HostMessage, { type: "response" }>;
