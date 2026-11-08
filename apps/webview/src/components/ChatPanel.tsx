import { LoaderCircle, SendHorizontal, Settings, Square, Trash } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ERROR_MESSAGE_KEYS,
  type AiState,
  type ChatState,
  type ModelRef,
  type Settings as StudioSettings,
} from "@ibp/shared";
import { useT } from "../i18n";
import { AgentRun } from "./AgentRun";
import { Button } from "./ui";

const refKey = (ref: ModelRef) => `${ref.providerId}|${ref.modelId}`;

/** Conversation with the AI. In Phase 2 it answers questions; it cannot change files yet. */
export function ChatPanel({
  chat,
  ai,
  mode,
  onSend,
  onStop,
  onClear,
  onOpenSettings,
  projectName,
  busy,
  onApprove,
  onAccept,
  onRevert,
}: {
  chat: ChatState;
  ai: AiState | null;
  mode: StudioSettings["mode"];
  onSend: (text: string, model: "auto" | ModelRef) => Promise<boolean>;
  onStop: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
  /** Selected project: with one, the assistant works on it as a coding agent. */
  projectName: string | null;
  busy: boolean;
  onApprove: (messageId: string, approvalId: string, approved: boolean) => void;
  onAccept: (messageId: string) => void;
  onRevert: (messageId: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [model, setModel] = useState("auto");
  const bottom = useRef<HTMLDivElement>(null);
  const developer = mode === "developer";
  const providerName = (id: string) => ai?.providers.find((p) => p.id === id)?.name ?? id;
  const configured = (ai?.preferences.length ?? 0) > 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [chat]);

  async function submit() {
    const value = text.trim();
    if (!value || chat.streaming) return;
    const ref = model === "auto" ? "auto" : ai?.preferences.find((p) => refKey(p) === model);
    if (await onSend(value, ref ?? "auto")) setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const last = chat.messages.at(-1);
  return (
    <div className="flex h-full flex-col">
      <p className="shrink-0 truncate border-b border-line px-3 py-1.5 text-[12px] text-muted">
        {projectName ? t("chat.workingOn", { name: projectName }) : t("chat.noProjectHint")}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-live="polite">
        {!configured && (
          <div className="mb-3 flex flex-col items-start gap-2 rounded border border-line bg-raised p-2 text-[12px]">
            <p>{t("chat.noModel")}</p>
            <Button icon={<Settings size={13} aria-hidden />} onClick={onOpenSettings}>
              {t("chat.openSettings")}
            </Button>
          </div>
        )}
        {chat.messages.length === 0 && configured && (
          <p className="text-muted">{t("chat.empty")}</p>
        )}
        <ol className="flex flex-col gap-3">
          {chat.messages.map((message) => (
            <li key={message.id} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                {message.role === "user" ? t("chat.you") : t("chat.assistant")}
                {developer && message.model && (
                  <span className="ml-2 font-mono normal-case tracking-normal">
                    {providerName(message.model.providerId)} · {message.model.modelId}
                  </span>
                )}
              </span>
              {message.content && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}
              {message.run && (
                <AgentRun
                  run={message.run}
                  developer={developer}
                  busy={busy}
                  onApprove={(approvalId, approved) => onApprove(message.id, approvalId, approved)}
                  onAccept={() => onAccept(message.id)}
                  onRevert={() => onRevert(message.id)}
                />
              )}
              {chat.streaming &&
                message === last &&
                message.role === "assistant" &&
                !message.content && (
                  <p className="flex items-center gap-1.5 text-muted">
                    <LoaderCircle size={13} className="animate-spin" aria-hidden />{" "}
                    {t("chat.thinking")}
                  </p>
                )}
              {message.error && (
                <div role="alert" className="text-[12px] text-danger">
                  <p>{t(ERROR_MESSAGE_KEYS[message.error.code])}</p>
                  {message.error.detail && developer && (
                    <details className="text-muted">
                      <summary className="cursor-pointer">{t("error.details")}</summary>
                      <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap break-all">
                        {message.error.detail}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div ref={bottom} />
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-2">
        {developer && configured && (
          <label className="flex items-center gap-2 text-[12px] text-muted">
            {t("chat.model")}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="min-w-0 flex-1 py-0.5"
            >
              <option value="auto">{t("chat.model.auto")}</option>
              {ai?.preferences.map((ref) => (
                <option key={refKey(ref)} value={refKey(ref)}>
                  {providerName(ref.providerId)} · {ref.modelId}
                </option>
              ))}
            </select>
          </label>
        )}
        <textarea
          rows={3}
          value={text}
          maxLength={20_000}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="resize-none"
        />
        <div className="flex items-center gap-2">
          {chat.streaming ? (
            <Button icon={<Square size={13} aria-hidden />} onClick={onStop}>
              {t("chat.stop")}
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!text.trim()}
              icon={<SendHorizontal size={13} aria-hidden />}
              onClick={() => void submit()}
            >
              {t("chat.send")}
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            className="px-1.5"
            disabled={chat.messages.length === 0}
            onClick={onClear}
            title={t("chat.clear")}
            aria-label={t("chat.clear")}
          >
            <Trash size={14} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
