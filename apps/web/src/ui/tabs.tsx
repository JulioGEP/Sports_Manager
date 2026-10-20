"use client";

import type { ReactNode } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  count?: number | undefined;
}

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
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          className={`tabs__tab${item.key === selected ? " tabs__tab--active" : ""}`}
          aria-selected={item.key === selected}
          onClick={() => onChange(item.key)}
        >
          {item.label}
          {item.count !== undefined ? <span className="tabs__count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
