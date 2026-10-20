import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Metadatos de la aplicación. Sirve para comprobar que la cadena de migraciones
 * funciona de extremo a extremo. El modelo de negocio llega en el Bloque 2.
 */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
