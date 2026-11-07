import { site } from "../content/site";

export function Footer() {
  return (
    <footer data-editor-id="site-footer" className="bg-ink text-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm sm:flex-row sm:justify-between">
        <p>
          © {new Date().getFullYear()} {site.client || site.name}
        </p>
        <p className="opacity-70">{site.contact.email}</p>
      </div>
    </footer>
  );
}
