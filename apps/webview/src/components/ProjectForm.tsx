import { useId, useState, type FormEvent, type ReactNode } from "react";
import { INDUSTRIES, type ProjectDetails } from "@ibp/shared";
import { useT } from "../i18n";
import { Field } from "./ui";

export const EMPTY_DETAILS: ProjectDetails = {
  name: "",
  client: "",
  industry: "restaurant",
  description: "",
};

/** Shared by "new project" and the properties panel, so both validate the same way. */
export function ProjectForm({
  initial,
  onSubmit,
  showNameHint = false,
  actions,
}: {
  initial: ProjectDetails;
  onSubmit: (details: ProjectDetails) => void;
  showNameHint?: boolean;
  actions: (canSubmit: boolean) => ReactNode;
}) {
  const t = useT();
  const id = useId();
  const [details, setDetails] = useState(initial);
  const set = <K extends keyof ProjectDetails>(key: K, value: ProjectDetails[K]) =>
    setDetails((d) => ({ ...d, [key]: value }));
  const canSubmit = /[\p{L}\p{N}]/u.test(details.name);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit(details);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label={t("field.name")}
        hint={showNameHint ? t("field.name.hint") : undefined}
        htmlFor={`${id}-name`}
      >
        <input
          id={`${id}-name`}
          required
          maxLength={80}
          value={details.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label={t("field.client")} htmlFor={`${id}-client`}>
        <input
          id={`${id}-client`}
          maxLength={80}
          value={details.client}
          onChange={(e) => set("client", e.target.value)}
        />
      </Field>
      <Field label={t("field.industry")} htmlFor={`${id}-industry`}>
        <select
          id={`${id}-industry`}
          value={details.industry}
          onChange={(e) => set("industry", e.target.value as ProjectDetails["industry"])}
        >
          {INDUSTRIES.map((industry) => (
            <option key={industry} value={industry}>
              {t(`industry.${industry}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("field.description")} htmlFor={`${id}-description`}>
        <textarea
          id={`${id}-description`}
          rows={4}
          maxLength={2000}
          value={details.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="flex items-center gap-2">{actions(canSubmit)}</div>
    </form>
  );
}
