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
}: {
  label: string;
  value: K;
  onChange: (key: K) => void;
  options: { key: K; label: string; icon?: ReactNode }[];
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-10 items-center rounded-control bg-raised p-0.5"
    >
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.key)}
            className={`inline-flex h-full items-center gap-1.5 rounded-control px-3 text-secondary font-medium transition-colors ${
              selected ? "bg-surface text-ink shadow-row" : "text-muted hover:text-ink"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
