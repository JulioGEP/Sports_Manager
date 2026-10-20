import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Metadatos de la aplicación. Comprueba la cadena de migraciones de extremo a extremo. */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
