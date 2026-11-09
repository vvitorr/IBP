import type { ReactNode } from "react";
import type { Image } from "../content/types";

// Small design-system primitives: one container width, one section rhythm, one button style.

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-display text-3xl leading-tight text-ink md:text-4xl">
      {children}
    </h2>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary"
      ? "bg-brand text-brand-contrast hover:opacity-90"
      : "border border-ink/20 text-ink hover:border-ink";
  return (
    <a
      href={href}
      className={`inline-block rounded-sm px-5 py-3 text-sm font-semibold transition ${styles}`}
    >
      {children}
    </a>
  );
}

/** A photo, or a calm placeholder until the owner adds one. */
export function Picture({ image, className = "" }: { image?: Image; className?: string }) {
  if (!image) return <div aria-hidden className={`bg-surface ${className}`} />;
  return (
    <img src={image.src} alt={image.alt} loading="lazy" className={`object-cover ${className}`} />
  );
}
