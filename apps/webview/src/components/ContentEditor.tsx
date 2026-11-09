import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash,
  X,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  SECTION_TYPES,
  THEME_IDS,
  type AppError,
  type ProjectSummary,
  type SectionType,
  type SiteContent,
  type SiteSection,
} from "@ibp/shared";
import { onHostMessage, request } from "../host";
import { useT } from "../i18n";
import { Button } from "./ui";

type Image = { src: string; alt: string };

/** New sections start with editable placeholders; ids stay unique on the page. */
function newSection(type: SectionType, taken: string[]): SiteSection {
  let id: string = type;
  for (let n = 2; taken.includes(id); n++) id = `${type}-${n}`;
  switch (type) {
    case "hero":
      return { id, type, title: "Título", text: "Texto" };
    case "about":
      return { id, type, title: "Sobre nós", text: "Texto" };
    case "services":
      return { id, type, title: "Serviços", items: [{ title: "Serviço", text: "Descrição" }] };
    case "menu":
      return { id, type, title: "Menu", groups: [{ title: "Grupo", items: [{ name: "Prato" }] }] };
    case "hours":
      return { id, type, title: "Horário" };
    case "testimonials":
      return { id, type, title: "Opiniões", items: [] };
    case "gallery":
      return { id, type, title: "Galeria", images: [] };
    case "contact":
      return { id, type, title: "Contactos" };
  }
}

function Text({
  label,
  value,
  onChange,
  max,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={4}
          value={value}
          maxLength={max}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function Group({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded border border-line bg-surface p-3">
      <legend className="flex items-center gap-2 px-1 text-[12px] font-semibold">
        {title}
        {actions}
      </legend>
      {children}
    </fieldset>
  );
}

function IconButton({
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

/**
 * Form editor for src/content/site.json: business details, theme, pages and their sections,
 * images. Saving writes validated JSON; the live preview updates by itself.
 */
export function ContentEditor({
  project,
  canGenerate,
  onGenerate,
  onError,
}: {
  project: ProjectSummary;
  canGenerate: boolean;
  onGenerate: () => void;
  onError: (error: AppError) => void;
}) {
  const t = useT();
  const [content, setContent] = useState<SiteContent | null | undefined>(undefined);
  const [original, setOriginal] = useState<SiteContent | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const off = onHostMessage((message) => {
      if (message.type === "site/content" && message.projectId === project.id) {
        setContent(message.content);
        setOriginal(message.content);
      }
    });
    void request({ type: "site/get", id: project.id }).then((r) => {
      if (!r.ok) {
        setContent(null);
        onError(r.error);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the parent remounts per project (key)
  }, [project.id]);

  if (content === undefined) {
    return (
      <p className="flex items-center gap-2 p-6 text-muted">
        <LoaderCircle size={14} className="animate-spin" aria-hidden /> {t("content.loading")}
      </p>
    );
  }
  if (content === null) return <p className="p-6 text-muted">{t("content.missing")}</p>;

  const dirty = JSON.stringify(content) !== JSON.stringify(original);
  /** Immutable edit: copy, change, store. */
  const edit = (change: (draft: SiteContent) => void) => {
    setStatus("idle");
    setContent((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      change(draft);
      return draft;
    });
  };

  async function save() {
    if (!content) return;
    setStatus("saving");
    const response = await request({ type: "site/save", id: project.id, content });
    if (response.ok) {
      setOriginal(content);
      setStatus("saved");
    } else {
      setStatus("idle");
      onError(response.error);
    }
  }

  async function pickImage(apply: (image: Image) => void) {
    const response = await request({ type: "site/image", id: project.id });
    if (response.ok && response.value) apply({ src: response.value, alt: "" });
    else if (!response.ok && response.error.code !== "cancelled") onError(response.error);
  }

  const imageField = (image: Image | undefined, set: (image: Image | undefined) => void) => (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-medium">{t("content.image")}</span>
      {image ? (
        <div className="flex items-start gap-3">
          <code className="font-mono text-[11px] break-all text-muted">{image.src}</code>
          <IconButton label={t("content.image.remove")} onClick={() => set(undefined)}>
            <X size={13} aria-hidden />
          </IconButton>
        </div>
      ) : null}
      {image && (
        <Text
          label={t("content.image.alt")}
          value={image.alt}
          max={200}
          onChange={(alt) => set({ ...image, alt })}
        />
      )}
      <div>
        <Button
          icon={<ImagePlus size={13} aria-hidden />}
          onClick={() => void pickImage((next) => set({ ...next, alt: image?.alt ?? "" }))}
        >
          {t("content.image.upload")}
        </Button>
      </div>
    </div>
  );

  function sectionFields(pageIndex: number, sectionIndex: number, s: SiteSection) {
    const set = (change: (section: SiteSection) => void) =>
      edit((d) => {
        const section = d.pages[pageIndex]?.sections[sectionIndex];
        if (section) change(section);
      });
    const common = (
      <Text
        label={t("content.field.title")}
        value={s.title}
        max={120}
        onChange={(v) => set((x) => void (x.title = v))}
      />
    );
    switch (s.type) {
      case "hero":
        return (
          <>
            <Text
              label={t("content.field.eyebrow")}
              value={s.eyebrow ?? ""}
              max={80}
              onChange={(v) => set((x) => x.type === "hero" && (x.eyebrow = v || undefined))}
            />
            {common}
            <Text
              label={t("content.field.text")}
              value={s.text}
              max={400}
              multiline
              onChange={(v) => set((x) => x.type === "hero" && (x.text = v))}
            />
            {s.cta && (
              <Text
                label={t("content.field.cta")}
                value={s.cta.label}
                max={60}
                onChange={(v) => set((x) => x.type === "hero" && x.cta && (x.cta.label = v))}
              />
            )}
            {imageField(s.image, (image) => set((x) => x.type === "hero" && (x.image = image)))}
          </>
        );
      case "about":
        return (
          <>
            {common}
            <Text
              label={t("content.field.text")}
              value={s.text}
              max={2000}
              multiline
              onChange={(v) => set((x) => x.type === "about" && (x.text = v))}
            />
            {imageField(s.image, (image) => set((x) => x.type === "about" && (x.image = image)))}
          </>
        );
      case "services":
        return (
          <>
            {common}
            <Text
              label={t("content.field.intro")}
              value={s.intro ?? ""}
              max={400}
              onChange={(v) => set((x) => x.type === "services" && (x.intro = v || undefined))}
            />
            {s.items.map((item, i) => (
              <Group
                key={i}
                title={`${i + 1}.`}
                actions={
                  <IconButton
                    label={t("content.remove")}
                    onClick={() => set((x) => x.type === "services" && x.items.splice(i, 1))}
                  >
                    <X size={12} aria-hidden />
                  </IconButton>
                }
              >
                <Text
                  label={t("content.field.itemTitle")}
                  value={item.title}
                  max={80}
                  onChange={(v) =>
                    set((x) => x.type === "services" && x.items[i] && (x.items[i].title = v))
                  }
                />
                <Text
                  label={t("content.field.itemText")}
                  value={item.text}
                  max={400}
                  multiline
                  onChange={(v) =>
                    set((x) => x.type === "services" && x.items[i] && (x.items[i].text = v))
                  }
                />
              </Group>
            ))}
            <div>
              <Button
                icon={<Plus size={13} aria-hidden />}
                disabled={s.items.length >= 12}
                onClick={() =>
                  set((x) => x.type === "services" && x.items.push({ title: "", text: "" }))
                }
              >
                {t("content.add")}
              </Button>
            </div>
          </>
        );
      case "menu":
        return (
          <>
            {common}
            <Text
              label={t("content.field.intro")}
              value={s.intro ?? ""}
              max={400}
              onChange={(v) => set((x) => x.type === "menu" && (x.intro = v || undefined))}
            />
            {s.groups.map((group, g) => (
              <Group
                key={g}
                title={group.title || `${g + 1}.`}
                actions={
                  <IconButton
                    label={t("content.remove")}
                    onClick={() => set((x) => x.type === "menu" && x.groups.splice(g, 1))}
                  >
                    <X size={12} aria-hidden />
                  </IconButton>
                }
              >
                <Text
                  label={t("content.field.groupTitle")}
                  value={group.title}
                  max={80}
                  onChange={(v) =>
                    set((x) => x.type === "menu" && x.groups[g] && (x.groups[g].title = v))
                  }
                />
                {group.items.map((item, i) => (
                  <div key={i} className="grid items-end gap-2 sm:grid-cols-[2fr_3fr_1fr_auto]">
                    <Text
                      label={t("content.field.itemName")}
                      value={item.name}
                      max={80}
                      onChange={(v) =>
                        set(
                          (x) =>
                            x.type === "menu" &&
                            x.groups[g]?.items[i] &&
                            (x.groups[g].items[i].name = v),
                        )
                      }
                    />
                    <Text
                      label={t("content.field.itemText")}
                      value={item.description ?? ""}
                      max={200}
                      onChange={(v) =>
                        set(
                          (x) =>
                            x.type === "menu" &&
                            x.groups[g]?.items[i] &&
                            (x.groups[g].items[i].description = v || undefined),
                        )
                      }
                    />
                    <Text
                      label={t("content.field.itemPrice")}
                      value={item.price ?? ""}
                      max={20}
                      onChange={(v) =>
                        set(
                          (x) =>
                            x.type === "menu" &&
                            x.groups[g]?.items[i] &&
                            (x.groups[g].items[i].price = v || undefined),
                        )
                      }
                    />
                    <IconButton
                      label={t("content.remove")}
                      onClick={() =>
                        set((x) => x.type === "menu" && x.groups[g]?.items.splice(i, 1))
                      }
                    >
                      <X size={12} aria-hidden />
                    </IconButton>
                  </div>
                ))}
                <div>
                  <Button
                    icon={<Plus size={13} aria-hidden />}
                    onClick={() =>
                      set((x) => x.type === "menu" && x.groups[g]?.items.push({ name: "" }))
                    }
                  >
                    {t("content.add")}
                  </Button>
                </div>
              </Group>
            ))}
            <div>
              <Button
                icon={<Plus size={13} aria-hidden />}
                onClick={() =>
                  set((x) => x.type === "menu" && x.groups.push({ title: "", items: [] }))
                }
              >
                {t("content.field.groupTitle")}
              </Button>
            </div>
          </>
        );
      case "testimonials":
        return (
          <>
            {common}
            <p className="text-[12px] text-warning">{t("content.testimonials.hint")}</p>
            {s.items.map((item, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[3fr_1fr_auto]">
                <Text
                  label={t("content.field.quote")}
                  value={item.quote}
                  max={400}
                  onChange={(v) =>
                    set((x) => x.type === "testimonials" && x.items[i] && (x.items[i].quote = v))
                  }
                />
                <Text
                  label={t("content.field.author")}
                  value={item.author}
                  max={80}
                  onChange={(v) =>
                    set((x) => x.type === "testimonials" && x.items[i] && (x.items[i].author = v))
                  }
                />
                <IconButton
                  label={t("content.remove")}
                  onClick={() => set((x) => x.type === "testimonials" && x.items.splice(i, 1))}
                >
                  <X size={12} aria-hidden />
                </IconButton>
              </div>
            ))}
            <div>
              <Button
                icon={<Plus size={13} aria-hidden />}
                onClick={() =>
                  set((x) => x.type === "testimonials" && x.items.push({ quote: "", author: "" }))
                }
              >
                {t("content.add")}
              </Button>
            </div>
          </>
        );
      case "gallery":
        return (
          <>
            {common}
            {s.images.map((image, i) => (
              <div key={i} className="flex items-end gap-2">
                <code className="mb-2 font-mono text-[11px] break-all text-muted">{image.src}</code>
                <div className="min-w-0 flex-1">
                  <Text
                    label={t("content.image.alt")}
                    value={image.alt}
                    max={200}
                    onChange={(v) =>
                      set((x) => x.type === "gallery" && x.images[i] && (x.images[i].alt = v))
                    }
                  />
                </div>
                <IconButton
                  label={t("content.image.remove")}
                  onClick={() => set((x) => x.type === "gallery" && x.images.splice(i, 1))}
                >
                  <X size={12} aria-hidden />
                </IconButton>
              </div>
            ))}
            <div>
              <Button
                icon={<ImagePlus size={13} aria-hidden />}
                onClick={() =>
                  void pickImage((image) =>
                    set((x) => x.type === "gallery" && x.images.push(image)),
                  )
                }
              >
                {t("content.image.upload")}
              </Button>
            </div>
          </>
        );
      case "contact":
        return (
          <>
            {common}
            <Text
              label={t("content.field.text")}
              value={s.text ?? ""}
              max={400}
              onChange={(v) => set((x) => x.type === "contact" && (x.text = v || undefined))}
            />
          </>
        );
      case "hours":
        return common;
    }
  }

  const b = content.business;
  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-bg px-6 py-2">
        <Button
          variant="primary"
          disabled={!dirty || status === "saving"}
          onClick={() => void save()}
        >
          {status === "saving" ? t("content.saving") : t("content.save")}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setContent(original)}>
          {t("content.discard")}
        </Button>
        <span role="status" className="text-[12px] text-muted">
          {dirty ? t("content.dirty") : status === "saved" ? t("content.saved") : ""}
        </span>
        <div className="flex-1" />
        <Button
          disabled={!canGenerate}
          title={t("site.generate.hint")}
          icon={<Sparkles size={13} aria-hidden />}
          onClick={onGenerate}
        >
          {t("site.generate")}
        </Button>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
        <Group title={t("content.business")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text
              label={t("content.field.name")}
              value={b.name}
              max={80}
              onChange={(v) => edit((d) => void (d.business.name = v))}
            />
            <Text
              label={t("content.field.tagline")}
              value={b.tagline}
              max={160}
              onChange={(v) => edit((d) => void (d.business.tagline = v))}
            />
            <Text
              label={t("content.field.phone")}
              value={b.phone}
              max={40}
              onChange={(v) => edit((d) => void (d.business.phone = v))}
            />
            <Text
              label={t("content.field.email")}
              value={b.email}
              max={120}
              onChange={(v) => edit((d) => void (d.business.email = v))}
            />
          </div>
          <Text
            label={t("content.field.address")}
            value={b.address}
            max={200}
            onChange={(v) => edit((d) => void (d.business.address = v))}
          />
          <Text
            label={t("content.field.description")}
            value={b.description}
            max={600}
            multiline
            onChange={(v) => edit((d) => void (d.business.description = v))}
          />
          <span className="text-[12px] font-medium">{t("content.hours")}</span>
          {b.hours.map((h, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Text
                label={t("content.hours.days")}
                value={h.days}
                max={60}
                onChange={(v) => edit((d) => d.business.hours[i] && (d.business.hours[i].days = v))}
              />
              <Text
                label={t("content.hours.time")}
                value={h.time}
                max={60}
                onChange={(v) => edit((d) => d.business.hours[i] && (d.business.hours[i].time = v))}
              />
              <IconButton
                label={t("content.remove")}
                onClick={() => edit((d) => void d.business.hours.splice(i, 1))}
              >
                <X size={12} aria-hidden />
              </IconButton>
            </div>
          ))}
          <div>
            <Button
              icon={<Plus size={13} aria-hidden />}
              disabled={b.hours.length >= 10}
              onClick={() => edit((d) => void d.business.hours.push({ days: "", time: "" }))}
            >
              {t("content.add")}
            </Button>
          </div>
        </Group>

        <Group title={t("content.theme")}>
          <div role="radiogroup" aria-label={t("content.theme")} className="flex flex-wrap gap-2">
            {THEME_IDS.map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={content.theme === theme}
                onClick={() => edit((d) => void (d.theme = theme))}
                className={`rounded border px-3 py-1.5 text-[12px] ${content.theme === theme ? "border-accent bg-raised text-text" : "border-line text-muted hover:text-text"}`}
              >
                {t(`siteTheme.${theme}`)}
              </button>
            ))}
          </div>
        </Group>

        <h2 className="text-[15px] font-semibold">{t("content.pages")}</h2>
        {content.pages.map((page, p) => (
          <section
            key={page.slug || "home"}
            className="flex flex-col gap-3"
            aria-label={page.slug ? t("content.page", { title: page.title }) : t("content.home")}
          >
            <h3 className="font-semibold">
              {page.slug ? t("content.page", { title: page.title }) : t("content.home")}{" "}
              <code className="font-mono text-[11px] text-muted">/{page.slug}</code>
            </h3>
            {page.sections.map((section, i) => (
              <Group
                key={section.id}
                title={`${t(`content.section.${section.type}`)} · #${section.id}`}
                actions={
                  <span className="flex items-center gap-0.5 font-normal">
                    <label className="mr-2 flex items-center gap-1 text-muted">
                      <input
                        type="checkbox"
                        checked={Boolean(section.hidden)}
                        onChange={(e) =>
                          edit((d) => {
                            const s = d.pages[p]?.sections[i];
                            if (s) s.hidden = e.target.checked || undefined;
                          })
                        }
                      />
                      {t("content.section.hidden")}
                    </label>
                    <IconButton
                      label={t("content.section.up")}
                      disabled={i === 0}
                      onClick={() =>
                        edit((d) => {
                          const list = d.pages[p]?.sections;
                          if (list) list.splice(i - 1, 0, ...list.splice(i, 1));
                        })
                      }
                    >
                      <ArrowUp size={12} aria-hidden />
                    </IconButton>
                    <IconButton
                      label={t("content.section.down")}
                      disabled={i === page.sections.length - 1}
                      onClick={() =>
                        edit((d) => {
                          const list = d.pages[p]?.sections;
                          if (list) list.splice(i + 1, 0, ...list.splice(i, 1));
                        })
                      }
                    >
                      <ArrowDown size={12} aria-hidden />
                    </IconButton>
                    <IconButton
                      label={t("content.section.remove")}
                      onClick={() => edit((d) => void d.pages[p]?.sections.splice(i, 1))}
                    >
                      <Trash size={12} aria-hidden />
                    </IconButton>
                  </span>
                }
              >
                {sectionFields(p, i, section)}
              </Group>
            ))}
            <label className="flex items-center gap-2 text-[12px]">
              {t("content.addSection")}
              <select
                value=""
                onChange={(e) => {
                  const type = e.target.value as SectionType;
                  if (type)
                    edit((d) => {
                      const pg = d.pages[p];
                      if (pg)
                        pg.sections.push(
                          newSection(
                            type,
                            pg.sections.map((s) => s.id),
                          ),
                        );
                    });
                }}
              >
                <option value="">…</option>
                {SECTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`content.section.${type}`)}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ))}
      </div>
    </div>
  );
}
