import {
  ExternalLink,
  LoaderCircle,
  Monitor,
  Package,
  Play,
  RefreshCw,
  RotateCw,
  ScrollText,
  Smartphone,
  Square,
  Tablet,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { PreviewState, ProjectSummary, Settings } from "@ibp/shared";
import { useT } from "../i18n";
import { ErrorNotice } from "./ErrorNotice";
import { Button } from "./ui";

const DEVICES = {
  desktop: { width: null, icon: Monitor },
  tablet: { width: 768, icon: Tablet },
  mobile: { width: 390, icon: Smartphone },
} as const;
type Device = keyof typeof DEVICES;

const STATUS_DOT: Record<PreviewState["status"], string> = {
  stopped: "bg-muted",
  installing: "bg-warning",
  starting: "bg-warning",
  running: "bg-accent",
  error: "bg-danger",
};

/** Tracks an element's size; a callback ref so it works for elements that mount later. */
function useSize() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, size] as const;
}

/** The real dev server of the selected project, shown in a sandboxed cross-origin iframe. */
export function PreviewPane({
  project,
  preview,
  previewProjectName,
  mode,
  busy,
  onStart,
  onStop,
  onRestart,
  onOpenExternal,
  onInstall,
}: {
  project: ProjectSummary | null;
  preview: PreviewState;
  previewProjectName: string | null;
  mode: Settings["mode"];
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenExternal: () => void;
  onInstall: () => void;
}) {
  const t = useT();
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [showLog, setShowLog] = useState(mode === "developer");
  const [stageRef, stage] = useSize();
  const [dismissedError, setDismissedError] = useState<PreviewState["error"]>(undefined);

  if (!project) return <Centered>{t("preview.noProject")}</Centered>;

  const mine = preview.projectId === project.id;
  const status = mine ? preview.status : "stopped";
  const active = status === "running" || status === "starting" || status === "installing";
  const otherActive = !mine && preview.projectId !== null && preview.status !== "stopped";

  const width = DEVICES[device].width;
  const scale = width ? Math.min(1, (stage.width - 32) / width) : 1;

  let body: ReactNode;
  if (project.missing) {
    body = <Centered>{t("overview.missing")}</Centered>;
  } else if (status === "running" && preview.url) {
    body = (
      <div ref={stageRef} className="flex h-full justify-center overflow-hidden bg-bg">
        <iframe
          key={reloadKey}
          title={t("preview.frameTitle", { name: project.name })}
          src={preview.url}
          sandbox="allow-scripts allow-same-origin allow-forms"
          className={width ? "mt-4 border border-line bg-white" : "h-full w-full bg-white"}
          style={
            width
              ? {
                  width,
                  height: (stage.height - 32) / scale,
                  transform: `scale(${scale})`,
                  transformOrigin: "top center",
                }
              : undefined
          }
        />
      </div>
    );
  } else if (status === "installing" || status === "starting") {
    body = (
      <Centered>
        <LoaderCircle size={20} className="animate-spin text-muted" aria-hidden />
        <p>{status === "installing" ? t("preview.installingHint") : t("preview.startingHint")}</p>
      </Centered>
    );
  } else if (!project.dependenciesInstalled) {
    body = (
      <Centered>
        <p>{t("preview.needsDeps")}</p>
        <Button
          variant="primary"
          disabled={busy}
          icon={<Package size={14} aria-hidden />}
          onClick={onInstall}
        >
          {t("action.installDeps")}
        </Button>
      </Centered>
    );
  } else {
    body = (
      <Centered>
        {otherActive && previewProjectName && (
          <p>{t("preview.otherProject", { name: previewProjectName })}</p>
        )}
        {!otherActive && <p>{t("preview.idle")}</p>}
        <Button
          variant="primary"
          disabled={busy}
          icon={<Play size={14} aria-hidden />}
          onClick={onStart}
        >
          {t("preview.start")}
        </Button>
      </Centered>
    );
  }

  const error = mine && status === "error" ? preview.error : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="flex items-center gap-1.5 text-[12px] text-muted" role="status">
          <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
          {t(`preview.status.${status}`)}
        </span>
        <div className="flex-1" />
        <div
          role="radiogroup"
          aria-label={t("preview.device")}
          className="flex rounded border border-line p-0.5"
        >
          {(Object.keys(DEVICES) as Device[]).map((key) => {
            const Icon = DEVICES[key].icon;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={device === key}
                aria-label={t(`preview.device.${key}`)}
                title={t(`preview.device.${key}`)}
                onClick={() => setDevice(key)}
                className={`rounded-sm px-1.5 py-0.5 ${device === key ? "bg-raised text-text" : "text-muted hover:text-text"}`}
              >
                <Icon size={14} aria-hidden />
              </button>
            );
          })}
        </div>
        {status === "running" && (
          <>
            <IconButton label={t("preview.refresh")} onClick={() => setReloadKey((k) => k + 1)}>
              <RotateCw size={14} aria-hidden />
            </IconButton>
            <IconButton label={t("preview.openExternal")} onClick={onOpenExternal}>
              <ExternalLink size={14} aria-hidden />
            </IconButton>
          </>
        )}
        {mine && (status === "running" || status === "error") && (
          <IconButton label={t("preview.restart")} onClick={onRestart} disabled={busy}>
            <RefreshCw size={14} aria-hidden />
          </IconButton>
        )}
        {mine && active && (
          <IconButton label={t("preview.stop")} onClick={onStop} disabled={busy}>
            <Square size={14} aria-hidden />
          </IconButton>
        )}
        <IconButton
          label={showLog ? t("preview.log.hide") : t("preview.log.show")}
          onClick={() => setShowLog((v) => !v)}
          pressed={showLog}
        >
          <ScrollText size={14} aria-hidden />
        </IconButton>
      </div>

      {error && error !== dismissedError && (
        <ErrorNotice error={error} onDismiss={() => setDismissedError(error)} />
      )}

      <div className="min-h-0 flex-1">{body}</div>

      {showLog && (
        <pre
          aria-label={t("preview.log.show")}
          className="h-40 shrink-0 overflow-auto border-t border-line bg-surface px-3 py-2 font-mono text-[11px] leading-4 text-muted"
        >
          {(mine ? preview.log : []).join("\n")}
        </pre>
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted">
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1 hover:bg-raised hover:text-text disabled:opacity-50 ${pressed ? "text-text" : "text-muted"}`}
    >
      {children}
    </button>
  );
}
