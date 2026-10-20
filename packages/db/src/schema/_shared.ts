import { sql, type SQL } from "drizzle-orm";
import { timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

/** Identificador UUID generado por Postgres. */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** Fechas de creación y actualización con zona horaria. `updated_at` la mantiene la aplicación. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/** Patrón de expresión regular como literal SQL, para restricciones CHECK con `~`. */
export function regexLiteral(pattern: RegExp): SQL {
  return sql.raw(`'${pattern.source.replaceAll("'", "''")}'`);
}

/** `columna IN ('a','b',...)` para restricciones CHECK construidas desde una lista en código. */
export function inList(column: AnyPgColumn | SQL, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(list)})`;
}
