import type { ButtonHTMLAttributes } from "react";

/**
 * Botón del sistema. Ver DESIGN.md, sección 9.1.
 * - primary: la acción principal de la pantalla, en color del club. Una por pantalla.
 * - secondary: acciones alternativas.
 * - tertiary: acciones de bajo peso, como "Cancelar" en línea.
 * - danger: acciones delicadas en su primer paso (abre la confirmación).
 * - danger-solid: solo dentro del diálogo de confirmación.
 * La forma (píldora o radio 8) y la altura (48 o 44 px) las pone el contexto data-shape.
 * El texto del botón es siempre un verbo: "Pagar", "Guardar asistencia", nunca "Aceptar".
 */

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "danger-solid";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Acción fija inferior a todo el ancho: 52 px. */
  cta?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-control px-5 text-body font-medium " +
  "transition-colors duration-150 " +
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-raised disabled:text-muted";

const variants: Record<ButtonVariant, string> = {
  primary: "border border-club-edge bg-club text-on-club",
  secondary: "border border-control bg-surface text-ink",
  tertiary: "bg-transparent px-3 text-club-text",
  danger: "border border-danger-border bg-surface text-danger",
  "danger-solid": "bg-danger-solid text-white",
};

export function Button({
  variant = "primary",
  cta = false,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  const size = cta ? "h-13 w-full font-semibold envolvente:shadow-float" : "h-(--h-control)";
  return (
    <button type={type} className={`${base} ${variants[variant]} ${size} ${className}`} {...rest} />
  );
}
