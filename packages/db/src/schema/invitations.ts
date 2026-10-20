import { GUARDIAN_RELATIONSHIPS, INVITATION_STATUSES, LOCALES } from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { roles } from "./roles.ts";
import { players } from "./structure.ts";

/**
 * Invitación a unirse a un club con un rol. Solo se guarda el hash del token; el token
 * va en el enlace del email. "Caducada" se deduce de `expires_at`, no es un estado.
 * `locale` es el idioma del email de invitación (Bloque 4): lo elige quien invita.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roleCode: text("role_code")
      .notNull()
      .references(() => roles.code, { onDelete: "restrict" }),
    locale: text("locale").notNull().default("es"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** Invitación de familia (Bloque 11): jugador al que vincula al aceptarse, y con qué relación. */
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    relationship: text("relationship"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invitations_pending_org_email_unique")
      .on(t.organizationId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index("invitations_organization_id_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
    check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("invitations_locale_check", inList(t.locale, LOCALES)),
    check("invitations_status_check", inList(t.status, INVITATION_STATUSES)),
    check(
      "invitations_relationship_check",
      sql`${t.relationship} is null or ${inList(t.relationship, GUARDIAN_RELATIONSHIPS)}`,
    ),
  ],
);
