import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { TEMPLATE_IDS, type ProjectDetails, type TemplateId } from "@ibp/shared";
import { useT } from "../i18n";
import { EMPTY_DETAILS, ProjectForm } from "./ProjectForm";
import { Button } from "./ui";

export function CreateProject({
  busy,
  onSubmit,
  onCancel,
  canGenerate,
}: {
  busy: boolean;
  onSubmit: (details: ProjectDetails, template: TemplateId, generate: boolean) => void;
  /** A model is configured, so the copy can be written with AI right after creation. */
  canGenerate: boolean;
  onCancel: (() => void) | null;
}) {
  const t = useT();
  const [template, setTemplate] = useState<TemplateId>("base-vite-react");
  const [generate, setGenerate] = useState(true);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[18px] font-semibold">{t("create.title")}</h1>
        <p className="text-muted">{t("create.intro")}</p>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[12px] font-medium">{t("create.template")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATE_IDS.map((id) => (
            <label
              key={id}
              className={`flex cursor-pointer flex-col gap-0.5 rounded border px-3 py-2 ${
                template === id ? "border-accent bg-raised" : "border-line hover:border-muted"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="template"
                  value={id}
                  checked={template === id}
                  onChange={() => setTemplate(id)}
                />
                {t(`template.${id}`)}
              </span>
              <span className="text-[12px] text-muted">{t(`template.${id}.hint`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {canGenerate && (
        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={generate}
            onChange={(e) => setGenerate(e.target.checked)}
          />
          {t("create.generate")}
        </label>
      )}
      <ProjectForm
        initial={EMPTY_DETAILS}
        onSubmit={(details) => onSubmit(details, template, canGenerate && generate)}
        showNameHint
        actions={(canSubmit) => (
          <>
            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit || busy}
              icon={
                busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : undefined
              }
            >
              {busy ? t("create.submitting") : t("create.submit")}
            </Button>
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} disabled={busy}>
                {t("create.cancel")}
              </Button>
            )}
            <span className="text-[12px] text-muted">{t("create.folderNote")}</span>
          </>
        )}
      />
    </div>
  );
}
