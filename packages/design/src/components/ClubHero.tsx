import type { ReactNode } from "react";

/**
 * Portada del club. Ver DESIGN.md, sección 7.
 * Es el lugar donde el club manda: color principal de fondo, escudo con aro
 * del secundario y franja de 6 px del secundario abajo.
 * Va en la pantalla de inicio del club y en la vista de familias. No se repite en pantallas internas.
 * Colores: los pone el motor (--hero-*), también en modo oscuro.
 */

export interface ClubHeroProps {
  clubName: string;
  /** Escudo: imagen del club o sus iniciales. */
  crest: ReactNode;
  /** Equipo y temporada, o el nombre del jugador en la vista de familia. */
  subtitle?: string;
  /** Una línea de contexto: el próximo partido, por ejemplo. */
  meta?: string;
  /** Hasta dos acciones. Usa ClubHeroButton. */
  actions?: ReactNode;
  ariaLabel?: string;
}

export function ClubHero({ clubName, crest, subtitle, meta, actions, ariaLabel }: ClubHeroProps) {
  return (
    <section
      aria-label={ariaLabel ?? `Portada de ${clubName}`}
      className="flex flex-col overflow-hidden bg-hero text-hero-ink [border-radius:var(--r-hero)]"
    >
      <div className="flex flex-wrap items-end justify-between gap-6 p-5 lg:p-7">
        <div className="flex min-w-0 items-center gap-3 lg:gap-4">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-hero-crest font-semibold text-hero-crest-ink ring-2 ring-club-second lg:size-18 lg:ring-3">
            {crest}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            {subtitle && <span className="text-secondary text-hero-sub">{subtitle}</span>}
            <h2 className="truncate text-title1 lg:text-display-lg">{clubName}</h2>
            {meta && <span className="text-secondary text-hero-sub">{meta}</span>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
      </div>
      <div className="h-1.5 bg-club-second" aria-hidden="true" />
    </section>
  );
}

export function ClubHeroButton({
  ghost = false,
  children,
  onClick,
}: {
  ghost?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  const cls = ghost
    ? "border border-hero-ghost bg-transparent text-hero-ink"
    : "bg-hero-btn text-hero-btn-ink font-semibold";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-(--h-control) rounded-control px-5 text-body ${cls}`}
    >
      {children}
    </button>
  );
}
