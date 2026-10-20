import type { ReactNode } from "react";

/** Tarjeta: redonda y con sombra en Envolvente; radio 10 y borde fino en Precisa. */
export function Card({
  title,
  description,
  actions,
  footer,
  children,
  padded = true,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-card bg-surface shadow-card precisa:border precisa:border-border ${className}`}
    >
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h2 className="text-title2 lg:text-title2-lg text-ink">{title}</h2> : null}
            {description ? <p className="text-secondary text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? "px-5 pb-5" : ""}>{children}</div>
      {footer ? (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
