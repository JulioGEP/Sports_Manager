import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

interface CommonProps {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** Icono a la izquierda del texto. */
  icon?: ReactNode;
  block?: boolean | undefined;
}

export function buttonClass(
  { variant = "primary", size = "md", block = false }: CommonProps,
  extra?: string,
): string {
  return ["btn", `btn--${variant}`, `btn--${size}`, block ? "btn--block" : "", extra ?? ""]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

/** Botón de la plataforma. El contraste del texto lo garantiza el CSS de cada variante. */
export function Button({
  variant,
  size,
  icon,
  block,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export type ButtonLinkProps = CommonProps &
  ComponentProps<typeof Link> & { icon?: ReactNode; external?: boolean };

/** Enlace con aspecto de botón. `external` lo deja como `<a>` normal (otro host). */
export function ButtonLink({
  variant,
  size,
  icon,
  block,
  className,
  children,
  external = false,
  href,
  ...rest
}: ButtonLinkProps) {
  const cls = buttonClass({ variant, size, block }, className);
  if (external) {
    const plainHref = typeof href === "string" ? href : (href.pathname ?? "/");
    return (
      <a className={cls} href={plainHref}>
        {icon}
        <span>{children}</span>
      </a>
    );
  }
  return (
    <Link className={cls} href={href} {...rest}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
