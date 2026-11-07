import { site } from "../content/site";

export function Services() {
  return (
    <section
      id="servicos"
      data-editor-id="home-services"
      aria-labelledby="services-title"
      className="border-b border-line"
    >
      <div className="mx-auto max-w-6xl px-5 py-16">
        <h2 id="services-title" className="font-display text-3xl">
          {site.services.title}
        </h2>
        <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
          {site.services.items.map((service, index) => (
            <li
              key={service.title}
              data-editor-id={`service-${index + 1}`}
              className="border-t border-ink pt-4"
            >
              <h3 className="text-lg font-medium">{service.title}</h3>
              <p className="mt-2 text-soft">{service.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
