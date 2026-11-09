import {
  Archive,
  ArchiveRestore,
  CodeXml,
  FolderOpen,
  Package,
  Plus,
  SquareTerminal,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectSummary, Settings } from "@ibp/shared";
import { useLocale, useT } from "../i18n";
import { Button } from "./ui";

type Action =
  "projects/open" | "projects/installDeps" | "projects/openCode" | "projects/openTerminal";

export function ProjectOverview({
  project,
  isCurrent,
  mode,
  terminal,
  busy,
  onAction,
  onArchive,
  onCreate,
}: {
  project: ProjectSummary | null;
  isCurrent: boolean;
  mode: Settings["mode"];
  /** Whether this host can open a terminal (VS Code yes, desktop app not yet). */
  terminal: boolean;
  busy: boolean;
  onAction: (type: Action) => void;
  onArchive: (archived: boolean) => void;
  onCreate: () => void;
}) {
  const t = useT();
  const locale = useLocale();

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <p>{t("overview.noSelection")}</p>
        <Button variant="primary" icon={<Plus size={14} aria-hidden />} onClick={onCreate}>
          {t("projects.new")}
        </Button>
      </div>
    );
  }

  const developer = mode === "developer";
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const disabled = busy || project.missing;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-[20px] font-semibold">{project.name}</h1>
        <p className="text-muted">
          {[project.client, t(`industry.${project.industry}`)].filter(Boolean).join(" · ")}
        </p>
        {project.description && (
          <p className="mt-2 max-w-prose whitespace-pre-line">{project.description}</p>
        )}
      </div>

      {project.missing && (
        <p role="status" className="flex items-center gap-2 text-warning">
          <TriangleAlert size={15} aria-hidden /> {t("overview.missing")}
        </p>
      )}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 border-y border-line py-3">
        <Info label={t("overview.git")}>
          {project.hasGit ? t("overview.git.yes") : t("overview.git.no")}
        </Info>
        <Info label={t("overview.deps")}>
          {project.dependenciesInstalled
            ? t("overview.deps.installed")
            : t("overview.deps.missing")}
        </Info>
        <Info label={t("overview.lastModified")}>
          {project.lastModified ? dateFormat.format(new Date(project.lastModified)) : "—"}
        </Info>
        {developer && (
          <>
            <Info label={t("overview.stack")}>
              <code className="font-mono text-[12px]">{project.stack}</code>
            </Info>
            <Info label={t("overview.location")}>
              <code className="font-mono text-[12px] break-all">{project.path}</code>
            </Info>
          </>
        )}
      </dl>

      <section className="flex flex-col gap-2" aria-label={t("overview.actions")}>
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          {t("overview.actions")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {!isCurrent && (
            <Button
              variant="primary"
              disabled={disabled}
              title={t("action.open.hint")}
              icon={<FolderOpen size={14} aria-hidden />}
              onClick={() => onAction("projects/open")}
            >
              {t("action.open")}
            </Button>
          )}
          {!project.dependenciesInstalled && (
            <Button
              disabled={disabled}
              title={t("action.installDeps.hint")}
              icon={<Package size={14} aria-hidden />}
              onClick={() => onAction("projects/installDeps")}
            >
              {t("action.installDeps")}
            </Button>
          )}
          {developer && (
            <>
              <Button
                disabled={disabled}
                title={t("action.openCode.hint")}
                icon={<CodeXml size={14} aria-hidden />}
                onClick={() => onAction("projects/openCode")}
              >
                {t("action.openCode")}
              </Button>
              {terminal && (
                <Button
                  disabled={disabled}
                  icon={<SquareTerminal size={14} aria-hidden />}
                  onClick={() => onAction("projects/openTerminal")}
                >
                  {t("action.openTerminal")}
                </Button>
              )}
            </>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            icon={
              project.archived ? (
                <ArchiveRestore size={14} aria-hidden />
              ) : (
                <Archive size={14} aria-hidden />
              )
            }
            onClick={() => onArchive(!project.archived)}
          >
            {project.archived ? t("action.unarchive") : t("action.archive")}
          </Button>
        </div>
        {!project.dependenciesInstalled && !project.missing && (
          <p className="text-[12px] text-muted">{t("action.installDeps.hint")}</p>
        )}
      </section>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </>
  );
}
