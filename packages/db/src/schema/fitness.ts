import {
  ANNOUNCEMENT_AUDIENCES,
  CAPACITIES,
  DAY_ROLES,
  TIME_DOMAINS,
  WORKOUT_TRACKS,
  BOOKING_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PLAN_BILLINGS,
  SCORE_TYPES,
  SUBSCRIPTION_STATUSES,
  WORKOUT_BLOCK_KINDS,
  WORKOUT_LEVELS,
  WORKOUT_STATUSES,
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
import { feePlans } from "./fees.ts";
import { organizations } from "./organizations.ts";
import { boxPlans } from "./planning.ts";
import { players, sections, teams } from "./structure.ts";

/**
 * Clubs de fitness (ADR 0049): reservas de clases abiertas, tarifas contratadas, programación del
 * WOD con sus resultados, marcas personales, comunidad y leads. Todo lleva `organization_id`
 * (ADR 0015). Los kilos y las medidas van en `numeric`: se leen como texto y la capa de datos
 * los pasa a número.
 */

/** Reglas de reserva del club: una fila por club; sin fila, las de por defecto. */
export const bookingPolicies = pgTable(
  "booking_policies",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    opensDaysBefore: integer("opens_days_before").notNull().default(7),
    closesMinutesBefore: integer("closes_minutes_before").notNull().default(0),
    cancelHoursBefore: integer("cancel_hours_before").notNull().default(2),
    lateCancelConsumes: boolean("late_cancel_consumes").notNull().default(true),
    noShowConsumes: boolean("no_show_consumes").notNull().default(true),
    maxPerDay: integer("max_per_day"),
    waitlist: boolean("waitlist").notNull().default(true),
    showAttendees: boolean("show_attendees").notNull().default(true),
    showLeaderboards: boolean("show_leaderboards").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("booking_policies_opens_check", sql`${t.opensDaysBefore} between 0 and 60`),
    check("booking_policies_closes_check", sql`${t.closesMinutesBefore} between 0 and 1440`),
    check("booking_policies_cancel_check", sql`${t.cancelHoursBefore} between 0 and 72`),
    check(
      "booking_policies_max_per_day_check",
      sql`${t.maxPerDay} is null or ${t.maxPerDay} between 1 and 10`,
    ),
  ],
);

/**
 * Tarifa contratada por un atleta: un plan de cuota con derecho de uso, desde una fecha. La
 * reserva gasta sesiones de la suscripción que vale para esa clase.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    feePlanId: uuid("fee_plan_id")
      .notNull()
      .references(() => feePlans.id, { onDelete: "restrict" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    status: text("status").notNull().default("active"),
    pausedUntil: date("paused_until"),
    billing: text("billing").notNull().default("manual"),
    /** Domiciliación en la cuenta de Stripe del club. */
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripeStatus: text("stripe_status"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("subscriptions_organization_id_idx").on(t.organizationId),
    index("subscriptions_player_id_idx").on(t.playerId),
    check("subscriptions_status_check", inList(t.status, SUBSCRIPTION_STATUSES)),
    check("subscriptions_billing_check", inList(t.billing, PLAN_BILLINGS)),
    check("subscriptions_dates_check", sql`${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`),
  ],
);

/**
 * Reserva de un atleta en una clase. Una fila por atleta y clase: cancelar y volver a reservar la
 * reutiliza. `consumes` se fija en cada cambio de estado con la política de ese momento.
 */
export const bookings = pgTable(
  "bookings",
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
    consumes: boolean("consumes").notNull().default(true),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    /** Orden de la espera: cuándo entró en ella. */
    queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    /** Quién la hizo: el propio atleta, el personal o la subida automática desde la espera. */
    source: text("source").notNull().default("self"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("bookings_event_player_unique").on(t.eventId, t.playerId),
    index("bookings_organization_id_idx").on(t.organizationId),
    index("bookings_player_id_idx").on(t.playerId),
    index("bookings_event_status_idx").on(t.eventId, t.status),
    check("bookings_status_check", inList(t.status, BOOKING_STATUSES)),
    check("bookings_source_check", inList(t.source, ["self", "staff", "waitlist"])),
  ],
);

/** El WOD de un día para una disciplina y, si se quiere, un tipo de clase. */
export const workouts = pgTable(
  "workouts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    title: text("title"),
    notes: text("notes"),
    status: text("status").notNull().default("draft"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /**
     * Planificación (ADR 0053): el plan y la semana a los que sirve, el papel del día, la intención
     * (dominio de tiempo, esfuerzo de 1 a 5 y cómo se tiene que sentir) y su porqué, una razón por línea.
     */
    planId: uuid("plan_id").references(() => boxPlans.id, { onDelete: "set null" }),
    planWeek: integer("plan_week"),
    dayRole: text("day_role"),
    intentDomain: text("intent_domain"),
    intentEffort: integer("intent_effort"),
    intentFeel: text("intent_feel"),
    why: text("why"),
    /** La sesión de un plan propio (un nivel, un grupo o una persona), no la del box. */
    specific: boolean("specific").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("workouts_organization_date_idx").on(t.organizationId, t.onDate),
    index("workouts_plan_idx").on(t.planId),
    check("workouts_day_role_check", sql`${t.dayRole} is null or ${inList(t.dayRole, DAY_ROLES)}`),
    check(
      "workouts_intent_domain_check",
      sql`${t.intentDomain} is null or ${inList(t.intentDomain, TIME_DOMAINS)}`,
    ),
    check(
      "workouts_intent_effort_check",
      sql`${t.intentEffort} is null or ${t.intentEffort} between 1 and 5`,
    ),
    uniqueIndex("workouts_section_date_unique")
      .on(t.sectionId, t.onDate)
      .where(sql`${t.teamId} is null and not ${t.specific}`),
    uniqueIndex("workouts_team_date_unique")
      .on(t.teamId, t.onDate)
      .where(sql`${t.teamId} is not null and not ${t.specific}`),
    uniqueIndex("workouts_plan_date_unique")
      .on(t.planId, t.onDate)
      .where(sql`${t.specific}`),
    check("workouts_specific_plan_check", sql`not ${t.specific} or ${t.planId} is not null`),
    check("workouts_status_check", inList(t.status, WORKOUT_STATUSES)),
  ],
);

export const workoutBlocks = pgTable(
  "workout_blocks",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    scoreType: text("score_type").notNull().default("none"),
    timeCapSeconds: integer("time_cap_seconds"),
    movementCode: text("movement_code"),
    percent: integer("percent"),
    rmReps: integer("rm_reps"),
    foundations: text("foundations"),
    scaled: text("scaled"),
    rx: text("rx"),
    rxPlus: text("rx_plus"),
    /** Planificación (ADR 0053): capacidad, minutos previstos, ejercicios enlazados y pista. */
    capacity: text("capacity"),
    plannedMinutes: integer("planned_minutes"),
    exerciseIds: jsonb("exercise_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    track: text("track").notNull().default("class"),
    ...timestamps,
  },
  (t) => [
    index("workout_blocks_workout_id_idx").on(t.workoutId),
    check(
      "workout_blocks_capacity_check",
      sql`${t.capacity} is null or ${inList(t.capacity, CAPACITIES)}`,
    ),
    check("workout_blocks_track_check", inList(t.track, WORKOUT_TRACKS)),
    check(
      "workout_blocks_minutes_check",
      sql`${t.plannedMinutes} is null or ${t.plannedMinutes} between 1 and 120`,
    ),
    check("workout_blocks_exercise_ids_check", sql`jsonb_typeof(${t.exerciseIds}) = 'array'`),
    index("workout_blocks_organization_id_idx").on(t.organizationId),
    check("workout_blocks_kind_check", inList(t.kind, WORKOUT_BLOCK_KINDS)),
    check("workout_blocks_score_type_check", inList(t.scoreType, SCORE_TYPES)),
    check(
      "workout_blocks_percent_check",
      sql`${t.percent} is null or ${t.percent} between 1 and 150`,
    ),
  ],
);

/** El marcador de un atleta en un bloque del WOD. */
export const workoutResults = pgTable(
  "workout_results",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => workoutBlocks.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    level: text("level").notNull(),
    timeSeconds: integer("time_seconds"),
    rounds: integer("rounds"),
    reps: integer("reps"),
    loadKg: numeric("load_kg", { precision: 6, scale: 2 }),
    distanceM: integer("distance_m"),
    calories: integer("calories"),
    completed: boolean("completed").notNull().default(true),
    effort: integer("effort"),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workout_results_block_player_unique").on(t.blockId, t.playerId),
    index("workout_results_organization_id_idx").on(t.organizationId),
    index("workout_results_player_id_idx").on(t.playerId),
    check("workout_results_level_check", inList(t.level, WORKOUT_LEVELS)),
    check("workout_results_effort_check", sql`${t.effort} is null or ${t.effort} between 1 and 5`),
  ],
);

/** Máxima de un atleta en un movimiento: kilos a tantas repeticiones, en un día. */
export const personalRecords = pgTable(
  "personal_records",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    movementCode: text("movement_code").notNull(),
    reps: integer("reps").notNull(),
    loadKg: numeric("load_kg", { precision: 6, scale: 2 }).notNull(),
    onDate: date("on_date").notNull(),
    note: text("note"),
    source: text("source").notNull().default("manual"),
    resultId: uuid("result_id").references(() => workoutResults.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("personal_records_player_movement_idx").on(t.playerId, t.movementCode),
    index("personal_records_organization_id_idx").on(t.organizationId),
    check("personal_records_reps_check", sql`${t.reps} in (1, 2, 3, 5, 10)`),
    check("personal_records_source_check", inList(t.source, ["manual", "result"])),
  ],
);

/** Resultado de un benchmark (Fran, Murph…), con su nivel. */
export const benchmarkResults = pgTable(
  "benchmark_results",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    benchmarkCode: text("benchmark_code").notNull(),
    level: text("level").notNull(),
    timeSeconds: integer("time_seconds"),
    rounds: integer("rounds"),
    reps: integer("reps"),
    loadKg: numeric("load_kg", { precision: 6, scale: 2 }),
    distanceM: integer("distance_m"),
    calories: integer("calories"),
    completed: boolean("completed").notNull().default(true),
    onDate: date("on_date").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("benchmark_results_player_code_idx").on(t.playerId, t.benchmarkCode),
    index("benchmark_results_organization_id_idx").on(t.organizationId),
    check("benchmark_results_level_check", inList(t.level, WORKOUT_LEVELS)),
  ],
);

/** Medidas corporales del atleta. Privadas: el coach las ve solo si el atleta las comparte. */
export const bodyMeasurements = pgTable(
  "body_measurements",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    onDate: date("on_date").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    bodyFatPct: numeric("body_fat_pct", { precision: 4, scale: 1 }),
    waistCm: numeric("waist_cm", { precision: 5, scale: 1 }),
    hipCm: numeric("hip_cm", { precision: 5, scale: 1 }),
    chestCm: numeric("chest_cm", { precision: 5, scale: 1 }),
    armCm: numeric("arm_cm", { precision: 5, scale: 1 }),
    thighCm: numeric("thigh_cm", { precision: 5, scale: 1 }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("body_measurements_player_date_idx").on(t.playerId, t.onDate),
    index("body_measurements_organization_id_idx").on(t.organizationId),
  ],
);

/** Privacidad del atleta en el box. Sin fila, las de por defecto. */
export const fitnessPreferences = pgTable(
  "fitness_preferences",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .unique()
      .references(() => players.id, { onDelete: "cascade" }),
    hideFromAttendees: boolean("hide_from_attendees").notNull().default(false),
    hideFromLeaderboards: boolean("hide_from_leaderboards").notNull().default(false),
    shareBodyWithCoach: boolean("share_body_with_coach").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("fitness_preferences_organization_id_idx").on(t.organizationId)],
);

/** Anuncio del club: para todos o para una disciplina, con confirmación de lectura. */
export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    audience: text("audience").notNull().default("all"),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    pinned: boolean("pinned").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("announcements_org_published_idx").on(t.organizationId, t.publishedAt),
    check("announcements_audience_check", inList(t.audience, ANNOUNCEMENT_AUDIENCES)),
    check(
      "announcements_section_check",
      sql`${t.audience} <> 'section' or ${t.sectionId} is not null`,
    ),
  ],
);

export const announcementReads = pgTable(
  "announcement_reads",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("announcement_reads_unique").on(t.announcementId, t.userId),
    index("announcement_reads_organization_id_idx").on(t.organizationId),
  ],
);

/**
 * Conversación del club con un atleta adulto: un hilo por atleta. Escribe el atleta o quien habla
 * en nombre del club. `read_at` lo pone el otro lado al leerlo.
 */
export const directMessages = pgTable(
  "direct_messages",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    fromAthlete: boolean("from_athlete").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("direct_messages_player_created_idx").on(t.playerId, t.createdAt),
    index("direct_messages_organization_id_idx").on(t.organizationId),
  ],
);

/** Persona interesada: de la web, de la puerta o recomendada; con su clase de prueba. */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    source: text("source").notNull(),
    status: text("status").notNull().default("new"),
    notes: text("notes"),
    trialEventId: uuid("trial_event_id").references(() => events.id, { onDelete: "set null" }),
    convertedPlayerId: uuid("converted_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("leads_org_status_idx").on(t.organizationId, t.status),
    check("leads_source_check", inList(t.source, LEAD_SOURCES)),
    check("leads_status_check", inList(t.status, LEAD_STATUSES)),
    check("leads_email_lowercase", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
  ],
);
