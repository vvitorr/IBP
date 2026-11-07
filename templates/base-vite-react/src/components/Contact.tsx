import { site } from "../content/site";

export function Contact() {
  const { contact } = site;
  return (
    <section id="contactos" data-editor-id="home-contact" aria-labelledby="contact-title">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-[1fr_2fr]">
        <h2 id="contact-title" className="font-display text-3xl">
          {contact.title}
        </h2>
        <address className="grid gap-4 not-italic sm:grid-cols-2">
          <p>
            <span className="block text-sm text-soft">Morada</span>
            {contact.address}
          </p>
          <p>
            <span className="block text-sm text-soft">Telefone</span>
            <a
              href={`tel:${contact.phone.replace(/\s/g, "")}`}
              className="underline underline-offset-4"
            >
              {contact.phone}
            </a>
          </p>
          <p>
            <span className="block text-sm text-soft">Email</span>
            <a href={`mailto:${contact.email}`} className="underline underline-offset-4">
              {contact.email}
            </a>
          </p>
          <p>
            <span className="block text-sm text-soft">Horário</span>
            {contact.hours}
          </p>
        </address>
      </div>
    </section>
  );
}
