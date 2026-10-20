import type { ReactNode } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  count?: number | undefined;
}

/** Pestañas (DESIGN.md 9.8): subrayado de 2 px en color del club y recuento en Geist Mono. */
export function Tabs<K extends string>({
  items,
  selected,
  onChange,
  label,
}: {
  items: TabItem<K>[];
  selected: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-line"
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => {
        const active = item.key === selected;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`-mb-px flex h-(--h-control) shrink-0 items-center gap-2 border-b-2 px-3 text-body font-medium transition-colors ${
              active ? "border-club text-club-text" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="rounded-chip bg-raised px-2 font-mono text-secondary text-ink">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
