import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Etiqueta, ayuda y error alrededor de un control. El control recibe el id para la etiqueta. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(id, describedBy)}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={["input", props.className ?? ""].join(" ").trim()} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={["input", props.className ?? ""].join(" ").trim()} />;
}

interface ColorInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string | undefined;
}

/** Color de marca: muestra el color y permite escribir el hexadecimal. */
export function ColorInput({ id, value, onChange, describedBy }: ColorInputProps) {
  return (
    <div className="color-input">
      <input
        type="color"
        aria-label="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
      />
      <input
        id={id}
        className="input"
        type="text"
        value={value}
        pattern="#[0-9a-fA-F]{6}"
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
      />
    </div>
  );
}
