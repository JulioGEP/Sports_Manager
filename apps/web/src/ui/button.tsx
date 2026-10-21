import {
  Button as DsButton,
  ButtonContent,
  buttonClassName,
  type ActionKind,
  type ButtonProps as DsButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "@sportsmanager/design";
import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

export type { ButtonVariant, ButtonSize, ActionKind } from "@sportsmanager/design";

export interface ButtonProps extends DsButtonProps {
  loading?: boolean | undefined;
}

/**
 * Botón del design system con estado de carga. El texto es siempre un verbo y, si la acción está en
 * el catálogo (DESIGN.md 8.1), lleva su icono: `action="edit"`, `action="delete"`, `action="add"`.
 */
export function Button({ loading = false, icon, disabled, ...rest }: ButtonProps) {
  return (
    <DsButton
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      icon={loading ? <Spinner /> : icon}
      {...rest}
    />
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

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** Acción del catálogo (DESIGN.md 8.1): `open` lleva la flecha detrás del verbo. */
  action?: ActionKind | undefined;
  icon?: ReactNode;
  /** Otro origen: `<a>` normal en vez del enrutador. */
  external?: boolean | undefined;
}

/** Enlace con aspecto de botón. Para navegar, nunca para enviar formularios. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  action,
  icon,
  external = false,
  className = "",
  children,
  to,
  ...rest
}: ButtonLinkProps) {
  const cls = `${buttonClassName({ variant, size })} no-underline ${className}`;
  const content = (
    <ButtonContent action={action} icon={icon} size={size}>
      {children}
    </ButtonContent>
  );
  if (external) {
    return (
      <a className={cls} href={typeof to === "string" ? to : (to.pathname ?? "/")}>
        {content}
      </a>
    );
  }
  return (
    <Link className={cls} to={to} {...rest}>
      {content}
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
