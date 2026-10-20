import type { ReactNode } from "react";

/**
 * Etiqueta de estado. Ver DESIGN.md, sección 9.5.
 * - club: estados de la vida del club (Confirmado, Convocado). Van en el color del club.
 * - success, warning, danger, info, neutral: estados del sistema (pagos, fichas, errores).
 *   Son iguales en todos los clubes y nunca dependen del color del club.
 * Siempre llevan texto. En un club verde, "Confirmado" y "Pagado" se parecen: el texto los distingue.
 */

export type StatusKind = "club" | "success" | "warning" | "danger" | "info" | "neutral";

const styles: Record<StatusKind, string> = {
  club: "bg-club-soft text-club-soft-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
};

export interface StatusChipProps {
  kind?: StatusKind;
  icon?: ReactNode;
  children: ReactNode;
}

export function StatusChip({ kind = "neutral", icon, children }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-0.5 text-secondary font-medium ${styles[kind]}`}
    >
      {icon}
      {children}
    </span>
  );
}
