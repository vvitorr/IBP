import { site } from "../content/site";

export function About() {
  return (
    <section
      id="sobre"
      data-editor-id="home-about"
      aria-labelledby="about-title"
      className="border-b border-line"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-[1fr_2fr]">
        <h2 id="about-title" className="font-display text-3xl">
          {site.about.title}
        </h2>
        <p className="max-w-prose text-lg leading-relaxed text-soft">{site.about.text}</p>
      </div>
    </section>
  );
}
