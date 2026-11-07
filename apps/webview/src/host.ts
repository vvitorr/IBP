/**
 * Bridge to the extension host. Every incoming message is validated before use; the webview
 * itself has no privileges and can only ask the host to do things.
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

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi(); // may only be called once per webview

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestInput = DistributiveOmit<WebviewRequest, "requestId">;
type Listener = (message: Exclude<HostMessage, ResponseMessage>) => void;

const pending = new Map<string, (response: ResponseMessage) => void>();
const listeners = new Set<Listener>();
let counter = 0;

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  // Phase 5 note: the preview iframe will also post messages here; check event.source then.
  const parsed = hostMessageSchema.safeParse(event.data);
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
  vscode.postMessage({ type: "ready" });
}

export function request(input: RequestInput): Promise<ResponseMessage> {
  const requestId = `r${++counter}`;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    vscode.postMessage({ ...input, requestId } as WebviewRequest);
  });
}

/** Per-webview UI state (panel sizes) kept by VS Code across reloads. Never holds secrets. */
export const layoutStorage = {
  getItem(key: string): string | null {
    const state = vscode.getState();
    if (typeof state !== "object" || state === null) return null;
    const value = (state as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  },
  setItem(key: string, value: string): void {
    const state = vscode.getState();
    vscode.setState({
      ...(typeof state === "object" && state !== null ? state : {}),
      [key]: value,
    });
  },
};
