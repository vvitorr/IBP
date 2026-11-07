import { TriangleAlert, X } from "lucide-react";
import { ERROR_MESSAGE_KEYS, type AppError } from "@ibp/shared";
import { useT } from "../i18n";

/** Plain-language message first; the technical detail stays one click away. */
export function ErrorNotice({ error, onDismiss }: { error: AppError; onDismiss: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex gap-2 border-b border-line bg-raised px-3 py-2">
      <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p>{t(ERROR_MESSAGE_KEYS[error.code])}</p>
        {error.detail && (
          <details className="mt-1 text-[12px] text-muted">
            <summary className="cursor-pointer">{t("error.details")}</summary>
            <pre className="mt-1 font-mono whitespace-pre-wrap break-all">{error.detail}</pre>
          </details>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("error.dismiss")}
        className="self-start rounded p-0.5 text-muted hover:text-text"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
