import type { ReactNode } from "react";
import { DESKTOP_QUERY } from "@/lib/theme";
import { useMediaQuery } from "@/lib/media";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | undefined;
  /** Cifra: Geist Mono y alineada a la derecha. */
  numeric?: boolean | undefined;
}

export interface MobileRow {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}

/**
 * Lista de datos con dos formas (DESIGN.md 9.7 y 9.8): tabla de filas de 52 px en escritorio,
 * filas cápsula de 64 px en móvil. Las acciones de fila van en `actions`.
 */
export function DataList<T>({
  columns,
  rows,
  getKey,
  mobileRow,
  actions,
  mobileActionsBelow = false,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  mobileRow: (row: T) => MobileRow;
  actions?: ((row: T) => ReactNode) | undefined;
  /** En móvil, las acciones pasan a una segunda línea de la cápsula (varias acciones más un estado). */
  mobileActionsBelow?: boolean | undefined;
  empty: ReactNode;
  caption: string;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  if (rows.length === 0) return <>{empty}</>;

  if (!desktop) {
    return (
      <ul className="flex flex-col gap-2.5" aria-label={caption}>
        {rows.map((row) => {
          const item = mobileRow(row);
          return (
            <li
              key={getKey(row)}
              className="flex min-h-16 flex-wrap items-center gap-3 rounded-row bg-surface px-4 py-2 shadow-row precisa:border precisa:border-border"
            >
              {item.leading}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-ink">{item.title}</span>
                {item.subtitle ? (
                  <span className="truncate text-secondary text-muted">{item.subtitle}</span>
                ) : null}
              </div>
              {item.trailing}
              {actions ? (
                <div
                  className={`flex shrink-0 gap-1 ${mobileActionsBelow ? "basis-full justify-end" : ""}`}
                >
                  {actions(row)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="h-11 border-b border-line text-left text-label uppercase tracking-wide text-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-3 font-medium first:pl-5 last:pr-5 ${col.align === "right" || col.numeric ? "text-right" : ""}`}
              >
                {col.header}
              </th>
            ))}
            {actions ? <th scope="col" className="px-3 pr-5" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getKey(row)}
              className="h-13 border-b border-line last:border-b-0 hover:bg-page"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 align-middle first:pl-5 last:pr-5 ${
                    col.numeric
                      ? "text-right font-mono tabular"
                      : col.align === "right"
                        ? "text-right"
                        : ""
                  }`}
                >
                  {col.cell(row)}
                </td>
              ))}
              {actions ? (
                <td className="px-3 py-2 pr-5 text-right align-middle">
                  <div className="flex justify-end gap-1">{actions(row)}</div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
