import { LOCALES, MODES, THEMES, type Settings, type SettingUpdate } from "@ibp/shared";
import { useT } from "../i18n";

export function TopBar({
  settings,
  projectName,
  onChange,
}: {
  settings: Settings;
  projectName: string | null;
  onChange: (update: SettingUpdate) => void;
}) {
  const t = useT();
  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-surface px-3">
      <div className="flex items-baseline gap-2">
        <span className="rounded-sm bg-accent px-1.5 font-mono text-[12px] font-bold text-accent-ink">
          IBP
        </span>
        <span className="font-medium">Studio</span>
        <span className="hidden text-[12px] text-muted md:inline">{t("app.tagline")}</span>
      </div>

      <div
        className="min-w-0 flex-1 truncate text-center text-[12px] text-muted"
        aria-live="polite"
      >
        {projectName ?? t("topbar.noProject")}
      </div>

      <div
        role="radiogroup"
        aria-label={t("topbar.mode")}
        className="flex rounded border border-line p-0.5"
      >
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={settings.mode === mode}
            onClick={() => onChange({ key: "mode", value: mode })}
            className={`rounded-sm px-2 py-0.5 text-[12px] ${
              settings.mode === mode ? "bg-raised text-text" : "text-muted hover:text-text"
            }`}
          >
            {t(`mode.${mode}`)}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-[12px] text-muted">
        {t("topbar.language")}
        <select
          value={settings.language}
          onChange={(e) =>
            onChange({ key: "language", value: e.target.value as Settings["language"] })
          }
          className="py-0.5"
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {t(`language.${locale}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-[12px] text-muted">
        {t("topbar.theme")}
        <select
          value={settings.theme}
          onChange={(e) => onChange({ key: "theme", value: e.target.value as Settings["theme"] })}
          className="py-0.5"
        >
          {THEMES.map((theme) => (
            <option key={theme} value={theme}>
              {t(`theme.${theme}`)}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
