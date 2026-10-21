import { Button as DsButton, type ButtonProps as DsButtonProps } from "@sportsmanager/design";
import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

export type { ButtonVariant } from "@sportsmanager/design";

export interface ButtonProps extends DsButtonProps {
  loading?: boolean | undefined;
  icon?: ReactNode;
  /** Botón compacto para filas de tabla y cabeceras de tarjeta. */
  size?: "md" | "sm" | undefined;
}

/** Botón del design system con estado de carga e icono. El texto es siempre un verbo. */
export function Button({
  loading = false,
  icon,
  size = "md",
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const compact = size === "sm" ? "!h-10 px-4 text-secondary" : "";
  return (
    <DsButton
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${compact} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      <span>{children}</span>
    </DsButton>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

const linkBase =
  "inline-flex items-center justify-center gap-2 rounded-control px-5 text-body font-medium whitespace-nowrap no-underline transition-colors duration-150";
const linkVariants = {
  primary: "border border-club-edge bg-club text-on-club",
  secondary: "border border-control bg-surface text-ink",
  tertiary: "bg-transparent px-3 text-club-text",
} as const;

export interface ButtonLinkProps extends LinkProps {
  variant?: keyof typeof linkVariants | undefined;
  size?: "md" | "sm" | undefined;
  icon?: ReactNode;
  /** Otro origen: `<a>` normal en vez del enrutador. */
  external?: boolean | undefined;
}

/** Enlace con aspecto de botón. Para navegar, nunca para enviar formularios. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  external = false,
  className = "",
  children,
  to,
  ...rest
}: ButtonLinkProps) {
  const height = size === "sm" ? "h-10 px-4 text-secondary" : "h-(--h-control)";
  const cls = `${linkBase} ${linkVariants[variant]} ${height} ${className}`;
  if (external) {
    return (
      <a className={cls} href={typeof to === "string" ? to : (to.pathname ?? "/")}>
        {icon}
        <span>{children}</span>
      </a>
    );
  }
  return (
    <Link className={cls} to={to} {...rest}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

/** Botón que solo lleva icono: siempre con `aria-label`. Zona táctil completa. */
export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: Omit<DsButtonProps, "children"> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-grid size-(--h-control) shrink-0 place-items-center rounded-control text-ink transition-colors hover:bg-raised ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
