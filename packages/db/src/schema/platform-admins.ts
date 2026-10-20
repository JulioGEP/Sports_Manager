import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.ts";

/**
 * Administradores de la plataforma (ADR 0008). Ningún endpoint escribe aquí:
 * solo migraciones de datos o scripts de operaciones.
 */
export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  note: text("note"),
});
