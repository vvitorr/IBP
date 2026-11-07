import { site } from "../content/site";

export function Header() {
  return (
    <header data-editor-id="site-header" className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4">
        <a href="#" className="font-display text-xl text-ink">
          {site.name}
        </a>
        <nav aria-label="Navegação principal">
          <ul className="flex gap-5 text-sm">
            {site.nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="text-soft hover:text-ink">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
