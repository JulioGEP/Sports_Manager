import type { SVGProps } from "react";

/**
 * Iconos de deporte propios (DESIGN.md, sección 8). Rejilla de 24 px, trazo de 1,75 en `currentColor`
 * y relleno duotono con `var(--icon-duo)`, que genera el motor de color del club.
 * Generados desde icons/sport/*.svg; si cambia un SVG, regenera este fichero.
 */
export type SportIconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function Base({ size = 22, children, ...rest }: SportIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function BalonIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <circle style={{ fill: "var(--icon-duo, none)" }} cx="12" cy="12" r="8.5" />
      <path d="M12 8.5l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" />
      <path d="M12 3.5v5M15.3 10.9l4.6-1.5M14 14.8l2.8 3.9M10 14.8l-2.8 3.9M8.7 10.9 4.1 9.4" />
    </Base>
  );
}

export function CamisetaIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <path
        style={{ fill: "var(--icon-duo, none)" }}
        d="M8.5 3.5 4 6l1.5 4.5 2-.8v10.8h9V9.7l2 .8L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"
      />
    </Base>
  );
}

export function CronometroIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <circle style={{ fill: "var(--icon-duo, none)" }} cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V10M10 3h4M18.5 6.5 20 5" />
    </Base>
  );
}

export function PesaIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <rect style={{ fill: "var(--icon-duo, none)" }} x="5" y="7.5" width="3" height="9" rx="1" />
      <rect style={{ fill: "var(--icon-duo, none)" }} x="16" y="7.5" width="3" height="9" rx="1" />
      <path d="M3 10v4M21 10v4M8 12h8" />
    </Base>
  );
}

export function PistaIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <rect style={{ fill: "var(--icon-duo, none)" }} x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M3 9.5h2.5v5H3M21 9.5h-2.5v5H21" />
      <circle cx="12" cy="12" r="2.5" />
    </Base>
  );
}

export function PruebaFisicaIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </Base>
  );
}

export function SilbatoIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <path
        style={{ fill: "var(--icon-duo, none)" }}
        d="M3.5 13a4.5 4.5 0 0 0 8.4 2.2l8.6-3.2V8.5H8A4.5 4.5 0 0 0 3.5 13z"
      />
      <path d="M12 8.5V5.5" />
      <circle cx="8" cy="13" r="1.2" />
    </Base>
  );
}

export function TrofeoIcon(props: SportIconProps) {
  return (
    <Base {...props}>
      <path style={{ fill: "var(--icon-duo, none)" }} d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 6h-3v1.5a3 3 0 0 0 3 3M16.5 6h3v1.5a3 3 0 0 1-3 3M12 13.5V17" />
      <path style={{ fill: "var(--icon-duo, none)" }} d="M9 17h6v3.5H9z" />
    </Base>
  );
}

export const SportIcons = {
  Balon: BalonIcon,
  Camiseta: CamisetaIcon,
  Cronometro: CronometroIcon,
  Pesa: PesaIcon,
  Pista: PistaIcon,
  PruebaFisica: PruebaFisicaIcon,
  Silbato: SilbatoIcon,
  Trofeo: TrofeoIcon,
} as const;
