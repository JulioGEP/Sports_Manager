import {
  DEVELOPMENT_PLAN_STATUSES,
  PLAYER_EVENT_KINDS,
  PLAYER_INDICATOR_DIMENSIONS,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";
import { players } from "./structure.ts";

/**
 * Ficha ampliada del jugador (Fase 1, Bloque 12, ADR 0029): objetivo individual, indicadores,
 * plan de desarrollo individual y registros del timeline. Todo cuelga del jugador y lleva
 * `organization_id` (ADR 0015); borrar el jugador lo arrastra. Las personas responsables son
 * miembros del club: si se borra su cuenta, el dato queda sin responsable, no se pierde.
 */

/** Objetivo individual vigente: uno por jugador. Cambiarlo sustituye el anterior. */
export const playerObjectives = pgTable(
  "player_objectives",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    progress: integer("progress").notNull().default(0),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewOn: date("review_on"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("player_objectives_player_unique").on(t.playerId),
    index("player_objectives_organization_id_idx").on(t.organizationId),
    check("player_objectives_progress_check", sql`${t.progress} between 0 and 100`),
  ],
);

/** Indicadores: una fila por jugador y dimensión, con puntuación de 0 a 100 y lectura corta. */
export const playerIndicators = pgTable(
  "player_indicators",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    dimension: text("dimension").notNull(),
    score: integer("score").notNull(),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("player_indicators_player_dimension_unique").on(t.playerId, t.dimension),
    index("player_indicators_organization_id_idx").on(t.organizationId),
    check("player_indicators_dimension_check", inList(t.dimension, PLAYER_INDICATOR_DIMENSIONS)),
    check("player_indicators_score_check", sql`${t.score} between 0 and 100`),
  ],
);

/** Plan de desarrollo individual: uno por jugador, con una línea por área. */
export const playerDevelopmentPlans = pgTable(
  "player_development_plans",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    technical: text("technical"),
    tactical: text("tactical"),
    physical: text("physical"),
    emotional: text("emotional"),
    habits: text("habits"),
    person: text("person"),
    coordinatorUserId: uuid("coordinator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    nextReviewOn: date("next_review_on"),
    status: text("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("player_development_plans_player_unique").on(t.playerId),
    index("player_development_plans_organization_id_idx").on(t.organizationId),
    check("player_development_plans_status_check", inList(t.status, DEVELOPMENT_PLAN_STATUSES)),
  ],
);

/**
 * Registros del timeline del jugador. Solo se escriben. `details` lleva nombres y cifras para
 * el texto (equipo, temporada, título, progreso); la web pone las palabras en cada idioma.
 */
export const playerEvents = pgTable(
  "player_events",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    happenedOn: date("happened_on").notNull(),
    details: jsonb("details"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("player_events_player_happened_idx").on(t.playerId, t.happenedOn),
    index("player_events_organization_id_idx").on(t.organizationId),
    check("player_events_kind_check", inList(t.kind, PLAYER_EVENT_KINDS)),
  ],
);
