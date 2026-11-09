import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageView } from "@/components/PageView";
import { findPage, site } from "@/content/site";

// Every extra page in site.json is built as a static page at /<slug>.
export const dynamicParams = false;

export function generateStaticParams() {
  return site.pages.filter((page) => page.slug).map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const page = findPage((await params).slug);
  return page ? { title: page.title, description: page.description } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const page = findPage((await params).slug);
  if (!page) notFound();
  return <PageView page={page} />;
}
