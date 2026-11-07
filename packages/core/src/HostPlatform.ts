import type {
  Capabilities,
  HostKind,
  HostMessage,
  ProjectSummary,
  Settings,
  SettingUpdate,
} from "@ibp/shared";

/**
 * What a host (VS Code extension or desktop app) must provide to run the Studio.
 * Everything else — validation, project rules, dev servers — lives in StudioController,
 * so both hosts behave the same.
 */
export interface HostPlatform {
  readonly kind: HostKind;
  readonly capabilities: Capabilities;

  /** Sends a message to the Studio UI. */
  post(message: HostMessage): void;
  log(level: "info" | "warn" | "error", message: string): void;

  readSettings(): Settings;
  updateSetting(update: SettingUpdate): Promise<void>;
  /** Default folder suggested for new projects. */
  projectsRoot(): string;

  pickFolder(options: {
    title: string;
    button: string;
    defaultPath: string;
  }): Promise<string | undefined>;
  /** Modal yes/no for high-risk actions. */
  confirm(message: string, action: string): Promise<boolean>;
  notify(level: "info" | "warning", message: string): void;

  /** Folder of the project currently open in this window, if any. */
  currentProjectPath(): string | undefined;
  openProject(project: ProjectSummary): Promise<void>;
  openCode(project: ProjectSummary): Promise<void>;
  /** Only called when `capabilities.terminal` is true. */
  openTerminal(project: ProjectSummary): Promise<void>;
  /** Opens a URL in the user's browser. Only called with the running preview's loopback URL. */
  openExternal(url: string): Promise<void>;
}
