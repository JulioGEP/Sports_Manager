import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ActionIcon, trailingActions, type ActionKind } from "../icons/actions";

/**
 * Botón del sistema. Ver DESIGN.md, secciones 8.1 y 9.1.
 * - primary: la acción principal de la pantalla, en color del club. Una por pantalla.
 * - secondary: acciones alternativas.
 * - tertiary: acciones de bajo peso, como "Cancelar" en línea.
 * - danger: acciones delicadas en su primer paso (abre la confirmación).
 * - danger-solid: solo dentro del diálogo de confirmación.
 * La forma (píldora o radio 8) y la altura (48 o 44 px) las pone el contexto data-shape.
 * El texto del botón es siempre un verbo: "Pagar", "Guardar asistencia", nunca "Aceptar".
 * Toda acción reconocible lleva su icono del catálogo (`action`), siempre el mismo en toda la app.
 * En espacio ajustado (acciones de fila en tablas y listas) el botón va solo con el icono (`iconOnly`):
 * el verbo pasa a texto solo para lectores de pantalla y al `title`, así el nombre accesible no cambia.
 */

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "danger-solid";
export type ButtonSize = "md" | "sm";

export interface ButtonStyleOptions {
  variant?: ButtonVariant | undefined;
  /** Acción fija inferior a todo el ancho: 52 px. */
  cta?: boolean | undefined;
  /** Compacto (40 px) para filas de tabla y cabeceras de tarjeta. */
  size?: ButtonSize | undefined;
}

export interface ButtonContentProps {
  /** Acción del catálogo (DESIGN.md 8.1): pone su icono junto al verbo. */
  action?: ActionKind | undefined;
  /** Icono propio para una acción que no está en el catálogo. Sustituye al de `action`. */
  icon?: ReactNode;
  size?: ButtonSize | undefined;
  /**
   * Solo el icono, para acciones de fila (DESIGN.md 8.1): el botón es cuadrado y el verbo (children)
   * queda como nombre accesible y tooltip. Exige `action` o `icon`.
   */
  iconOnly?: boolean | undefined;
  children?: ReactNode;
}

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonStyleOptions,
    Omit<ButtonContentProps, "children"> {}

/** Clases del botón cuadrado que solo lleva icono: misma altura que el botón normal, sin relleno lateral. */
export function iconOnlyClassName(size: ButtonSize = "md"): string {
  return size === "sm" ? "w-10 px-0" : "w-(--h-control) px-0";
}

/** El verbo del botón cuando es texto, para el `title` de los botones solo con icono. */
export function buttonTitle(children: ReactNode): string | undefined {
  return typeof children === "string" ? children : undefined;
}

// La altura es fija, así que el texto no puede partirse en dos líneas: si falta sitio, el contenedor
// (pie de panel, barra de acciones) es quien tiene que pasar el botón a otra fila.
const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap " +
  "transition-colors duration-150 " +
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-raised disabled:text-muted";

const variants: Record<ButtonVariant, string> = {
  primary: "border border-club-edge bg-club text-on-club",
  secondary: "border border-control bg-surface text-ink",
  tertiary: "bg-transparent text-club-text",
  danger: "border border-danger-border bg-surface text-danger",
  "danger-solid": "bg-danger-solid text-white",
};

/** Clases del botón, también para enlaces con aspecto de botón. */
export function buttonClassName({
  variant = "primary",
  cta = false,
  size = "md",
}: ButtonStyleOptions = {}): string {
  const padding =
    variant === "tertiary" ? (size === "sm" ? "px-2" : "px-3") : size === "sm" ? "px-4" : "px-5";
  const measure = cta
    ? "h-13 w-full text-body font-semibold envolvente:shadow-float"
    : size === "sm"
      ? "h-10 text-secondary"
      : "h-(--h-control) text-body";
  return `${base} ${variants[variant]} ${padding} ${measure}`;
}

/** Icono de la acción y verbo, en el orden que marca el catálogo. */
export function ButtonContent({
  action,
  icon,
  size = "md",
  iconOnly = false,
  children,
}: ButtonContentProps) {
  const iconSize = size === "sm" ? 16 : 18;
  const own = icon !== undefined && icon !== null;
  const node = own ? icon : action ? <ActionIcon action={action} size={iconSize} /> : null;
  if (iconOnly) {
    return (
      <>
        {node}
        <span className="sr-only">{children}</span>
      </>
    );
  }
  const trailing = !own && action !== undefined && trailingActions.has(action);
  return (
    <>
      {trailing ? null : node}
      <span>{children}</span>
      {trailing ? node : null}
    </>
  );
}

export function Button({
  variant = "primary",
  cta = false,
  size = "md",
  action,
  icon,
  iconOnly = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const square = iconOnly ? iconOnlyClassName(size) : "";
  return (
    <button
      type={type}
      className={`${buttonClassName({ variant, cta, size })} ${square} ${className}`}
      title={iconOnly ? buttonTitle(children) : undefined}
      {...rest}
    >
      <ButtonContent action={action} icon={icon} size={size} iconOnly={iconOnly}>
        {children}
      </ButtonContent>
    </button>
  );
}
