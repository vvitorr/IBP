import { site } from "../content/site";

export function Hero() {
  return (
    <section
      data-editor-id="home-hero"
      aria-labelledby="hero-title"
      className="border-b border-line"
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-20 md:grid-cols-[3fr_2fr] md:py-28">
        <div className="flex flex-col gap-5">
          <p className="text-sm tracking-wide text-soft uppercase">{site.name}</p>
          <h1 id="hero-title" className="font-display text-4xl leading-tight md:text-6xl">
            {site.hero.title}
          </h1>
          <p className="max-w-prose text-lg text-soft">{site.description || site.hero.subtitle}</p>
          <div>
            <a
              href="#contactos"
              className="inline-block rounded-sm bg-brand px-5 py-3 text-brand-contrast hover:opacity-90"
            >
              {site.hero.cta}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
