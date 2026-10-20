import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Warning } from "./icons";

/**
 * Campo de formulario (DESIGN.md, sección 9.4): etiqueta arriba, control de 48/44 px, ayuda debajo.
 * Nunca el placeholder como etiqueta.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-secondary font-medium text-ink">
        {label}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p
          id={errorId}
          className="flex items-center gap-1.5 text-secondary text-danger"
          role="alert"
        >
          <Warning size={16} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-secondary text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const controlClass =
  "h-(--h-control) w-full rounded-field border border-control bg-surface px-4 text-body text-ink " +
  "outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted " +
  "focus:border-2 focus:border-club focus:shadow-[0_0_0_4px_var(--club-soft)] " +
  "aria-invalid:border-2 aria-invalid:border-danger disabled:bg-raised disabled:text-muted";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} appearance-auto ${className}`} {...rest} />;
}

/** Color del club: selector nativo más el hexadecimal escrito, los dos sincronizados. */
export function ColorInput({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string | undefined;
}) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={value}
        className="size-(--h-control) shrink-0 cursor-pointer rounded-field border border-control bg-surface p-1"
        value={valid ? value : "#000000"}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
      />
      <input
        id={id}
        className={`${controlClass} font-mono uppercase`}
        value={value}
        maxLength={7}
        aria-invalid={!valid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
      />
    </div>
  );
}
