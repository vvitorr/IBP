import type {
  Capabilities,
  HostKind,
  HostMessage,
  ProjectSummary,
  Settings,
  SettingUpdate,
} from "@ibp/shared";
import type { SecretVault } from "./ai/AiService";

/**
 * What a host (VS Code extension or desktop app) must provide to run the Studio.
 * Everything else — validation, project rules, dev servers — lives in StudioController,
 * so both hosts behave the same.
 */
export interface HostPlatform {
  readonly kind: HostKind;
  readonly capabilities: Capabilities;
  /** Folder for IBP's own data files (AI settings, usage). Never inside a user project. */
  readonly dataDir: string;
  /** API keys: OS keychain-backed storage, never a plain file. */
  readonly secrets: SecretVault;

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
  pickFile(options: { title: string; button: string; filters: { name: string; extensions: string[] }[] }): Promise<string | undefined>;
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
