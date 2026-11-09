import { navigation, site } from "../content/site";
import { Container } from "./ui";

export function Header({ slug }: { slug: string }) {
  const links = navigation(slug);
  return (
    <header data-editor-id="site-header" className="border-b border-line bg-paper">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
        <a href="/" className="font-display text-xl text-ink">
          {site.business.name}
        </a>
        {links.length > 0 && (
          <nav aria-label="Navegação principal">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {links.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-soft hover:text-ink">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </Container>
    </header>
  );
}
