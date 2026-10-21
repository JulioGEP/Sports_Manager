import {
  ATTACK_DIRECTIONS,
  HOME_AWAY,
  MATCH_ACTION_CATEGORIES,
  MATCH_ACTION_SCOPES,
  MATCH_ACTION_STATUSES,
  MATCH_CARDS,
  MATCH_EVENT_KINDS,
  MATCH_SIDES,
  MATCH_STATUSES,
  MATCH_ZONES,
  type MatchSettingsPatch,
} from "@sportsmanager/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, inList, timestamps } from "./_shared.ts";
import { users } from "./auth.ts";
import { events } from "./events.ts";
import { organizations } from "./organizations.ts";
import { players, seasons, sections, teams } from "./structure.ts";

/**
 * Partido en directo (Fase 1, Bloque 19, ADR 0032). El catálogo de acciones es de la sección
 * (deporte); el partido es del equipo y guarda su convocatoria y su lista ordenada de eventos.
 * Todo lleva `organization_id` (ADR 0015); borrar el club, la sección o el equipo lo arrastra.
 */

/** Lo que se puede registrar en un partido de esta sección: el club lo edita a su gusto. */
export const matchActionTypes = pgTable(
  "match_action_types",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    scope: text("scope").notNull(),
    ownScore: integer("own_score").notNull().default(0),
    opponentScore: integer("opponent_score").notNull().default(0),
    countsFoul: boolean("counts_foul").notNull().default(false),
    card: text("card"),
    requiresZone: boolean("requires_zone").notNull().default(false),
    keeperOnly: boolean("keeper_only").notNull().default(false),
    weight: numeric("weight", { precision: 6, scale: 2 }).notNull().default("0"),
    quick: boolean("quick").notNull().default(false),
    mirrorOf: text("mirror_of"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("match_action_types_section_code_unique").on(t.sectionId, t.code),
    index("match_action_types_organization_id_idx").on(t.organizationId),
    index("match_action_types_section_id_idx").on(t.sectionId),
    check("match_action_types_category_check", inList(t.category, MATCH_ACTION_CATEGORIES)),
    check("match_action_types_scope_check", inList(t.scope, MATCH_ACTION_SCOPES)),
    check("match_action_types_status_check", inList(t.status, MATCH_ACTION_STATUSES)),
    check(
      "match_action_types_card_check",
      sql`${t.card} is null or ${inList(t.card, MATCH_CARDS)}`,
    ),
    check("match_action_types_score_check", sql`${t.ownScore} >= 0 and ${t.opponentScore} >= 0`),
  ],
);

/** Un partido de un equipo: rival, fecha, estado, ajustes, marcador y cronómetro. */
export const matches = pgTable(
  "matches",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    /** Partido de la agenda al que corresponde, si lo hay. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    opponent: text("opponent").notNull(),
    homeAway: text("home_away").notNull(),
    playedOn: date("played_on").notNull(),
    status: text("status").notNull().default("scheduled"),
    /** Cambios de este partido sobre los ajustes de la sección. */
    settings: jsonb("settings").$type<MatchSettingsPatch>().notNull().default({}),
    formation: text("formation"),
    attackDirection: text("attack_direction").notNull().default("right"),
    /** Marcador calculado de los eventos; se guarda para listar sin recalcular. */
    ownScore: integer("own_score").notNull().default(0),
    opponentScore: integer("opponent_score").notNull().default(0),
    clockPeriod: integer("clock_period").notNull().default(1),
    clockElapsedMs: integer("clock_elapsed_ms").notNull().default(0),
    clockRunningSince: timestamp("clock_running_since", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("matches_organization_id_idx").on(t.organizationId),
    index("matches_team_played_idx").on(t.teamId, t.playedOn),
    index("matches_event_id_idx").on(t.eventId),
    check("matches_status_check", inList(t.status, MATCH_STATUSES)),
    check("matches_home_away_check", inList(t.homeAway, HOME_AWAY)),
    check("matches_attack_direction_check", inList(t.attackDirection, ATTACK_DIRECTIONS)),
    check("matches_score_check", sql`${t.ownScore} >= 0 and ${t.opponentScore} >= 0`),
    check("matches_clock_check", sql`${t.clockPeriod} >= 1 and ${t.clockElapsedMs} >= 0`),
  ],
);

/** Convocatoria: quién va al partido, con dorsal, posición, portero, titular y hueco en pista. */
export const matchPlayers = pgTable(
  "match_players",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    shirtNumber: integer("shirt_number"),
    position: text("position"),
    isGoalkeeper: boolean("is_goalkeeper").notNull().default(false),
    starter: boolean("starter").notNull().default(false),
    slot: integer("slot"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("match_players_match_player_unique").on(t.matchId, t.playerId),
    index("match_players_organization_id_idx").on(t.organizationId),
    index("match_players_player_id_idx").on(t.playerId),
    check(
      "match_players_shirt_number_check",
      sql`${t.shirtNumber} is null or ${t.shirtNumber} >= 0`,
    ),
    check("match_players_slot_check", sql`${t.slot} is null or ${t.slot} >= 0`),
  ],
);

/**
 * Lo que pasa en el partido, en orden (`seq`). Cada evento guarda la foto de quién estaba en
 * pista y lo que sumó al marcador, para que el historial no cambie si el catálogo cambia.
 */
export const matchEvents = pgTable(
  "match_events",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind").notNull(),
    actionTypeId: uuid("action_type_id").references(() => matchActionTypes.id, {
      onDelete: "set null",
    }),
    actionCode: text("action_code"),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    relatedPlayerId: uuid("related_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    side: text("side").notNull().default("own"),
    period: integer("period").notNull(),
    clockMs: integer("clock_ms").notNull(),
    zone: text("zone"),
    onCourt: jsonb("on_court").$type<string[]>().notNull().default([]),
    ownScoreDelta: integer("own_score_delta").notNull().default(0),
    opponentScoreDelta: integer("opponent_score_delta").notNull().default(0),
    note: text("note"),
    /** Id que pone la web para no duplicar un reenvío. */
    clientId: text("client_id"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("match_events_match_seq_unique").on(t.matchId, t.seq),
    uniqueIndex("match_events_match_client_unique")
      .on(t.matchId, t.clientId)
      .where(sql`${t.clientId} is not null`),
    index("match_events_organization_id_idx").on(t.organizationId),
    index("match_events_player_id_idx").on(t.playerId),
    check("match_events_kind_check", inList(t.kind, MATCH_EVENT_KINDS)),
    check("match_events_side_check", inList(t.side, MATCH_SIDES)),
    check("match_events_zone_check", sql`${t.zone} is null or ${inList(t.zone, MATCH_ZONES)}`),
    check("match_events_period_check", sql`${t.period} >= 1 and ${t.clockMs} >= 0`),
  ],
);
