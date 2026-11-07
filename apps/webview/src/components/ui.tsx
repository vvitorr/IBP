import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 font-medium",
  secondary: "bg-raised text-text border border-line hover:border-muted",
  ghost: "text-muted hover:text-text hover:bg-raised",
};

export function Button({
  variant = "secondary",
  icon,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
      <h2 className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{title}</h2>
      <div className="flex items-center gap-1">{children}</div>
    </header>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[12px] font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "accent" | "warning";
  children: ReactNode;
}) {
  const tones = {
    muted: "border-line text-muted",
    accent: "border-accent text-accent",
    warning: "border-warning text-warning",
  };
  return (
    <span
      className={`rounded-sm border px-1 text-[10px] leading-4 font-medium uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
