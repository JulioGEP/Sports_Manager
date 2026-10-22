import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "./icons";

/** Enlace de vuelta (DESIGN.md 9.11): discreto, dentro de la cabecera, nunca un botón que flota encima. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1.5 text-secondary font-medium text-muted no-underline transition-colors hover:text-ink"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {children}
    </Link>
  );
}

/**
 * Cabecera de pantalla (DESIGN.md 9.11): enlace de vuelta, línea de contexto, título en Título 1,
 * descripción corta y las acciones a la derecha. Una sola acción principal.
 */
export function PageHeader({
  backTo,
  backLabel,
  eyebrow,
  title,
  description,
  actions,
}: {
  /** De dónde se viene: el enlace de vuelta forma parte de la cabecera, no flota encima. */
  backTo?: string | undefined;
  backLabel?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {backTo ? <BackLink to={backTo}>{backLabel}</BackLink> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? <div className="text-secondary text-muted">{eyebrow}</div> : null}
          <h1 className="flex flex-wrap items-center gap-3 text-title1 lg:text-title1-lg text-ink">
            {title}
          </h1>
          {description ? <p className="text-body text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
