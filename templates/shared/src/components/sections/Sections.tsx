import { site } from "../../content/site";
import type { Section } from "../../content/types";
import { ButtonLink, Container, Picture, SectionTitle } from "../ui";

type Of<T extends Section["type"]> = Extract<Section, { type: T }>;

function Hero({ s }: { s: Of<"hero"> }) {
  return (
    <section
      id={s.id}
      data-editor-id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="border-b border-line"
    >
      <Container className="grid items-center gap-10 py-16 md:grid-cols-[3fr_2fr] md:py-24">
        <div className="flex flex-col gap-5">
          {s.eyebrow && (
            <p className="text-sm font-semibold tracking-wide text-brand uppercase">{s.eyebrow}</p>
          )}
          <h1
            id={`${s.id}-title`}
            className="font-display text-4xl leading-tight text-ink md:text-6xl"
          >
            {s.title}
          </h1>
          <p className="max-w-prose text-lg text-soft">{s.text}</p>
          {s.cta && (
            <div>
              <ButtonLink href={s.cta.href}>{s.cta.label}</ButtonLink>
            </div>
          )}
        </div>
        <Picture image={s.image} className="aspect-[4/5] w-full rounded-sm" />
      </Container>
    </section>
  );
}

function About({ s }: { s: Of<"about"> }) {
  return (
    <section
      id={s.id}
      data-editor-id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="border-b border-line"
    >
      <Container className="grid gap-10 py-16 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SectionTitle id={`${s.id}-title`}>{s.title}</SectionTitle>
          <p className="max-w-prose text-lg leading-relaxed whitespace-pre-line text-soft">
            {s.text}
          </p>
        </div>
        {s.image && <Picture image={s.image} className="aspect-[4/3] w-full rounded-sm" />}
      </Container>
    </section>
  );
}

function Services({ s }: { s: Of<"services"> }) {
  return (
    <section
      id={s.id}
      data-editor-id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="border-b border-line bg-surface"
    >
      <Container className="py-16">
        <SectionTitle id={`${s.id}-title`}>{s.title}</SectionTitle>
        {s.intro && <p className="mt-3 max-w-prose text-soft">{s.intro}</p>}
        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {s.items.map((item, i) => (
            <li
              key={i}
              data-editor-id={`${s.id}-${i + 1}`}
              className="border-t-2 border-brand pt-4"
            >
              <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-soft">{item.text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Menu({ s }: { s: Of<"menu"> }) {
  return (
    <section
      id={s.id}
      data-editor-id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="border-b border-line"
    >
      <Container className="py-16">
        <SectionTitle id={`${s.id}-title`}>{s.title}</SectionTitle>
        {s.intro && <p className="mt-3 max-w-prose text-soft">{s.intro}</p>}
        <div className="mt-10 grid gap-12 md:grid-cols-2">
          {s.groups.map((group, g) => (
            <div key={g} data-editor-id={`${s.id}-${g + 1}`}>
              <h3 className="font-display text-2xl text-ink">{group.title}</h3>
              <ul className="mt-4 divide-y divide-line">
                {group.items.map((item, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-6 py-3">
                    <span>
                      <span className="font-semibold text-ink">{item.name}</span>
                      {item.description && (
                        <span className="block text-sm text-soft">{item.description}</span>
                      )}
                    </span>
                    {item.price && (
                      <span className="whitespace-nowrap font-semibold text-ink">{item.price}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Hours({ s }: { s: Of<"hours"> }) {
  return (
    <section
      id={s.id}
      data-editor-id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="border-b border-line"
    >
      <Container className="grid gap-8 py-16 md:grid-cols-[1fr_2fr]">
        <SectionTitle id={`${s.id}-title`}>{s.title}</SectionTitle>
        <dl className="grid gap-3 text-lg">
          {site.business.hours.map((h, i) => (
            <div key={i} className="flex justify-between gap-6 border-b border-line pb-3">
              <dt className="text-soft">{h.days}</dt>
              <dd className="font-semibold text-ink">{h.time}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Testimonials({ s }: { s: Of<"testimonials"> }) {
  if (!s.items.length) return null;
  return (
    <section
      id={s.id}
      data-editor-id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="border-b border-line bg-surface"
    >
      <Container className="py-16">
        <SectionTitle id={`${s.id}-title`}>{s.title}</SectionTitle>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {s.items.map((t, i) => (
            <figure key={i} className="border-l-2 border-brand pl-5">
              <blockquote className="text-lg text-ink">“{t.quote}”</blockquote>
              <figcaption className="mt-2 text-sm text-soft">{t.author}</figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Gallery({ s }: { s: Of<"gallery"> }) {
  return (
    <section
      id={s.id}
      data-editor-id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="border-b border-line"
    >
      <Container className="py-16">
        <SectionTitle id={`${s.id}-title`}>{s.title}</SectionTitle>
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {(s.images.length ? s.images : [undefined, undefined, undefined]).map((image, i) => (
            <Picture key={i} image={image} className="aspect-square w-full rounded-sm" />
          ))}
        </div>
      </Container>
    </section>
  );
}

function Contact({ s }: { s: Of<"contact"> }) {
  const { business } = site;
  return (
    <section id={s.id} data-editor-id={s.id} aria-labelledby={`${s.id}-title`}>
      <Container className="grid gap-8 py-16 md:grid-cols-[1fr_2fr]">
        <div>
          <SectionTitle id={`${s.id}-title`}>{s.title}</SectionTitle>
          {s.text && <p className="mt-3 text-soft">{s.text}</p>}
        </div>
        <address className="grid gap-6 not-italic sm:grid-cols-2">
          {business.address && (
            <p>
              <span className="block text-sm text-soft">Morada</span>
              {business.address}
            </p>
          )}
          {business.phone && (
            <p>
              <span className="block text-sm text-soft">Telefone</span>
              <a
                href={`tel:${business.phone.replace(/\s/g, "")}`}
                className="underline underline-offset-4"
              >
                {business.phone}
              </a>
            </p>
          )}
          {business.email && (
            <p>
              <span className="block text-sm text-soft">Email</span>
              <a href={`mailto:${business.email}`} className="underline underline-offset-4">
                {business.email}
              </a>
            </p>
          )}
        </address>
      </Container>
    </section>
  );
}

/** Renders a page's visible sections in order. */
export function Sections({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections
        .filter((s) => !s.hidden)
        .map((s) => {
          switch (s.type) {
            case "hero":
              return <Hero key={s.id} s={s} />;
            case "about":
              return <About key={s.id} s={s} />;
            case "services":
              return <Services key={s.id} s={s} />;
            case "menu":
              return <Menu key={s.id} s={s} />;
            case "hours":
              return <Hours key={s.id} s={s} />;
            case "testimonials":
              return <Testimonials key={s.id} s={s} />;
            case "gallery":
              return <Gallery key={s.id} s={s} />;
            case "contact":
              return <Contact key={s.id} s={s} />;
          }
        })}
    </>
  );
}
