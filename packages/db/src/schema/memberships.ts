import { MEMBERSHIP_STATUSES, STAFF_POSITIONS } from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { roles } from "./roles.ts";

/**
 * Pertenencia de un usuario a un club con un rol. Una persona puede tener varios roles
 * en el mismo club, una fila por rol (ADR 0014). Los permisos son la unión.
 * `position` (Bloque 13, ADR 0030): el cargo del personal; solo tiene sentido en la fila del rol `staff`.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roleCode: text("role_code")
      .notNull()
      .references(() => roles.code, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    position: text("position"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_user_org_role_unique").on(t.userId, t.organizationId, t.roleCode),
    index("memberships_organization_id_idx").on(t.organizationId),
    index("memberships_user_id_idx").on(t.userId),
    check("memberships_status_check", inList(t.status, MEMBERSHIP_STATUSES)),
    check(
      "memberships_position_check",
      sql`${t.position} is null or ${inList(t.position, STAFF_POSITIONS)}`,
    ),
  ],
);
