import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  PlugZap,
  Plus,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  ERROR_MESSAGE_KEYS,
  PROVIDER_PRESETS,
  type AiState,
  type ModelRef,
  type ProviderPreset,
  type ProviderView,
  type Settings,
} from "@ibp/shared";
import type { RequestInput } from "../host";
import { useLocale, useT } from "../i18n";
import { Badge, Button } from "./ui";

type Run = (input: RequestInput) => Promise<boolean>;
const MAX_ROWS = 60;

/** AI provider settings: presets, keys (write-only), tests, models and the order of use. */
export function SettingsView({
  ai,
  mode,
  run,
  onClose,
}: {
  ai: AiState | null;
  mode: Settings["mode"];
  run: Run;
  onClose: () => void;
}) {
  const t = useT();
  const [preset, setPreset] = useState<ProviderPreset>("openrouter");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="px-1.5"
            onClick={onClose}
            aria-label={t("settings.close")}
            title={t("settings.close")}
          >
            <ArrowLeft size={15} aria-hidden />
          </Button>
          <h1 className="text-[18px] font-semibold">{t("settings.title")}</h1>
        </div>

        <section className="flex flex-col gap-3" aria-labelledby="ai-title">
          <div>
            <h2 id="ai-title" className="text-[15px] font-semibold">
              {t("ai.title")}
            </h2>
            <p className="text-muted">{t("ai.intro")}</p>
          </div>

          {ai && <StorageNotice status={ai.secureStorage} />}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-medium">
              {t("ai.addProvider")}
              <select value={preset} onChange={(e) => setPreset(e.target.value as ProviderPreset)}>
                {PROVIDER_PRESETS.map((id) => (
                  <option key={id} value={id}>
                    {t(`ai.preset.${id}`)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="primary"
              icon={<Plus size={14} aria-hidden />}
              onClick={() => void run({ type: "ai/provider/add", preset })}
            >
              {t("ai.addProvider")}
            </Button>
          </div>
          <p className="text-[12px] text-muted">{t(`ai.preset.${preset}.note`)}</p>

          {ai?.providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              preferences={ai.preferences}
              developer={mode === "developer"}
              run={run}
            />
          ))}
        </section>

        {ai && <Preferences ai={ai} run={run} />}
        {ai && <Usage ai={ai} />}
      </div>
    </div>
  );
}

function StorageNotice({ status }: { status: AiState["secureStorage"] }) {
  const t = useT();
  const ok = status === "os";
  return (
    <p
      className={`flex items-center gap-2 text-[12px] ${ok ? "text-muted" : "text-warning"}`}
      role={ok ? undefined : "alert"}
    >
      {ok ? <ShieldCheck size={14} aria-hidden /> : <ShieldAlert size={14} aria-hidden />}
      {t(`ai.storage.${status}`)}
    </p>
  );
}

function ProviderCard({
  provider,
  preferences,
  developer,
  run,
}: {
  provider: ProviderView;
  preferences: ModelRef[];
  developer: boolean;
  run: Run;
}) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [filter, setFilter] = useState("");
  const [freeOnly, setFreeOnly] = useState(provider.preset === "openrouter");
  const [toolsOnly, setToolsOnly] = useState(false);
  const providerId = provider.id;
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" });

  const matching = provider.models.filter(
    (m) =>
      m.id.toLowerCase().includes(filter.toLowerCase()) &&
      (!freeOnly || m.free === true) &&
      (!toolsOnly || m.tools === "yes"),
  );
  const inUse = (modelId: string) =>
    preferences.some((p) => p.providerId === providerId && p.modelId === modelId);

  async function test() {
    setTesting(true);
    await run({ type: "ai/provider/test", providerId });
    setTesting(false);
  }

  async function saveKey() {
    if (await run({ type: "ai/provider/setKey", providerId, key })) setKey("");
  }

  const health = provider.health;
  return (
    <article
      className="flex flex-col gap-3 rounded border border-line bg-surface p-4"
      aria-label={provider.name}
    >
      <header className="flex flex-wrap items-center gap-2">
        <PlugZap size={15} className="text-muted" aria-hidden />
        <h3 className="font-semibold">{provider.name}</h3>
        <Badge>{t(`ai.preset.${provider.preset}`)}</Badge>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={(e) =>
              void run({ type: "ai/provider/update", providerId, enabled: e.target.checked })
            }
          />
          {t("ai.provider.enabled")}
        </label>
        <Button
          variant="ghost"
          onClick={() => void run({ type: "ai/provider/remove", providerId })}
        >
          {t("ai.provider.remove")}
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <InlineField label={t("ai.provider.name")} htmlFor={`${id}-name`}>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            disabled={!name.trim() || name === provider.name}
            onClick={() => void run({ type: "ai/provider/update", providerId, name })}
          >
            {t("ai.provider.save")}
          </Button>
        </InlineField>
        <InlineField label={t("ai.provider.baseUrl")} htmlFor={`${id}-url`}>
          <input
            id={`${id}-url`}
            value={baseUrl}
            maxLength={500}
            placeholder="https://…/v1"
            onChange={(e) => setBaseUrl(e.target.value)}
            className="font-mono text-[12px]"
          />
          <Button
            disabled={!baseUrl.trim() || baseUrl === provider.baseUrl}
            onClick={() => void run({ type: "ai/provider/update", providerId, baseUrl })}
          >
            {t("ai.provider.save")}
          </Button>
        </InlineField>
      </div>

      <InlineField label={t("ai.provider.key")} htmlFor={`${id}-key`}>
        <input
          id={`${id}-key`}
          type="password"
          autoComplete="off"
          value={key}
          maxLength={1000}
          placeholder={t("ai.provider.keyPlaceholder")}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button
          disabled={!key.trim()}
          icon={<KeyRound size={13} aria-hidden />}
          onClick={() => void saveKey()}
        >
          {t("ai.provider.saveKey")}
        </Button>
        {provider.hasKey && (
          <Button
            variant="ghost"
            onClick={() => void run({ type: "ai/provider/clearKey", providerId })}
          >
            {t("ai.provider.clearKey")}
          </Button>
        )}
      </InlineField>
      <p className="-mt-2 text-[12px] text-muted">
        {provider.hasKey
          ? t("ai.provider.keySaved")
          : provider.keyRequired
            ? t("ai.provider.keyMissing")
            : t("ai.provider.keyOptional")}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={
            testing ? (
              <LoaderCircle size={13} className="animate-spin" aria-hidden />
            ) : (
              <PlugZap size={13} aria-hidden />
            )
          }
          disabled={testing || !provider.baseUrl || (provider.keyRequired && !provider.hasKey)}
          onClick={() => void test()}
        >
          {testing ? t("ai.provider.testing") : t("ai.provider.test")}
        </Button>
        <span
          role="status"
          className={`text-[12px] ${health.status === "error" ? "text-danger" : "text-muted"}`}
        >
          {health.status === "ok" &&
            t("ai.provider.health.ok", {
              models: provider.models.length,
              ms: health.latencyMs ?? 0,
            })}
          {health.status === "unknown" && t("ai.provider.health.unknown")}
          {health.status === "error" &&
            `${t("ai.provider.health.error")}${health.error ? ` — ${t(ERROR_MESSAGE_KEYS[health.error.code])}` : ""}`}
        </span>
        {provider.cooldownUntil && (
          <Badge tone="warning">
            {t("ai.provider.cooldown", { time: time.format(new Date(provider.cooldownUntil)) })}
          </Badge>
        )}
      </div>
      {developer && health.error?.detail && (
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer">{t("error.details")}</summary>
          <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap break-all">
            {health.error.detail}
          </pre>
        </details>
      )}

      {provider.models.length === 0 ? (
        <p className="text-[12px] text-muted">{t("ai.models.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <h4 className="font-semibold">{t("ai.models.title")}</h4>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("ai.models.filter")}
              aria-label={t("ai.models.filter")}
              className="w-56 py-0.5"
            />
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
              />
              {t("ai.models.freeOnly")}
            </label>
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={toolsOnly}
                onChange={(e) => setToolsOnly(e.target.checked)}
              />
              {t("ai.models.toolsOnly")}
            </label>
          </div>
          <table className="w-full text-left text-[12px]">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">{t("ai.models.model")}</th>
                <th className="py-1 font-medium">{t("ai.models.context")}</th>
                <th className="py-1 font-medium">{t("ai.models.tools")}</th>
                <th className="py-1 font-medium">{t("ai.models.free")}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {matching.slice(0, MAX_ROWS).map((model) => (
                <tr key={model.id} className="border-t border-line">
                  <td className="py-1 pr-2 font-mono break-all">{model.id}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {model.contextWindow ? `${Math.round(model.contextWindow / 1000)}k` : "?"}
                  </td>
                  <td className="py-1 pr-2">{t(`ai.${model.tools}`)}</td>
                  <td className="py-1 pr-2">
                    {model.free === null ? "?" : model.free ? t("ai.yes") : t("ai.no")}
                  </td>
                  <td className="py-1">
                    <span className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        className="px-1.5 py-0.5"
                        icon={<FlaskConical size={12} aria-hidden />}
                        onClick={() =>
                          void run({ type: "ai/model/probe", providerId, modelId: model.id })
                        }
                      >
                        {t("ai.models.probe")}
                      </Button>
                      <Button
                        className="px-1.5 py-0.5"
                        disabled={inUse(model.id)}
                        onClick={() =>
                          void run({
                            type: "ai/preferences/set",
                            order: [...preferences, { providerId, modelId: model.id }],
                          })
                        }
                      >
                        {inUse(model.id) ? t("ai.models.inUse") : t("ai.models.use")}
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {matching.length > MAX_ROWS && (
            <p className="text-[12px] text-muted">
              {t("ai.models.more", { count: matching.length - MAX_ROWS })}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function Preferences({ ai, run }: { ai: AiState; run: Run }) {
  const t = useT();
  const name = (id: string) => ai.providers.find((p) => p.id === id)?.name ?? id;
  const set = (order: ModelRef[]) => void run({ type: "ai/preferences/set", order });
  const move = (from: number, to: number) => {
    const order = [...ai.preferences];
    const [item] = order.splice(from, 1);
    if (item) order.splice(to, 0, item);
    set(order);
  };

  return (
    <section className="flex flex-col gap-2" aria-labelledby="prefs-title">
      <h2 id="prefs-title" className="text-[15px] font-semibold">
        {t("ai.preferences.title")}
      </h2>
      <p className="text-[12px] text-muted">{t("ai.preferences.hint")}</p>
      {ai.preferences.length === 0 ? (
        <p className="text-muted">{t("ai.preferences.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {ai.preferences.map((ref, index) => (
            <li
              key={`${ref.providerId}|${ref.modelId}`}
              className="flex items-center gap-2 rounded border border-line px-2 py-1"
            >
              <span className="w-5 text-muted">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                {name(ref.providerId)} · {ref.modelId}
              </span>
              <IconAction
                label={t("ai.preferences.up")}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp size={13} aria-hidden />
              </IconAction>
              <IconAction
                label={t("ai.preferences.down")}
                disabled={index === ai.preferences.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown size={13} aria-hidden />
              </IconAction>
              <IconAction
                label={t("ai.preferences.remove")}
                onClick={() => set(ai.preferences.filter((_, i) => i !== index))}
              >
                <X size={13} aria-hidden />
              </IconAction>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Usage({ ai }: { ai: AiState }) {
  const t = useT();
  const name = (id: string) => ai.providers.find((p) => p.id === id)?.name ?? id;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="usage-title">
      <h2 id="usage-title" className="text-[15px] font-semibold">
        {t("ai.usage.title")}
      </h2>
      {ai.usageToday.length === 0 ? (
        <p className="text-muted">{t("ai.usage.empty")}</p>
      ) : (
        <table className="w-full text-left text-[12px]">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">{t("ai.models.model")}</th>
              <th className="py-1 font-medium">{t("ai.usage.requests")}</th>
              <th className="py-1 font-medium">{t("ai.usage.errors")}</th>
              <th className="py-1 font-medium">{t("ai.usage.tokens")}</th>
            </tr>
          </thead>
          <tbody>
            {ai.usageToday.map((row) => (
              <tr key={`${row.providerId}|${row.modelId}`} className="border-t border-line">
                <td className="py-1 pr-2 font-mono">
                  {name(row.providerId)} · {row.modelId}
                </td>
                <td className="py-1">{row.requests}</td>
                <td className="py-1">{row.errors}</td>
                <td className="py-1">{row.promptTokens + row.completionTokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function InlineField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[12px] font-medium">
        {label}
      </label>
      <div className="flex gap-2 [&>input]:min-w-0 [&>input]:flex-1">{children}</div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-muted hover:bg-raised hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}
