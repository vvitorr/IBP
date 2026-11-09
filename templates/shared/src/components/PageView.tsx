import type { Page } from "../content/types";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Sections } from "./sections/Sections";

/** A whole page: skip link, header, the page's sections, footer. */
export function PageView({ page }: { page: Page }) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-paper focus:px-3 focus:py-2"
      >
        Saltar para o conteúdo
      </a>
      <Header slug={page.slug} />
      <main id="conteudo">
        <Sections sections={page.sections} />
      </main>
      <Footer />
    </>
  );
}
