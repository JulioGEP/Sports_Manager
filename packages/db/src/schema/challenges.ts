import {
  CHALLENGE_AREAS,
  CHALLENGE_STATUSES,
  CHALLENGE_TASK_KINDS,
  CHALLENGE_TASK_STATUSES,
  SUBMISSION_STATUSES,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { players, seasons, sections, teams } from "./structure.ts";

/**
 * Retos por puntos (Fase 1, Bloque 13, ADR 0030): un periodo con un catálogo de pruebas y los
 * registros de actividad de cada jugador, que la familia envía y el club valida. Todo lleva
 * `organization_id` (ADR 0015); borrar el club o el jugador lo arrastra.
 *
 * Ámbito (ADR 0032): un reto es siempre de una sección y, si se quiere, de un solo equipo de
 * esa sección. Sin equipo, vale para toda la sección. Borrar la sección o el equipo lo arrastra.
 */

export const challenges = pgTable(
  "challenges",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Temporada a la que pertenece, si el club quiere agruparlo así. */
    seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
    /** Sección del reto: obligatoria. Sus jugadores son los que pueden participar. */
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    /** Equipo concreto de esa sección. Nulo: el reto es de toda la sección. */
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    minPoints: integer("min_points").notNull().default(0),
    targetPoints: integer("target_points").notNull().default(0),
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("challenges_organization_id_idx").on(t.organizationId),
    index("challenges_section_id_idx").on(t.sectionId),
    index("challenges_team_id_idx").on(t.teamId),
    check("challenges_status_check", inList(t.status, CHALLENGE_STATUSES)),
    check("challenges_points_check", sql`${t.targetPoints} >= ${t.minPoints}`),
    check(
      "challenges_dates_check",
      sql`${t.startsOn} is null or ${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`,
    ),
  ],
);

/** Prueba del catálogo: área, tipo, puntos por unidad y tope en todo el reto. */
export const challengeTasks = pgTable(
  "challenge_tasks",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    area: text("area").notNull(),
    kind: text("kind").notNull(),
    pointsPerUnit: integer("points_per_unit").notNull(),
    maxPoints: integer("max_points"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("challenge_tasks_challenge_id_idx").on(t.challengeId),
    index("challenge_tasks_organization_id_idx").on(t.organizationId),
    check("challenge_tasks_area_check", inList(t.area, CHALLENGE_AREAS)),
    check("challenge_tasks_kind_check", inList(t.kind, CHALLENGE_TASK_KINDS)),
    check("challenge_tasks_status_check", inList(t.status, CHALLENGE_TASK_STATUSES)),
    check("challenge_tasks_points_check", sql`${t.pointsPerUnit} >= 1`),
    check("challenge_tasks_max_points_check", sql`${t.maxPoints} is null or ${t.maxPoints} >= 1`),
  ],
);

/**
 * Registro de actividad: la familia lo envía con la cantidad y los puntos calculados en ese
 * momento; el personal lo aprueba o lo rechaza. Solo los aprobados suman.
 */
export const challengeSubmissions = pgTable(
  "challenge_submissions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => challengeTasks.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull(),
    points: integer("points").notNull(),
    note: text("note"),
    happenedOn: date("happened_on").notNull(),
    status: text("status").notNull().default("submitted"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("challenge_submissions_challenge_player_idx").on(t.challengeId, t.playerId),
    index("challenge_submissions_challenge_status_idx").on(t.challengeId, t.status),
    index("challenge_submissions_organization_id_idx").on(t.organizationId),
    check("challenge_submissions_status_check", inList(t.status, SUBMISSION_STATUSES)),
    check("challenge_submissions_quantity_check", sql`${t.quantity} >= 1`),
    check("challenge_submissions_points_check", sql`${t.points} >= 0`),
  ],
);
