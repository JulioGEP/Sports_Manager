import {
  CATEGORY_GENDERS,
  CATEGORY_STATUSES,
  CLUB_VOICES,
  DOMINANT_FEET,
  GUARDIAN_RELATIONSHIPS,
  type MatchSettingsPatch,
  PLAYER_HEIGHT_MAX_CM,
  PLAYER_HEIGHT_MIN_CM,
  PLAYER_STATUSES,
  SECTION_KINDS,
  SECTION_STATUSES,
  TEAM_STAFF_ROLES,
  TEAM_STATUSES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { people } from "./people.ts";
import { sports } from "./sports.ts";

export { CLUB_VOICES };

/**
 * Estructura del club (Fase 1, Bloque 11, ADR 0028; Bloque 14). Toda tabla lleva
 * `organization_id` obligatorio e indexado, también las de unión: cada consulta añade el ámbito
 * del club sin pasar por la tabla padre (ADR 0015).
 */

/** Temporada: "2026-27". Solo una puede ser la actual por club. */
export const seasons = pgTable(
  "seasons",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("seasons_org_name_unique").on(t.organizationId, t.name),
    uniqueIndex("seasons_org_current_unique")
      .on(t.organizationId)
      .where(sql`${t.isCurrent} = true`),
    index("seasons_organization_id_idx").on(t.organizationId),
    check("seasons_dates_check", sql`${t.endsOn} > ${t.startsOn}`),
  ],
);

/**
 * Sección: la unidad de gestión del club ("Fútbol sala", "Baloncesto", "Yoga"). Tiene deporte,
 * tipo (competición con equipos, o actividad con grupos) y, si quiere, coordinación (Bloque 14).
 */
export const sections = pgTable(
  "sections",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    kind: text("kind").notNull().default("competition"),
    coordinatorUserId: uuid("coordinator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    /** Ajustes del partido en directo (Bloque 19) sobre los del deporte. Nulo: los del deporte. */
    matchSettings: jsonb("match_settings").$type<MatchSettingsPatch>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sections_org_name_unique").on(t.organizationId, t.name),
    index("sections_organization_id_idx").on(t.organizationId),
    check("sections_status_check", inList(t.status, SECTION_STATUSES)),
    check("sections_kind_check", inList(t.kind, SECTION_KINDS)),
  ],
);

/** Categoría de una sección: "Sénior masculino", "Alevín", "Adultos". Entre la sección y el equipo. */
export const categories = pgTable(
  "categories",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    gender: text("gender"),
    birthYearFrom: integer("birth_year_from"),
    birthYearTo: integer("birth_year_to"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("categories_section_name_unique").on(t.sectionId, t.name),
    index("categories_organization_id_idx").on(t.organizationId),
    index("categories_section_id_idx").on(t.sectionId),
    check("categories_status_check", inList(t.status, CATEGORY_STATUSES)),
    check(
      "categories_gender_check",
      sql`${t.gender} is null or ${inList(t.gender, CATEGORY_GENDERS)}`,
    ),
    check(
      "categories_years_check",
      sql`${t.birthYearFrom} is null or ${t.birthYearTo} is null or ${t.birthYearFrom} <= ${t.birthYearTo}`,
    ),
  ],
);

/** Equipo (o grupo, en una sección de actividad) de una categoría en una temporada. */
export const teams = pgTable(
  "teams",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Aforo del grupo (secciones de actividad). Nulo: sin límite. */
    capacity: integer("capacity"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("teams_season_section_name_unique").on(t.seasonId, t.sectionId, t.name),
    index("teams_organization_id_idx").on(t.organizationId),
    index("teams_season_id_idx").on(t.seasonId),
    index("teams_category_id_idx").on(t.categoryId),
    check("teams_status_check", inList(t.status, TEAM_STATUSES)),
    check("teams_capacity_check", sql`${t.capacity} is null or ${t.capacity} >= 1`),
  ],
);

/**
 * Deportista: la ficha deportiva de una persona del club (Bloque 14: nombre, nacimiento y foto
 * viven en `people`). No es un usuario: la familia (o la propia persona adulta, por su cuenta en
 * `people.user_id`) entra con su cuenta y queda vinculada por `player_guardians`.
 */
export const players = pgTable(
  "players",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    /** Fecha de alta en el club (Bloque 13). Nula: cuenta desde que se creó la ficha. */
    joinedOn: date("joined_on"),
    status: text("status").notNull().default("active"),
    /** Ficha ampliada (Bloque 12, ADR 0029): pie dominante y altura. */
    dominantFoot: text("dominant_foot"),
    heightCm: integer("height_cm"),
    ...timestamps,
  },
  (t) => [
    index("players_organization_id_idx").on(t.organizationId),
    uniqueIndex("players_person_unique").on(t.personId),
    check("players_status_check", inList(t.status, PLAYER_STATUSES)),
    check(
      "players_dominant_foot_check",
      sql`${t.dominantFoot} is null or ${inList(t.dominantFoot, DOMINANT_FEET)}`,
    ),
    check(
      "players_height_cm_check",
      sql`${t.heightCm} is null or ${t.heightCm} between ${sql.raw(String(PLAYER_HEIGHT_MIN_CM))} and ${sql.raw(String(PLAYER_HEIGHT_MAX_CM))}`,
    ),
  ],
);

/** Plantilla: jugador en un equipo (y por tanto en una temporada), con dorsal y posición. */
export const teamPlayers = pgTable(
  "team_players",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    shirtNumber: integer("shirt_number"),
    position: text("position"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("team_players_team_player_unique").on(t.teamId, t.playerId),
    index("team_players_organization_id_idx").on(t.organizationId),
    index("team_players_player_id_idx").on(t.playerId),
    check(
      "team_players_shirt_number_check",
      sql`${t.shirtNumber} is null or ${t.shirtNumber} >= 0`,
    ),
  ],
);

/** Cuerpo técnico: miembros del club asignados a un equipo, con su papel (Bloque 14). */
export const teamStaff = pgTable(
  "team_staff",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleInTeam: text("role_in_team").notNull().default("head_coach"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("team_staff_team_user_unique").on(t.teamId, t.userId),
    index("team_staff_organization_id_idx").on(t.organizationId),
    index("team_staff_user_id_idx").on(t.userId),
    check("team_staff_role_check", inList(t.roleInTeam, TEAM_STAFF_ROLES)),
  ],
);

/**
 * Familia: una cuenta vinculada a un jugador con una relación (madre, padre, tutor...). La
 * persona del familiar (Bloque 14) sirve para que sea también socio y pague cuotas.
 */
export const playerGuardians = pgTable(
  "player_guardians",
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
    guardianPersonId: uuid("guardian_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    relationship: text("relationship").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("player_guardians_player_user_unique").on(t.playerId, t.userId),
    index("player_guardians_organization_id_idx").on(t.organizationId),
    index("player_guardians_user_id_idx").on(t.userId),
    check("player_guardians_relationship_check", inList(t.relationship, GUARDIAN_RELATIONSHIPS)),
  ],
);
