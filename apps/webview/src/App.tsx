import { useEffect, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import {
  DEFAULT_LOCALE,
  type AiState,
  type AppError,
  type ChatState,
  type PreviewState,
  type Settings,
  type StateMessage,
  translate,
} from "@ibp/shared";
import { CreateProject } from "./components/CreateProject";
import { ChatPanel } from "./components/ChatPanel";
import { ContentEditor } from "./components/ContentEditor";
import { ErrorNotice } from "./components/ErrorNotice";
import { PreviewPane } from "./components/PreviewPane";
import { ProjectList } from "./components/ProjectList";
import { ProjectOverview } from "./components/ProjectOverview";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SettingsView } from "./components/SettingsView";
import { TopBar } from "./components/TopBar";
import { layoutStorage, onHostMessage, request, sendReady, type RequestInput } from "./host";
import { LocaleContext } from "./i18n";

const DEFAULT_SETTINGS: Settings = { language: DEFAULT_LOCALE, mode: "beginner", theme: "dark" };

const IDLE_PREVIEW: PreviewState = { projectId: null, status: "stopped", url: null, log: [] };
const lightQuery = window.matchMedia("(prefers-color-scheme: light)");

/** In VS Code the theme is a class on <body>; in the desktop app it is the OS setting. */
function isHostLight(): boolean {
  const classes = document.body.classList;
  if ([...classes].some((c) => c.startsWith("vscode-"))) {
    return classes.contains("vscode-light") || classes.contains("vscode-high-contrast-light");
  }
  return lightQuery.matches;
}

/** "auto" follows the host theme. */
function useResolvedTheme(theme: Settings["theme"]): "dark" | "light" {
  const [hostLight, setHostLight] = useState(isHostLight);
  useEffect(() => {
    const update = () => setHostLight(isHostLight());
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    lightQuery.addEventListener("change", update);
    return () => {
      observer.disconnect();
      lightQuery.removeEventListener("change", update);
    };
  }, []);
  if (theme !== "auto") return theme;
  return hostLight ? "light" : "dark";
}

const separatorClass = "w-px bg-line transition-colors hover:bg-accent focus-visible:bg-accent";

export function App() {
  const [state, setState] = useState<StateMessage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"preview" | "content" | "project">("preview");
  const [leftTab, setLeftTab] = useState<"projects" | "chat">("projects");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ai, setAi] = useState<AiState | null>(null);
  const [chat, setChat] = useState<ChatState>({ messages: [], streaming: false });
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "ibp-studio",
    storage: layoutStorage,
  });

  const settings = state?.settings ?? DEFAULT_SETTINGS;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.language, key);
  const theme = useResolvedTheme(settings.theme);

  useEffect(() => {
    const off = onHostMessage((message) => {
      switch (message.type) {
        case "state":
          return setState(message);
        case "ai/state":
          return setAi(message.ai);
        case "chat/state":
          return setChat(message.chat);
        case "chat/delta":
          return setChat((current) => ({
            ...current,
            messages: current.messages.map((m) =>
              m.id === message.messageId ? { ...m, content: m.content + message.text } : m,
            ),
          }));
        case "navigate":
          setSettingsOpen(false);
          return setCreating(true);
      }
    });
    sendReady();
    return off;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = settings.language;
  }, [theme, settings.language]);

  const projects = state?.projects ?? null;
  const currentProjectId = state?.currentProjectId ?? null;
  const selected =
    projects?.find((p) => p.id === selectedId) ??
    projects?.find((p) => p.id === currentProjectId) ??
    projects?.find((p) => !p.archived) ??
    null;
  const showCreate = creating || projects?.length === 0;
  const preview = state?.preview ?? IDLE_PREVIEW;
  const withSelected = (type: "preview/start" | "projects/installDeps") =>
    selected && void run({ type, id: selected.id });

  async function runResponse(input: RequestInput) {
    setBusy(true);
    setError(null);
    const response = await request(input);
    setBusy(false);
    if (response.ok && response.projectId) setSelectedId(response.projectId);
    if (!response.ok && response.error.code !== "cancelled") setError(response.error);
    return response;
  }

  async function run(input: RequestInput): Promise<boolean> {
    return (await runResponse(input)).ok;
  }

  /** Writes the site's copy with AI; the result shows up for review in the Assistant. */
  function generate(id: string) {
    setLeftTab("chat");
    void run({ type: "site/generate", id, model: "auto" });
  }
  const canGenerate = (ai?.preferences.length ?? 0) > 0 && !chat.streaming;

  return (
    <LocaleContext value={settings.language}>
      <div className="flex h-full flex-col">
        <TopBar
          settings={settings}
          projectName={projects?.find((p) => p.id === currentProjectId)?.name ?? null}
          onChange={(update) => void run({ type: "settings/update", update })}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
        />
        {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
        <Group
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="projects" defaultSize="22" minSize="14" maxSize="40">
            <div className="flex h-full flex-col bg-surface">
              <div
                role="tablist"
                className="flex h-9 shrink-0 items-end gap-1 border-b border-line px-2"
              >
                {(["projects", "chat"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={leftTab === key}
                    onClick={() => setLeftTab(key)}
                    className={`-mb-px border-b-2 px-3 py-1.5 text-[12px] ${
                      leftTab === key
                        ? "border-accent text-text"
                        : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {key === "projects" ? t("projects.title") : t("chat.tab")}
                  </button>
                ))}
              </div>
              <div role="tabpanel" className="min-h-0 flex-1">
                {leftTab === "chat" ? (
                  <ChatPanel
                    chat={chat}
                    ai={ai}
                    mode={settings.mode}
                    onSend={(text, model) =>
                      run({ type: "chat/send", text, model, projectId: selected?.id ?? null })
                    }
                    onStop={() => void run({ type: "chat/stop" })}
                    onClear={() => void run({ type: "chat/clear" })}
                    onOpenSettings={() => setSettingsOpen(true)}
                    projectName={selected && !selected.missing ? selected.name : null}
                    busy={busy}
                    onApprove={(messageId, approvalId, approved) =>
                      void run({ type: "agent/approve", messageId, approvalId, approved })
                    }
                    onAccept={(messageId) => void run({ type: "agent/accept", messageId })}
                    onRevert={(messageId) => void run({ type: "agent/revert", messageId })}
                  />
                ) : (
                  <ProjectList
                    projects={projects}
                    currentProjectId={currentProjectId}
                    selectedId={selected?.id ?? null}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setCreating(false);
                    }}
                    onCreate={() => setCreating(true)}
                    onImport={() =>
                      void run({ type: "projects/import" }).then((ok) => ok && setCreating(false))
                    }
                  />
                )}
              </div>
            </div>
          </Panel>
          <Separator className={separatorClass} />
          <Panel id="workspace" minSize="30">
            <main className="h-full overflow-hidden">
              {settingsOpen ? (
                <SettingsView
                  ai={ai}
                  mode={settings.mode}
                  run={run}
                  onClose={() => setSettingsOpen(false)}
                />
              ) : showCreate ? (
                <div className="h-full overflow-y-auto">
                  <CreateProject
                    busy={busy}
                    onCancel={projects?.length ? () => setCreating(false) : null}
                    canGenerate={canGenerate}
                    onSubmit={(details, template, withAi) =>
                      void runResponse({ type: "projects/create", details, template }).then((r) => {
                        if (!r.ok) return;
                        setCreating(false);
                        if (withAi && r.projectId) generate(r.projectId);
                      })
                    }
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div
                    role="tablist"
                    className="flex h-9 shrink-0 items-end gap-1 border-b border-line px-2"
                  >
                    {(["preview", "content", "project"] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={`-mb-px border-b-2 px-3 py-1.5 text-[12px] ${
                          tab === key
                            ? "border-accent text-text"
                            : "border-transparent text-muted hover:text-text"
                        }`}
                      >
                        {t(`tab.${key}`)}
                      </button>
                    ))}
                  </div>
                  <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
                    {tab === "preview" ? (
                      <PreviewPane
                        project={selected}
                        preview={preview}
                        previewProjectName={
                          projects?.find((p) => p.id === preview.projectId)?.name ?? null
                        }
                        mode={settings.mode}
                        busy={busy}
                        onStart={() => withSelected("preview/start")}
                        onInstall={() => withSelected("projects/installDeps")}
                        onStop={() => void run({ type: "preview/stop" })}
                        onRestart={() => void run({ type: "preview/restart" })}
                        onOpenExternal={() => void run({ type: "preview/openExternal" })}
                      />
                    ) : tab === "content" ? (
                      selected && !selected.missing ? (
                        <ContentEditor
                          key={selected.id}
                          project={selected}
                          canGenerate={canGenerate}
                          onGenerate={() => generate(selected.id)}
                          onError={setError}
                        />
                      ) : (
                        <p className="p-6 text-muted">{t("preview.noProject")}</p>
                      )
                    ) : (
                      <ProjectOverview
                        project={selected}
                        isCurrent={selected?.id === currentProjectId}
                        mode={settings.mode}
                        terminal={state?.capabilities.terminal ?? false}
                        busy={busy}
                        onCreate={() => setCreating(true)}
                        onAction={(type) => selected && void run({ type, id: selected.id })}
                        onArchive={(archived) =>
                          selected &&
                          void run({ type: "projects/setArchived", id: selected.id, archived })
                        }
                      />
                    )}
                  </div>
                </div>
              )}
            </main>
          </Panel>
          <Separator className={separatorClass} />
          <Panel id="properties" defaultSize="26" minSize="16" maxSize="40" collapsible>
            <PropertiesPanel
              project={showCreate ? null : selected}
              onSave={(details) =>
                selected
                  ? run({ type: "projects/update", id: selected.id, details })
                  : Promise.resolve(false)
              }
            />
          </Panel>
        </Group>
      </div>
    </LocaleContext>
  );
}
