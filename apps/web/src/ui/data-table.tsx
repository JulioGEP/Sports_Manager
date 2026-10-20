import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Alineación de la celda. */
  align?: "left" | "right";
  /** Ancho sugerido (CSS). */
  width?: string;
}

/** Tabla con cabecera fija en escritorio y filas apiladas en móvil (el CSS lee `data-label`). */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  empty: ReactNode;
  caption: string;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={c.align === "right" ? "table__right" : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={typeof c.header === "string" ? c.header : undefined}
                  className={c.align === "right" ? "table__right" : undefined}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
