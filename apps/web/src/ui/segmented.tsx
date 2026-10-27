import type { ReactNode } from "react";

/**
 * Control segmentado (DESIGN.md 9.3): un grupo `bg-raised` con la opción elegida en relieve.
 * Para alternar entre dos o tres formas de ver lo mismo (tablero o lista), nunca para navegar.
 */
export function Segmented<K extends string>({
  label,
  value,
  onChange,
  options,
  iconOnly = false,
  fill = false,
}: {
  label: string;
  value: K;
  onChange: (key: K) => void;
  options: { key: K; label: string; icon?: ReactNode }[];
  /** Solo el icono: el nombre queda como nombre accesible y `title` (vista de un KPI). */
  iconOnly?: boolean;
  /** A todo el ancho, con las opciones a partes iguales. */
  fill?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`${fill ? "flex w-full" : "inline-flex"} h-10 items-center rounded-control bg-raised p-0.5`}
    >
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={selected}
            aria-label={iconOnly ? o.label : undefined}
            title={iconOnly ? o.label : undefined}
            onClick={() => onChange(o.key)}
            className={`inline-flex h-full items-center justify-center gap-1.5 rounded-control text-secondary font-medium transition-colors ${
              fill ? "flex-1" : ""
            } ${iconOnly ? "min-w-10 px-2" : "px-3"} ${
              selected ? "bg-surface text-ink shadow-row" : "text-muted hover:text-ink"
            }`}
          >
            {o.icon}
            {iconOnly ? null : o.label}
          </button>
        );
      })}
    </div>
  );
}
