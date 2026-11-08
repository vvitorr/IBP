import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, net, protocol, session, type IpcMainEvent } from "electron";
import {
  JsonProjectStore,
  nodeProcessRunner,
  ProjectService,
  resolveShellEnv,
  runGit,
  StudioController,
} from "@ibp/core";
import { createDesktopHost } from "./desktopHost";
import { SafeSecretVault } from "./secretVault";
import { SettingsStore } from "./settings";

if (process.env.IBP_TEST_MODE === "1" && process.env.IBP_USER_DATA) {
  app.setPath("userData", process.env.IBP_USER_DATA);
}

const SCHEME = "ibp";
const ORIGIN = `${SCHEME}://studio`;
const rendererDir = join(__dirname, "renderer");
const templatesRoot = app.isPackaged
  ? join(process.resourcesPath, "templates")
  : join(__dirname, "templates");

// The Studio is served from a custom secure scheme instead of file:// (Electron security checklist).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, corsEnabled: true } },
]);

function serveRenderer(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== "studio") return new Response("Not found", { status: 404 });
    const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = normalize(join(rendererDir, relativePath));
    if (!file.startsWith(rendererDir + sep)) return new Response("Forbidden", { status: 403 });
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

async function createWindow(): Promise<void> {
  const userData = app.getPath("userData");
  const settings = new SettingsStore(join(userData, "settings.json"));
  await settings.load();
  const service = new ProjectService({
    store: new JsonProjectStore(join(userData, "projects.json"), (m) => console.warn(m)),
    templatesRoot,
    git: runGit,
  });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "IBP Studio",
    backgroundColor: "#111213",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const controller = new StudioController({
    host: createDesktopHost(win, settings, {
      dataDir: userData,
      secrets: new SafeSecretVault(join(userData, "secrets.json")),
    }),
    service,
    runner: nodeProcessRunner,
    env: resolveShellEnv,
  });

  const onMessage = (event: IpcMainEvent, raw: unknown) => {
    // Only the Studio's own main frame may talk to the main process.
    if (event.sender !== win.webContents || !event.senderFrame?.url.startsWith(`${ORIGIN}/`))
      return;
    void controller.receive(raw);
  };
  ipcMain.on("ibp:message", onMessage);

  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.once("ready-to-show", () => win.show());
  win.on("close", () => void controller.dispose()); // stops the dev server
  win.on("closed", () => ipcMain.removeListener("ibp:message", onMessage));

  await win.loadURL(`${ORIGIN}/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(async () => {
    // No camera, microphone, notifications, etc. for any page (Studio or preview).
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    serveRenderer();
    await createWindow();
  });
}
