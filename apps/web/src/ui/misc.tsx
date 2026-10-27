import type { ReactNode } from "react";

/** Estado vacío: icono de 36 px, título, texto y, si procede, una acción. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      {icon ? <div className="text-club-text [&_svg]:size-9">{icon}</div> : null}
      <p className="text-body font-medium text-ink">{title}</p>
      {description ? <p className="max-w-sm text-secondary text-muted">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const avatarSizes = {
  /** Solo en pilas de caras (ADR 0057), donde el nombre va en la etiqueta. */
  xs: "size-7 text-label tracking-tighter",
  sm: "size-8 text-label",
  md: "size-10 text-secondary",
  lg: "size-14 text-body",
  xl: "size-20 text-title2",
};

/** Avatar: la foto si la hay (Bloque 12); si no, iniciales sobre superficie elevada. */
export function Avatar({
  name,
  size = "md",
  src,
  alt,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  src?: string | null | undefined;
  /** Texto alternativo de la foto. Sin él, la foto es decorativa (el nombre va al lado). */
  alt?: string | undefined;
}) {
  if (src) {
    return (
      <span
        className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-raised ${avatarSizes[size]}`}
      >
        <img src={src} alt={alt ?? ""} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full bg-raised font-semibold text-ink ${avatarSizes[size]}`}
    >
      {initials(name)}
    </span>
  );
}

/** Escudo del club: imagen o iniciales en color del club. */
export function Crest({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl?: string | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "sm"
      ? "size-8 text-label"
      : size === "lg"
        ? "size-14 text-title2"
        : "size-10 text-secondary";
  if (logoUrl) {
    return (
      <span
        className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface ${dims}`}
      >
        <img src={logoUrl} alt="" className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full bg-club font-semibold text-on-club ${dims}`}
    >
      {initials(name)}
    </span>
  );
}

/** Métrica: icono duotono, cifra en Geist Mono y etiqueta. */
export function Stat({
  icon,
  value,
  label,
}: {
  icon?: ReactNode;
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card bg-surface p-4 shadow-card precisa:border precisa:border-border">
      {icon ? (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-club-soft text-club-soft-text [&_svg]:size-6">
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-title2 text-ink">{value}</span>
        <span className="text-secondary text-muted">{label}</span>
      </div>
    </div>
  );
}

/** Lista de definiciones a dos columnas, para resúmenes. */
export function Definitions({ items }: { items: { term: ReactNode; detail: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="text-secondary text-muted">{item.term}</dt>
          <dd className="min-w-0 font-medium text-ink">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
