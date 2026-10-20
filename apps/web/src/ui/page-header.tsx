import type { ReactNode } from "react";

/** Cabecera de pantalla (DESIGN.md 9.11): título en Título 1 y una línea de contexto. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <div className="text-secondary text-muted">{eyebrow}</div> : null}
        <h1 className="flex flex-wrap items-center gap-3 text-title1 lg:text-title1-lg text-ink">
          {title}
        </h1>
        {description ? <p className="text-body text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
