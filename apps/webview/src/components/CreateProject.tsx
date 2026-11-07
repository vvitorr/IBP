import { LoaderCircle } from "lucide-react";
import type { ProjectDetails } from "@ibp/shared";
import { useT } from "../i18n";
import { EMPTY_DETAILS, ProjectForm } from "./ProjectForm";
import { Button } from "./ui";

export function CreateProject({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (details: ProjectDetails) => void;
  onCancel: (() => void) | null;
}) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[18px] font-semibold">{t("create.title")}</h1>
        <p className="text-muted">{t("create.intro")}</p>
      </div>
      <ProjectForm
        initial={EMPTY_DETAILS}
        onSubmit={onSubmit}
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
