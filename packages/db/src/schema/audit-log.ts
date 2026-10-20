import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

/**
 * Registro de auditoría (Bloque 6): quién hizo qué, sobre qué club y a quién. Solo se escribe;
 * nunca se edita ni se borra desde la aplicación. Las acciones posibles están en
 * `AUDIT_ACTIONS` de packages/shared.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    /** A quién o a qué afecta: un email, un id de usuario, un slug. */
    target: text("target"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_organization_created_idx").on(t.organizationId, t.createdAt),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
