import { Check } from "lucide-react";
import { useState } from "react";
import type { ProjectDetails, ProjectSummary } from "@ibp/shared";
import { useT } from "../i18n";
import { ProjectForm } from "./ProjectForm";
import { Button, PanelHeader } from "./ui";

export function PropertiesPanel({
  project,
  onSave,
}: {
  project: ProjectSummary | null;
  onSave: (details: ProjectDetails) => Promise<boolean>;
}) {
  const t = useT();
  return (
    <section className="flex h-full flex-col bg-surface" aria-label={t("props.title")}>
      <PanelHeader title={t("props.title")} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {project ? (
          // Keyed by id so switching projects resets the form to that project's values.
          <ProjectProperties key={project.id} project={project} onSave={onSave} />
        ) : (
          <p className="text-muted">{t("props.empty")}</p>
        )}
      </div>
    </section>
  );
}

function ProjectProperties({
  project,
  onSave,
}: {
  project: ProjectSummary;
  onSave: (details: ProjectDetails) => Promise<boolean>;
}) {
  const t = useT();
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const initial: ProjectDetails = {
    name: project.name,
    client: project.client,
    industry: project.industry,
    description: project.description,
  };

  async function save(details: ProjectDetails) {
    setStatus("saving");
    setStatus((await onSave(details)) ? "saved" : "idle");
  }

  return (
    <div className="flex flex-col gap-3">
      <ProjectForm
        initial={initial}
        onSubmit={(details) => void save(details)}
        actions={(canSubmit) => (
          <>
            <Button type="submit" disabled={!canSubmit || status === "saving" || project.missing}>
              {status === "saving" ? t("props.saving") : t("props.save")}
            </Button>
            {status === "saved" && (
              <span role="status" className="flex items-center gap-1 text-[12px] text-accent">
                <Check size={13} aria-hidden /> {t("props.saved")}
              </span>
            )}
          </>
        )}
      />
      <p className="text-[12px] text-muted">{t("props.folderNote")}</p>
    </div>
  );
}
