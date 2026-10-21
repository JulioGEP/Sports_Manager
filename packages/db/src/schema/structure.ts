import {
  CLUB_VOICES,
  DOMINANT_FEET,
  GUARDIAN_RELATIONSHIPS,
  PLAYER_HEIGHT_MAX_CM,
  PLAYER_HEIGHT_MIN_CM,
  PLAYER_STATUSES,
  SECTION_STATUSES,
  TEAM_STATUSES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

export { CLUB_VOICES };

/**
 * Estructura del club (Fase 1, Bloque 11, ADR 0028). Toda tabla lleva `organization_id`
 * obligatorio e indexado, también las de unión: cada consulta añade el ámbito del club
 * sin pasar por la tabla padre (ADR 0015).
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

/** Sección: la capa entre el club y sus equipos ("Fútbol sala", "Femenino", "Escuela"). */
export const sections = pgTable(
  "sections",
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
    uniqueIndex("sections_org_name_unique").on(t.organizationId, t.name),
    index("sections_organization_id_idx").on(t.organizationId),
    check("sections_status_check", inList(t.status, SECTION_STATUSES)),
  ],
);

/** Equipo de una sección en una temporada. La categoría es texto libre. */
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
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    category: text("category"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("teams_season_section_name_unique").on(t.seasonId, t.sectionId, t.name),
    index("teams_organization_id_idx").on(t.organizationId),
    index("teams_season_id_idx").on(t.seasonId),
    check("teams_status_check", inList(t.status, TEAM_STATUSES)),
  ],
);

/**
 * Jugador: persona que juega en el club. No es un usuario: la familia (o el propio jugador adulto,
 * más adelante) entra con su cuenta y queda vinculada por `player_guardians`.
 */
export const players = pgTable(
  "players",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    birthDate: date("birth_date"),
    /** Fecha de alta en el club (Bloque 13). Nula: cuenta desde que se creó la ficha. */
    joinedOn: date("joined_on"),
    status: text("status").notNull().default("active"),
    /** Ficha ampliada (Bloque 12, ADR 0029): foto en Netlify Blobs, pie dominante y altura. */
    photoBlobKey: text("photo_blob_key"),
    dominantFoot: text("dominant_foot"),
    heightCm: integer("height_cm"),
    ...timestamps,
  },
  (t) => [
    index("players_organization_id_idx").on(t.organizationId),
    index("players_org_name_idx").on(t.organizationId, t.lastName, t.firstName),
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

/** Cuerpo técnico: miembros del club asignados a un equipo. */
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
    ...timestamps,
  },
  (t) => [
    uniqueIndex("team_staff_team_user_unique").on(t.teamId, t.userId),
    index("team_staff_organization_id_idx").on(t.organizationId),
    index("team_staff_user_id_idx").on(t.userId),
  ],
);

/** Familia: una cuenta vinculada a un jugador con una relación (madre, padre, tutor...). */
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
