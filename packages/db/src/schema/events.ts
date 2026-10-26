import {
  ATTENDANCE_STATUSES,
  EVENT_KINDS,
  FACILITY_KINDS,
  FACILITY_STATUSES,
  HOME_AWAY,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { players, sections, teams } from "./structure.ts";

/**
 * Instalaciones y agenda (Bloque 16), pase de lista (Bloque 17). Todo lleva `organization_id`
 * (ADR 0015). Los instantes de la agenda van con zona; la web los pinta en la zona del club.
 */

/** Instalación: piscina, pista, campo, sala, gimnasio. */
export const facilities = pgTable(
  "facilities",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("other"),
    capacity: integer("capacity"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("facilities_org_name_unique").on(t.organizationId, t.name),
    index("facilities_organization_id_idx").on(t.organizationId),
    check("facilities_kind_check", inList(t.kind, FACILITY_KINDS)),
    check("facilities_status_check", inList(t.status, FACILITY_STATUSES)),
    check("facilities_capacity_check", sql`${t.capacity} is null or ${t.capacity} >= 1`),
  ],
);

/** Franjas de apertura por día de la semana (ISO: 1 lunes … 7 domingo), horas `HH:MM`. */
export const facilityHours = pgTable(
  "facility_hours",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    opensAt: text("opens_at").notNull(),
    closesAt: text("closes_at").notNull(),
    ...timestamps,
  },
  (t) => [
    index("facility_hours_facility_id_idx").on(t.facilityId),
    index("facility_hours_organization_id_idx").on(t.organizationId),
    check("facility_hours_weekday_check", sql`${t.weekday} between 1 and 7`),
    check("facility_hours_range_check", sql`${t.closesAt} > ${t.opensAt}`),
  ],
);

/** Evento: entrenamiento, partido, actividad, reunión o reserva, con equipo e instalación si los hay. */
export const events = pgTable(
  "events",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    location: text("location"),
    opponent: text("opponent"),
    homeAway: text("home_away"),
    notes: text("notes"),
    /** Agrupa las filas generadas por una repetición semanal o por el horario del equipo. */
    seriesId: uuid("series_id"),
    /** Clase abierta (ADR 0049): su aforo (nulo: el del tipo de clase) y quién la da. */
    capacity: integer("capacity"),
    coachUserId: uuid("coach_user_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("events_org_starts_idx").on(t.organizationId, t.startsAt),
    index("events_team_id_idx").on(t.teamId),
    index("events_facility_id_idx").on(t.facilityId),
    index("events_series_id_idx").on(t.seriesId),
    check("events_kind_check", inList(t.kind, EVENT_KINDS)),
    check("events_home_away_check", sql`${t.homeAway} is null or ${inList(t.homeAway, HOME_AWAY)}`),
    check("events_range_check", sql`${t.endsAt} > ${t.startsAt}`),
    check("events_capacity_check", sql`${t.capacity} is null or ${t.capacity} >= 1`),
    index("events_coach_user_id_idx").on(t.coachUserId),
  ],
);

/** Horario semanal de un equipo o grupo: de aquí se generan los entrenamientos de la temporada. */
export const teamSchedules = pgTable(
  "team_schedules",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "set null" }),
    /** Clase abierta (ADR 0049): quién la da y su aforo si no es el del tipo de clase. */
    coachUserId: uuid("coach_user_id").references(() => users.id, { onDelete: "set null" }),
    capacity: integer("capacity"),
    ...timestamps,
  },
  (t) => [
    index("team_schedules_team_id_idx").on(t.teamId),
    index("team_schedules_organization_id_idx").on(t.organizationId),
    check("team_schedules_weekday_check", sql`${t.weekday} between 1 and 7`),
    check("team_schedules_range_check", sql`${t.endsAt} > ${t.startsAt}`),
    check("team_schedules_capacity_check", sql`${t.capacity} is null or ${t.capacity} >= 1`),
  ],
);

/** Pase de lista: un estado por deportista y evento. */
export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attendance_event_player_unique").on(t.eventId, t.playerId),
    index("attendance_organization_id_idx").on(t.organizationId),
    index("attendance_player_id_idx").on(t.playerId),
    check("attendance_status_check", inList(t.status, ATTENDANCE_STATUSES)),
  ],
);
