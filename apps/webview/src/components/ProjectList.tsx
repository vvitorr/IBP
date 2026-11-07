import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import type { ProjectSummary } from "@ibp/shared";
import { useT } from "../i18n";
import { Badge, Button, PanelHeader } from "./ui";

export function ProjectList({
  projects,
  currentProjectId,
  selectedId,
  onSelect,
  onCreate,
  onImport,
}: {
  projects: ProjectSummary[] | null;
  currentProjectId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  const t = useT();
  const [showArchived, setShowArchived] = useState(false);
  const visible = (projects ?? []).filter((p) => showArchived || !p.archived);

  return (
    <section className="flex h-full flex-col bg-surface" aria-label={t("projects.title")}>
      <PanelHeader title={t("projects.title")}>
        <Button
          variant="ghost"
          className="px-1.5"
          onClick={onImport}
          title={t("projects.import")}
          aria-label={t("projects.import")}
        >
          <FolderOpen size={15} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          className="px-1.5"
          onClick={onCreate}
          title={t("projects.new")}
          aria-label={t("projects.new")}
        >
          <Plus size={15} aria-hidden />
        </Button>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {projects === null && <p className="px-3 py-2 text-muted">{t("projects.loading")}</p>}
        {projects !== null && visible.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-3 py-3">
            <p className="text-muted">{t("projects.empty")}</p>
            <Button variant="primary" icon={<Plus size={14} aria-hidden />} onClick={onCreate}>
              {t("projects.new")}
            </Button>
          </div>
        )}
        <ul>
          {visible.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => onSelect(project.id)}
                aria-current={project.id === selectedId}
                className={`flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-1.5 text-left ${
                  project.id === selectedId
                    ? "border-accent bg-raised"
                    : "border-transparent hover:bg-raised/60"
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="truncate font-medium">{project.name}</span>
                  {project.id === currentProjectId && (
                    <Badge tone="accent">{t("projects.badge.current")}</Badge>
                  )}
                  {project.archived && <Badge>{t("projects.badge.archived")}</Badge>}
                  {project.missing && <Badge tone="warning">{t("projects.badge.missing")}</Badge>}
                </span>
                <span className="truncate text-[12px] text-muted">
                  {[project.client, t(`industry.${project.industry}`)].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex items-center gap-2 border-t border-line px-3 py-2 text-[12px] text-muted">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        {t("projects.showArchived")}
      </label>
    </section>
  );
}
