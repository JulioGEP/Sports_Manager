import {
  CLUB_MEMBER_STATUSES,
  MEMBER_TYPE_STATUSES,
  PERSON_GENDERS,
  PERSON_STATUSES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

/**
 * Personas y socios (Bloque 14). Una persona es un registro por persona física del club: nombre,
 * nacimiento, contacto, documento y foto. Ser deportista (`players`), familiar
 * (`player_guardians`), socio (`club_members`) o personal (`memberships` a través de `user_id`)
 * son papeles de la misma persona. Todo lleva `organization_id` (ADR 0015).
 */
export const people = pgTable(
  "people",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    birthDate: date("birth_date"),
    gender: text("gender"),
    email: text("email"),
    phone: text("phone"),
    nationalId: text("national_id"),
    /** Clave de la foto en Netlify Blobs (store `player-photos`). */
    photoBlobKey: text("photo_blob_key"),
    /** Cuenta con la que esta persona entra en la app, si la tiene. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("people_organization_id_idx").on(t.organizationId),
    index("people_org_name_idx").on(t.organizationId, t.lastName, t.firstName),
    uniqueIndex("people_org_user_unique")
      .on(t.organizationId, t.userId)
      .where(sql`${t.userId} is not null`),
    check("people_status_check", inList(t.status, PERSON_STATUSES)),
    check("people_gender_check", sql`${t.gender} is null or ${inList(t.gender, PERSON_GENDERS)}`),
    check("people_email_lowercase", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
  ],
);

/** Tipos de socio del club: "Socio", "Socio familiar", "Abonado piscina". */
export const memberTypes = pgTable(
  "member_types",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("member_types_org_name_unique").on(t.organizationId, t.name),
    index("member_types_organization_id_idx").on(t.organizationId),
    check("member_types_status_check", inList(t.status, MEMBER_TYPE_STATUSES)),
  ],
);

/** Socio: una persona con número, tipo, alta y estado. Una ficha de socio por persona y club. */
export const clubMembers = pgTable(
  "club_members",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    memberNumber: integer("member_number").notNull(),
    memberTypeId: uuid("member_type_id").references(() => memberTypes.id, {
      onDelete: "set null",
    }),
    joinedOn: date("joined_on").notNull().defaultNow(),
    leftOn: date("left_on"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("club_members_org_person_unique").on(t.organizationId, t.personId),
    uniqueIndex("club_members_org_number_unique").on(t.organizationId, t.memberNumber),
    index("club_members_organization_id_idx").on(t.organizationId),
    check("club_members_status_check", inList(t.status, CLUB_MEMBER_STATUSES)),
    check("club_members_number_check", sql`${t.memberNumber} >= 1`),
  ],
);
