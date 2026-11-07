import { useEffect, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { DEFAULT_LOCALE, type AppError, type Settings, type StateMessage } from "@ibp/shared";
import { CreateProject } from "./components/CreateProject";
import { ErrorNotice } from "./components/ErrorNotice";
import { ProjectList } from "./components/ProjectList";
import { ProjectOverview } from "./components/ProjectOverview";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { TopBar } from "./components/TopBar";
import { layoutStorage, onHostMessage, request, sendReady, type RequestInput } from "./host";
import { LocaleContext } from "./i18n";

const DEFAULT_SETTINGS: Settings = { language: DEFAULT_LOCALE, mode: "beginner", theme: "dark" };

function isVsCodeLight(): boolean {
  const classes = document.body.classList;
  return classes.contains("vscode-light") || classes.contains("vscode-high-contrast-light");
}

/** "auto" follows the VS Code theme, which VS Code exposes as a class on <body>. */
function useResolvedTheme(theme: Settings["theme"]): "dark" | "light" {
  const [vscodeLight, setVscodeLight] = useState(isVsCodeLight);
  useEffect(() => {
    const observer = new MutationObserver(() => setVscodeLight(isVsCodeLight()));
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  if (theme !== "auto") return theme;
  return vscodeLight ? "light" : "dark";
}

const separatorClass = "w-px bg-line transition-colors hover:bg-accent focus-visible:bg-accent";

export function App() {
  const [state, setState] = useState<StateMessage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "ibp-studio",
    storage: layoutStorage,
  });

  const settings = state?.settings ?? DEFAULT_SETTINGS;
  const theme = useResolvedTheme(settings.theme);

  useEffect(() => {
    const off = onHostMessage((message) => {
      if (message.type === "state") setState(message);
      else setCreating(true); // "navigate" to the create form
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

  async function run(input: RequestInput): Promise<boolean> {
    setBusy(true);
    setError(null);
    const response = await request(input);
    setBusy(false);
    if (response.ok) {
      if (response.projectId) setSelectedId(response.projectId);
      return true;
    }
    if (response.error.code !== "cancelled") setError(response.error);
    return false;
  }

  return (
    <LocaleContext value={settings.language}>
      <div className="flex h-full flex-col">
        <TopBar
          settings={settings}
          projectName={projects?.find((p) => p.id === currentProjectId)?.name ?? null}
          onChange={(update) => void run({ type: "settings/update", update })}
        />
        {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
        <Group
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="projects" defaultSize="22" minSize="14" maxSize="40">
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
          </Panel>
          <Separator className={separatorClass} />
          <Panel id="workspace" minSize="30">
            <main className="h-full overflow-y-auto">
              {showCreate ? (
                <CreateProject
                  busy={busy}
                  onCancel={projects?.length ? () => setCreating(false) : null}
                  onSubmit={(details) =>
                    void run({ type: "projects/create", details }).then(
                      (ok) => ok && setCreating(false),
                    )
                  }
                />
              ) : (
                <ProjectOverview
                  project={selected}
                  isCurrent={selected?.id === currentProjectId}
                  mode={settings.mode}
                  busy={busy}
                  onCreate={() => setCreating(true)}
                  onAction={(type) => selected && void run({ type, id: selected.id })}
                  onArchive={(archived) =>
                    selected &&
                    void run({ type: "projects/setArchived", id: selected.id, archived })
                  }
                />
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
