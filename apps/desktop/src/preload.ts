import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

// The only API the Studio page gets: send a message, receive messages. The main process
// validates everything it receives. Runs in the main frame only, so the preview iframe never
// sees it.
contextBridge.exposeInMainWorld("ibpHost", {
  postMessage: (message: unknown) => ipcRenderer.send("ibp:message", message),
  onMessage: (listener: (message: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, message: unknown) => listener(message);
    ipcRenderer.on("ibp:message", handler);
    return () => ipcRenderer.removeListener("ibp:message", handler);
  },
});
