/**
 * Bridge to the host: the VS Code extension (webview API) or the desktop app (preload bridge).
 * Every incoming message is validated before use; the Studio itself has no privileges and can
 * only ask the host to do things.
 */
import {
  hostMessageSchema,
  type HostMessage,
  type ResponseMessage,
  type WebviewMessage,
  type WebviewRequest,
} from "@ibp/shared";

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/** Exposed by apps/desktop/src/preload.ts via contextBridge. */
interface DesktopBridge {
  postMessage(message: WebviewMessage): void;
  onMessage(listener: (message: unknown) => void): () => void;
}

declare function acquireVsCodeApi(): VsCodeApi;
declare global {
  interface Window {
    ibpHost?: DesktopBridge;
  }
}

interface Transport {
  post(message: WebviewMessage): void;
  subscribe(listener: (data: unknown) => void): void;
  storage: Pick<Storage, "getItem" | "setItem">;
}

function vscodeTransport(): Transport {
  const vscode = acquireVsCodeApi(); // may only be called once per webview
  const state = () => {
    const value = vscode.getState();
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  };
  return {
    post: (message) => vscode.postMessage(message),
    subscribe: (listener) =>
      window.addEventListener("message", (event: MessageEvent<unknown>) => {
        // The preview iframe (the generated site) can post here too; it never speaks for the host.
        if (event.origin.startsWith("http://127.0.0.1")) return;
        listener(event.data);
      }),
    storage: {
      getItem: (key) => {
        const value = state()[key];
        return typeof value === "string" ? value : null;
      },
      setItem: (key, value) => vscode.setState({ ...state(), [key]: value }),
    },
  };
}

function desktopTransport(bridge: DesktopBridge): Transport {
  return {
    post: (message) => bridge.postMessage(message),
    subscribe: (listener) => void bridge.onMessage(listener),
    storage: {
      getItem: (key) => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // layout persistence is a convenience only
        }
      },
    },
  };
}

function createTransport(): Transport {
  if (typeof acquireVsCodeApi === "function") return vscodeTransport();
  if (window.ibpHost) return desktopTransport(window.ibpHost);
  throw new Error("IBP Studio must run inside VS Code or the IBP desktop app");
}

const transport = createTransport();

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestInput = DistributiveOmit<WebviewRequest, "requestId">;
type Listener = (message: Exclude<HostMessage, ResponseMessage>) => void;

const pending = new Map<string, (response: ResponseMessage) => void>();
const listeners = new Set<Listener>();
let counter = 0;

transport.subscribe((data) => {
  const parsed = hostMessageSchema.safeParse(data);
  if (!parsed.success) {
    console.warn("IBP: ignored an invalid host message", parsed.error.message);
    return;
  }
  const message = parsed.data;
  if (message.type === "response") {
    pending.get(message.requestId)?.(message);
    pending.delete(message.requestId);
    return;
  }
  for (const listener of listeners) listener(message);
});

export function onHostMessage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sendReady(): void {
  transport.post({ type: "ready" });
}

export function request(input: RequestInput): Promise<ResponseMessage> {
  const requestId = `r${++counter}`;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    transport.post({ ...input, requestId } as WebviewRequest);
  });
}

/** Per-viewer UI state (panel sizes). Never holds secrets. */
export const layoutStorage = transport.storage;
