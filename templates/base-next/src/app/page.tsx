import { PageView } from "@/components/PageView";
import { site } from "@/content/site";

export default function Home() {
  const home = site.pages[0];
  return home ? <PageView page={home} /> : null;
}
