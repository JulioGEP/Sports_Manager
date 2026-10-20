import { ROLE_SCOPES, type LocalizedText } from "@sportsmanager/shared";
import { check, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { inList } from "./_shared.ts";

/**
 * Roles como datos (ADR 0008). Añadir un rol es una migración de datos (INSERT),
 * nunca un cambio de esquema. `platform_admin` no está aquí: ver platform_admins.
 */
export const roles = pgTable(
  "roles",
  {
    code: text("code").primaryKey(),
    scope: text("scope").notNull().default("organization"),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check("roles_scope_check", inList(t.scope, ROLE_SCOPES))],
);
