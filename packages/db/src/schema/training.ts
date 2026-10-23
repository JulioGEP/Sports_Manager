import {
  BODY_AREAS,
  BODY_SIDES,
  CONSENT_RELATIONSHIPS,
  DRILL_SCOPES,
  DRILL_STATUSES,
  INJURY_CONTEXTS,
  INJURY_KINDS,
  INJURY_MECHANISMS,
  INJURY_STATUSES,
  INSIGHT_OUTCOMES,
  LOAD_SOURCES,
  PARTICIPATIONS,
  PHYSICAL_TEST_DIRECTIONS,
  PHYSICAL_TEST_UNITS,
  SESSION_BLOCKS,
  SESSION_STATUSES,
  STORED_AVAILABILITY_STATUSES,
  TRAINING_CONTENT_KINDS,
  TRAINING_CONTENT_STATUSES,
  type DrillDiagram,
  type MicrocycleDay,
  type RestrictionTag,
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
import { matches } from "./matches.ts";
import { organizations } from "./organizations.ts";
import { players, seasons, sections, teams } from "./structure.ts";

/**
 * Planificación de entrenamientos, carga, disponibilidad y salud (Fase 1, bloques 21 a 26,
 * ADR 0039). Todo lleva `organization_id` (ADR 0015). La sesión cuelga del entrenamiento de la
 * agenda; las tareas de una sesión copian lo que importa de la tarea de la biblioteca (contenidos
 * y restricciones) para que el histórico no cambie si la biblioteca cambia.
 */

/** Contenidos de entrenamiento de una sección: el deporte propone, el club edita. */
export const trainingContents = pgTable(
  "training_contents",
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
    kind: text("kind").notNull(),
    /** Acciones del partido que miden este contenido: el puente con las recomendaciones. */
    relatedActionCodes: jsonb("related_action_codes").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("training_contents_section_code_unique").on(t.sectionId, t.code),
    index("training_contents_organization_id_idx").on(t.organizationId),
    check("training_contents_kind_check", inList(t.kind, TRAINING_CONTENT_KINDS)),
    check("training_contents_status_check", inList(t.status, TRAINING_CONTENT_STATUSES)),
  ],
);

/** Tarea de la biblioteca: del club, de una sección, de un equipo o personal. */
export const drills = pgTable(
  "drills",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    rules: text("rules"),
    coachingPoints: text("coaching_points"),
    variants: text("variants"),
    format: text("format"),
    space: text("space"),
    playersMin: integer("players_min"),
    playersMax: integer("players_max"),
    durationMin: integer("duration_min"),
    targetRpe: integer("target_rpe"),
    material: text("material"),
    diagram: jsonb("diagram").$type<DrillDiagram>(),
    /** Voz grabada con el movimiento de la pizarra (ADR 0040), en Netlify Blobs (`drill-audio`). */
    audioBlobKey: text("audio_blob_key"),
    videoUrl: text("video_url"),
    restrictionTags: jsonb("restriction_tags").$type<RestrictionTag[]>().notNull().default([]),
    /** Clave de la semilla del deporte, para no duplicarla al volver a sembrar. */
    seedKey: text("seed_key"),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("drills_organization_id_idx").on(t.organizationId),
    index("drills_section_id_idx").on(t.sectionId),
    index("drills_team_id_idx").on(t.teamId),
    uniqueIndex("drills_section_seed_unique")
      .on(t.sectionId, t.seedKey)
      .where(sql`${t.seedKey} is not null`),
    check("drills_scope_check", inList(t.scope, DRILL_SCOPES)),
    check("drills_status_check", inList(t.status, DRILL_STATUSES)),
    check(
      "drills_target_rpe_check",
      sql`${t.targetRpe} is null or ${t.targetRpe} between 0 and 10`,
    ),
    check(
      "drills_duration_check",
      sql`${t.durationMin} is null or ${t.durationMin} between 1 and 240`,
    ),
  ],
);

/** Contenidos que trabaja una tarea; uno es el principal. */
export const drillContents = pgTable(
  "drill_contents",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    contentId: uuid("content_id")
      .notNull()
      .references(() => trainingContents.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("drill_contents_drill_content_unique").on(t.drillId, t.contentId),
    index("drill_contents_organization_id_idx").on(t.organizationId),
    index("drill_contents_content_id_idx").on(t.contentId),
  ],
);

/** Plan de temporada de un equipo: uno por equipo y temporada. */
export const trainingPlans = pgTable(
  "training_plans",
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
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("training_plans_team_season_unique").on(t.teamId, t.seasonId),
    index("training_plans_organization_id_idx").on(t.organizationId),
  ],
);

/** Ciclo del plan (mesociclo): fechas, foco de contenidos y carga semanal objetivo. */
export const trainingCycles = pgTable(
  "training_cycles",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    focusContentIds: jsonb("focus_content_ids").$type<string[]>().notNull().default([]),
    targetWeeklyLoad: integer("target_weekly_load"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("training_cycles_organization_id_idx").on(t.organizationId),
    index("training_cycles_plan_id_idx").on(t.planId),
    check("training_cycles_dates_check", sql`${t.endsOn} >= ${t.startsOn}`),
  ],
);

/** Semana tipo de una sección: qué sesión toca cada día respecto al partido. */
export const microcycleTemplates = pgTable(
  "microcycle_templates",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    days: jsonb("days").$type<MicrocycleDay[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("microcycle_templates_section_name_unique").on(t.sectionId, t.name),
    index("microcycle_templates_organization_id_idx").on(t.organizationId),
  ],
);

/** Sesión: la planificación de un entrenamiento de la agenda, una por evento. */
export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").references(() => trainingCycles.id, { onDelete: "set null" }),
    /** Etiqueta MD puesta a mano (un partido aplazado). Nula: se calcula de los partidos. */
    mdLabel: text("md_label"),
    objective: text("objective"),
    contentIds: jsonb("content_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("draft"),
    targetRpe: integer("target_rpe"),
    actualMinutes: integer("actual_minutes"),
    rating: integer("rating"),
    notes: text("notes"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("training_sessions_event_unique").on(t.eventId),
    index("training_sessions_organization_id_idx").on(t.organizationId),
    index("training_sessions_team_id_idx").on(t.teamId),
    check("training_sessions_status_check", inList(t.status, SESSION_STATUSES)),
    check(
      "training_sessions_md_label_check",
      sql`${t.mdLabel} is null or ${t.mdLabel} ~ '^MD([+-][1-6])?$'`,
    ),
    check(
      "training_sessions_target_rpe_check",
      sql`${t.targetRpe} is null or ${t.targetRpe} between 0 and 10`,
    ),
    check(
      "training_sessions_rating_check",
      sql`${t.rating} is null or ${t.rating} between 1 and 3`,
    ),
  ],
);

/** Tarea dentro de una sesión: bloque, orden, tiempos, intensidad, grupo y valoración. */
export const trainingSessionItems = pgTable(
  "training_session_items",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => trainingSessions.id, { onDelete: "cascade" }),
    drillId: uuid("drill_id").references(() => drills.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    block: text("block").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    minutes: integer("minutes").notNull(),
    sets: integer("sets"),
    reps: integer("reps"),
    restSec: integer("rest_sec"),
    targetRpe: integer("target_rpe"),
    groupLabel: text("group_label"),
    /** Nulo: toda la plantilla. */
    playerIds: jsonb("player_ids").$type<string[]>(),
    contentIds: jsonb("content_ids").$type<string[]>().notNull().default([]),
    restrictionTags: jsonb("restriction_tags").$type<RestrictionTag[]>().notNull().default([]),
    notes: text("notes"),
    rating: integer("rating"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("training_session_items_organization_id_idx").on(t.organizationId),
    index("training_session_items_session_id_idx").on(t.sessionId),
    index("training_session_items_drill_id_idx").on(t.drillId),
    check("training_session_items_block_check", inList(t.block, SESSION_BLOCKS)),
    check("training_session_items_minutes_check", sql`${t.minutes} between 1 and 240`),
    check(
      "training_session_items_target_rpe_check",
      sql`${t.targetRpe} is null or ${t.targetRpe} between 0 and 10`,
    ),
    check(
      "training_session_items_rating_check",
      sql`${t.rating} is null or ${t.rating} between 1 and 3`,
    ),
  ],
);

/**
 * Carga de un jugador: de una sesión (minutos y RPE), de un partido (solo RPE: los minutos salen
 * de los eventos) o extra (gimnasio, trabajo individual).
 */
export const playerLoads = pgTable(
  "player_loads",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    minutes: integer("minutes").notNull().default(0),
    rpe: integer("rpe"),
    participation: text("participation").notNull().default("full"),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("player_loads_organization_id_idx").on(t.organizationId),
    index("player_loads_player_date_idx").on(t.playerId, t.onDate),
    uniqueIndex("player_loads_event_player_unique")
      .on(t.eventId, t.playerId)
      .where(sql`${t.eventId} is not null`),
    uniqueIndex("player_loads_match_player_unique")
      .on(t.matchId, t.playerId)
      .where(sql`${t.matchId} is not null`),
    check("player_loads_source_check", inList(t.source, LOAD_SOURCES)),
    check("player_loads_participation_check", inList(t.participation, PARTICIPATIONS)),
    check("player_loads_rpe_check", sql`${t.rpe} is null or ${t.rpe} between 0 and 10`),
    check("player_loads_minutes_check", sql`${t.minutes} between 0 and 600`),
    check(
      "player_loads_origin_check",
      sql`(${t.source} = 'session' and ${t.eventId} is not null) or (${t.source} = 'match' and ${t.matchId} is not null) or (${t.source} = 'extra' and ${t.eventId} is null and ${t.matchId} is null)`,
    ),
  ],
);

/** Bienestar diario: cinco preguntas de 1 a 5, una entrada por jugador y día. */
export const wellnessEntries = pgTable(
  "wellness_entries",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    sleep: integer("sleep").notNull(),
    fatigue: integer("fatigue").notNull(),
    soreness: integer("soreness").notNull(),
    stress: integer("stress").notNull(),
    mood: integer("mood").notNull(),
    sorenessArea: text("soreness_area"),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("wellness_entries_player_date_unique").on(t.playerId, t.onDate),
    index("wellness_entries_organization_id_idx").on(t.organizationId),
    check(
      "wellness_entries_scale_check",
      sql`${t.sleep} between 1 and 5 and ${t.fatigue} between 1 and 5 and ${t.soreness} between 1 and 5 and ${t.stress} between 1 and 5 and ${t.mood} between 1 and 5`,
    ),
  ],
);

/**
 * Disponibilidad: periodos de limitación, readaptación o baja. El abierto (`ended_on` nulo) es
 * el vigente; sin periodo abierto, el jugador está disponible. Nunca lleva diagnóstico.
 */
export const playerAvailability = pgTable(
  "player_availability",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    restrictions: jsonb("restrictions").$type<RestrictionTag[]>().notNull().default([]),
    maxMinutes: integer("max_minutes"),
    fromOn: date("from_on").notNull(),
    expectedReturnOn: date("expected_return_on"),
    endedOn: date("ended_on"),
    note: text("note"),
    injuryId: uuid("injury_id").references(() => injuries.id, { onDelete: "set null" }),
    setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("player_availability_organization_id_idx").on(t.organizationId),
    index("player_availability_player_id_idx").on(t.playerId),
    uniqueIndex("player_availability_open_unique")
      .on(t.playerId)
      .where(sql`${t.endedOn} is null`),
    check("player_availability_status_check", inList(t.status, STORED_AVAILABILITY_STATUSES)),
    check(
      "player_availability_dates_check",
      sql`${t.endedOn} is null or ${t.endedOn} >= ${t.fromOn}`,
    ),
  ],
);

/** Lesión (área Salud): solo fisioterapia la escribe; el diagnóstico no sale de aquí. */
export const injuries = pgTable(
  "injuries",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    occurredOn: date("occurred_on").notNull(),
    context: text("context").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    bodyArea: text("body_area").notNull(),
    side: text("side").notNull(),
    kind: text("kind").notNull(),
    mechanism: text("mechanism").notNull(),
    recurrence: boolean("recurrence").notNull().default(false),
    diagnosis: text("diagnosis"),
    clinicalNotes: text("clinical_notes"),
    expectedReturnOn: date("expected_return_on"),
    returnedOn: date("returned_on"),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("injuries_organization_id_idx").on(t.organizationId),
    index("injuries_player_id_idx").on(t.playerId),
    check("injuries_context_check", inList(t.context, INJURY_CONTEXTS)),
    check("injuries_body_area_check", inList(t.bodyArea, BODY_AREAS)),
    check("injuries_side_check", inList(t.side, BODY_SIDES)),
    check("injuries_kind_check", inList(t.kind, INJURY_KINDS)),
    check("injuries_mechanism_check", inList(t.mechanism, INJURY_MECHANISMS)),
    check("injuries_status_check", inList(t.status, INJURY_STATUSES)),
    check(
      "injuries_dates_check",
      sql`${t.returnedOn} is null or ${t.returnedOn} >= ${t.occurredOn}`,
    ),
  ],
);

/** Fases de readaptación de una lesión, en orden. */
export const rehabPhases = pgTable(
  "rehab_phases",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    injuryId: uuid("injury_id")
      .notNull()
      .references(() => injuries.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    criteria: text("criteria"),
    startedOn: date("started_on"),
    doneOn: date("done_on"),
    ...timestamps,
  },
  (t) => [
    index("rehab_phases_organization_id_idx").on(t.organizationId),
    index("rehab_phases_injury_id_idx").on(t.injuryId),
  ],
);

/**
 * Consentimiento para tratar datos de salud de un deportista (RGPD, artículo 9): quién lo da,
 * cuándo y con qué versión del texto. Sin consentimiento vigente no se registran lesiones.
 */
export const healthConsents = pgTable(
  "health_consents",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    grantedByName: text("granted_by_name").notNull(),
    relationship: text("relationship").notNull(),
    grantedOn: date("granted_on").notNull(),
    textVersion: text("text_version").notNull(),
    revokedOn: date("revoked_on"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("health_consents_player_unique").on(t.playerId),
    index("health_consents_organization_id_idx").on(t.organizationId),
    check("health_consents_relationship_check", inList(t.relationship, CONSENT_RELATIONSHIPS)),
  ],
);

/** Contenidos del objetivo de un jugador: lo que la recomendación 17 vigila que se trabaje. */
export const playerFocusContents = pgTable(
  "player_focus_contents",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    contentId: uuid("content_id")
      .notNull()
      .references(() => trainingContents.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("player_focus_contents_player_content_unique").on(t.playerId, t.contentId),
    index("player_focus_contents_organization_id_idx").on(t.organizationId),
  ],
);

/** Respuesta del cuerpo técnico a una recomendación: la silencia para ese caso un tiempo. */
export const insightFeedback = pgTable(
  "insight_feedback",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    fingerprint: text("fingerprint").notNull(),
    outcome: text("outcome").notNull(),
    reason: text("reason"),
    snoozeUntil: date("snooze_until"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("insight_feedback_organization_id_idx").on(t.organizationId),
    index("insight_feedback_team_id_idx").on(t.teamId),
    uniqueIndex("insight_feedback_team_fingerprint_unique").on(t.teamId, t.fingerprint),
    check("insight_feedback_outcome_check", inList(t.outcome, INSIGHT_OUTCOMES)),
  ],
);

/** Tests físicos del club: el catálogo nace con los habituales y el club lo edita. */
export const physicalTests = pgTable(
  "physical_tests",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    direction: text("direction").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("physical_tests_org_code_unique").on(t.organizationId, t.code),
    check("physical_tests_unit_check", inList(t.unit, PHYSICAL_TEST_UNITS)),
    check("physical_tests_direction_check", inList(t.direction, PHYSICAL_TEST_DIRECTIONS)),
    check("physical_tests_status_check", inList(t.status, ["active", "archived"])),
  ],
);

/** Resultado de un test: un valor por jugador, test y día. */
export const physicalTestResults = pgTable(
  "physical_test_results",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    testId: uuid("test_id")
      .notNull()
      .references(() => physicalTests.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    value: numeric("value", { precision: 10, scale: 3 }).notNull(),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("physical_test_results_unique").on(t.testId, t.playerId, t.onDate),
    index("physical_test_results_organization_id_idx").on(t.organizationId),
    index("physical_test_results_player_id_idx").on(t.playerId),
  ],
);
