import { site } from "../content/site";
import { Container } from "./ui";

export function Footer() {
  const { business } = site;
  return (
    <footer data-editor-id="site-footer" className="bg-ink text-paper">
      <Container className="flex flex-col gap-2 py-8 text-sm sm:flex-row sm:justify-between">
        <p>
          © {new Date().getFullYear()} {business.client || business.name}
        </p>
        {business.email && <p className="opacity-70">{business.email}</p>}
      </Container>
    </footer>
  );
}
