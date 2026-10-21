import { ACCESS_AREAS, ACCESS_EFFECTS, ACCESS_PROFILES } from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { players, sections } from "./structure.ts";

/**
 * Alcance y visibilidad por rol (Bloque 19, ADR 0033). Todo lleva `organization_id` (ADR 0015).
 * El ámbito de cada cargo va en código (`PROFILE_SCOPE`); aquí viven las relaciones que lo
 * concretan (secciones y deportistas a cargo de alguien) y las reglas que la administración
 * fija desde "Personal".
 */

/** Secciones a cargo de alguien del personal: dirección o coordinación de varias secciones. */
export const sectionStaff = pgTable(
  "section_staff",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("section_staff_section_user_unique").on(t.sectionId, t.userId),
    index("section_staff_organization_id_idx").on(t.organizationId),
    index("section_staff_user_id_idx").on(t.userId),
  ],
);

/**
 * Personal asignado a un deportista: quien le atiende sin llevar su equipo (fisioterapia,
 * preparación física, psicología). Es lo que le abre la ficha a quien tiene ámbito "atendidos".
 */
export const playerStaff = pgTable(
  "player_staff",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("player_staff_player_user_unique").on(t.playerId, t.userId),
    index("player_staff_organization_id_idx").on(t.organizationId),
    index("player_staff_user_id_idx").on(t.userId),
  ],
);

/**
 * Reglas de visibilidad: por perfil (rol o cargo) o por persona, un área y un efecto. Una regla
 * por perfil y área, y una por persona y área. Sin regla, manda lo que dicen el rol y el cargo.
 */
export const accessRules = pgTable(
  "access_rules",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    profile: text("profile"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    area: text("area").notNull(),
    effect: text("effect").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("access_rules_org_profile_area_unique")
      .on(t.organizationId, t.profile, t.area)
      .where(sql`${t.profile} is not null`),
    uniqueIndex("access_rules_org_user_area_unique")
      .on(t.organizationId, t.userId, t.area)
      .where(sql`${t.userId} is not null`),
    index("access_rules_organization_id_idx").on(t.organizationId),
    check("access_rules_area_check", inList(t.area, ACCESS_AREAS)),
    check("access_rules_effect_check", inList(t.effect, ACCESS_EFFECTS)),
    check(
      "access_rules_profile_check",
      sql`${t.profile} is null or ${inList(t.profile, ACCESS_PROFILES)}`,
    ),
    check("access_rules_subject_check", sql`(${t.profile} is null) <> (${t.userId} is null)`),
  ],
);
