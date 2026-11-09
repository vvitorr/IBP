import {
  Ban,
  CircleX,
  FileMinus,
  FilePen,
  FilePlus,
  FileSearch,
  FileText,
  Flag,
  FolderTree,
  GitCommitHorizontal,
  ListChecks,
  LoaderCircle,
  Package,
  Search,
  Sparkles,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import type { AgentRunView, AgentStepView, FileChangeView, MessageKey } from "@ibp/shared";
import { useT } from "../i18n";
import { Badge, Button } from "./ui";

type IconType = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;

const STEP_ICONS: Record<AgentStepView["tool"], IconType> = {
  list_files: FolderTree,
  read_file: FileSearch,
  search: Search,
  write_file: FileText,
  edit_file: FilePen,
  delete_file: FileMinus,
  run_check: ListChecks,
  install_package: Package,
  finish: Flag,
  generate_content: Sparkles,
  unknown: CircleX,
};

const CHANGE_ICONS: Record<FileChangeView["kind"], IconType> = {
  created: FilePlus,
  modified: FilePen,
  deleted: FileMinus,
};

/** Colours a unified diff line by line. */
function Diff({ text }: { text: string }) {
  return (
    <pre className="mt-1 max-h-80 overflow-auto rounded border border-line bg-bg p-2 font-mono text-[11px] leading-4">
      {text.split("\n").map((line, i) => {
        const tone =
          line.startsWith("+") && !line.startsWith("+++")
            ? "text-accent"
            : line.startsWith("-") && !line.startsWith("---")
              ? "text-danger"
              : line.startsWith("@@")
                ? "text-muted"
                : "";
        return (
          <span key={i} className={`block whitespace-pre-wrap break-all ${tone}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

/** What the coding agent did in one answer: steps, a pending approval, and the changes to review. */
export function AgentRun({
  run,
  developer,
  busy,
  onApprove,
  onAccept,
  onRevert,
}: {
  run: AgentRunView;
  developer: boolean;
  busy: boolean;
  onApprove: (approvalId: string, approved: boolean) => void;
  onAccept: () => void;
  onRevert: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const reviewable = ["done", "failed", "stopped"].includes(run.status) && run.changes.length > 0;
  const closed = run.status === "accepted" || run.status === "reverted";
  const changesTitle =
    run.changes.length === 1
      ? t("agent.changes.titleOne")
      : t("agent.changes.title", { count: run.changes.length });

  return (
    <div className="mt-1 flex flex-col gap-2">
      {run.steps.length > 0 && (
        <ol className="flex flex-col gap-0.5 text-[12px] text-muted" aria-label={t("agent.steps")}>
          {run.steps.map((step) => {
            const Icon = STEP_ICONS[step.tool];
            return (
              <li key={step.id} className="flex items-start gap-1.5">
                {step.status === "running" ? (
                  <LoaderCircle size={13} className="mt-0.5 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Icon size={13} className="mt-0.5 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 break-words">
                  {t(`agent.step.${step.tool}` as MessageKey, { target: step.target })}
                  {step.status === "denied" && (
                    <Badge tone="warning">{t("agent.status.denied")}</Badge>
                  )}
                  {step.status === "failed" && (
                    <Badge tone="warning">{t("agent.status.failed")}</Badge>
                  )}
                  {developer && step.detail && (
                    <span className="block font-mono text-[11px] break-all">{step.detail}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {run.approval && (
        <div
          role="alertdialog"
          aria-label={t("agent.approval.title")}
          className="rounded border border-warning bg-raised p-2"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert size={14} className="text-warning" aria-hidden />
            {t("agent.approval.title")}
          </p>
          <p className="mt-1">
            {t(`agent.approval.${run.approval.tool}` as MessageKey, {
              target: run.approval.target,
            })}
          </p>
          {run.approval.preview && (
            <details open={developer}>
              <summary className="cursor-pointer text-[12px] text-muted">
                {t("agent.changes.showDiff")}
              </summary>
              <Diff text={run.approval.preview} />
            </details>
          )}
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => onApprove(run.approval?.id ?? "", true)}>
              {t("agent.approval.approve")}
            </Button>
            <Button
              onClick={() => onApprove(run.approval?.id ?? "", false)}
              icon={<Ban size={13} aria-hidden />}
            >
              {t("agent.approval.deny")}
            </Button>
          </div>
        </div>
      )}

      {run.stoppedAtLimit && (
        <p className="text-[12px] text-warning">{t("agent.stoppedAtLimit")}</p>
      )}

      {run.changes.length > 0 && (
        <section
          className={`rounded border border-line p-2 ${closed ? "opacity-70" : ""}`}
          aria-label={changesTitle}
        >
          <h4 className="text-[12px] font-semibold">{changesTitle}</h4>
          <ul className="mt-1 flex flex-col gap-1">
            {run.changes.map((change) => {
              const Icon = CHANGE_ICONS[change.kind];
              const expanded = open[change.path] ?? false;
              return (
                <li key={change.path} className="text-[12px]">
                  <p className="flex items-start gap-1.5 font-mono break-all">
                    <Icon size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                    {change.path}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pl-5">
                    <Badge>{t(`agent.changes.${change.kind}`)}</Badge>
                    <span className="font-mono text-accent">+{change.additions}</span>
                    <span className="font-mono text-danger">−{change.deletions}</span>
                    <button
                      type="button"
                      className="text-muted underline-offset-2 hover:text-text hover:underline"
                      aria-expanded={expanded}
                      onClick={() => setOpen((o) => ({ ...o, [change.path]: !expanded }))}
                    >
                      {expanded ? t("agent.changes.hideDiff") : t("agent.changes.showDiff")}
                    </button>
                  </div>
                  {expanded && <Diff text={change.diff} />}
                </li>
              );
            })}
          </ul>
          {reviewable && (
            <>
              <p className="mt-2 text-[12px] text-muted">{t("agent.changes.pending")}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  icon={<GitCommitHorizontal size={13} aria-hidden />}
                  onClick={onAccept}
                >
                  {t("agent.changes.accept")}
                </Button>
                <Button disabled={busy} icon={<Undo2 size={13} aria-hidden />} onClick={onRevert}>
                  {t("agent.changes.revert")}
                </Button>
              </div>
            </>
          )}
          {run.notice && (
            <p className="mt-2 text-[12px] text-muted">{t(`agent.changes.${run.notice}`)}</p>
          )}
        </section>
      )}
    </div>
  );
}
