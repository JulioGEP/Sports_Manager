import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

/**
 * Autorización que un club concede a un administrador de plataforma para ver su contenido
 * completo en modo lectura (ADR 0017). Sin autorización vigente, el administrador solo ve
 * la vista de soporte: estado y agregados, nada personal. Caduca o se revoca.
 */
export const supportAccessGrants = pgTable(
  "support_access_grants",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Administrador de plataforma autorizado. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("support_access_grants_org_user_idx").on(t.organizationId, t.userId)],
);
