import { z } from "zod";
import { HOME_AWAY } from "../events.ts";
import { MATCH_STATUSES } from "../matches.ts";
import { INSIGHT_LEVELS, INSIGHT_OUTCOMES, INSIGHT_RULES } from "../training-insights.ts";
import {
  AVAILABILITY_STATUSES,
  BODY_AREAS,
  BODY_SIDES,
  CONSENT_RELATIONSHIPS,
  DRILL_SCOPES,
  DRILL_STATUSES,
  DrillDiagramSchema,
  INJURY_CONTEXTS,
  INJURY_KINDS,
  INJURY_MECHANISMS,
  INJURY_SEVERITIES,
  INJURY_STATUSES,
  MicrocycleDaySchema,
  PARTICIPATIONS,
  PHYSICAL_TEST_DIRECTIONS,
  PHYSICAL_TEST_UNITS,
  RESTRICTION_TAGS,
  SESSION_BLOCKS,
  SESSION_STATUSES,
  TRAINING_CONTENT_KINDS,
  TRAINING_CONTENT_STATUSES,
  TRAINING_TRACKING_LEVELS,
  TrainingSettingsSchema,
} from "../training.ts";

/** Contratos de entrenamiento, carga y salud (bloques 21 a 26, ADR 0039). */

const Ref = z.object({ id: z.string(), name: z.string() });

export const TrainingContentSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(TRAINING_CONTENT_KINDS),
  relatedActionCodes: z.array(z.string()),
  sortOrder: z.number().int(),
  status: z.enum(TRAINING_CONTENT_STATUSES),
});
export type TrainingContent = z.infer<typeof TrainingContentSchema>;

export const MicrocycleTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  days: z.array(MicrocycleDaySchema),
});
export type MicrocycleTemplate = z.infer<typeof MicrocycleTemplateSchema>;

/** Ajustes de entrenamiento de una sección: seguimiento, umbrales, metodología, contenidos y semanas tipo. */
export const TrainingConfigResponseSchema = z.object({
  section: z.object({ id: z.string(), name: z.string(), sportCode: z.string() }),
  settings: TrainingSettingsSchema,
  customized: z.boolean(),
  contents: z.array(TrainingContentSchema),
  categories: z.array(Ref),
  templates: z.array(MicrocycleTemplateSchema),
  access: z.object({ configure: z.boolean() }),
});
export type TrainingConfigResponse = z.infer<typeof TrainingConfigResponseSchema>;

export const MicrocycleTemplateResponseSchema = z.object({ template: MicrocycleTemplateSchema });

// --- Biblioteca ---

export const DrillSummarySchema = z.object({
  id: z.string(),
  scope: z.enum(DRILL_SCOPES),
  section: Ref.nullable(),
  team: Ref.nullable(),
  owner: z.object({ userId: z.string(), name: z.string() }).nullable(),
  name: z.string(),
  format: z.string().nullable(),
  space: z.string().nullable(),
  durationMin: z.number().int().nullable(),
  targetRpe: z.number().int().nullable(),
  restrictionTags: z.array(z.enum(RESTRICTION_TAGS)),
  contents: z.array(
    z.object({ id: z.string(), name: z.string(), kind: z.enum(TRAINING_CONTENT_KINDS) }),
  ),
  diagram: DrillDiagramSchema.nullable(),
  status: z.enum(DRILL_STATUSES),
  /** Uso: sesiones en las que está, última vez y valoración media (1 a 3). */
  uses: z.number().int().nonnegative(),
  lastUsedOn: z.string().nullable(),
  rating: z.number().nullable(),
  canEdit: z.boolean(),
});
export type DrillSummary = z.infer<typeof DrillSummarySchema>;

export const DrillDetailSchema = DrillSummarySchema.extend({
  description: z.string().nullable(),
  rules: z.string().nullable(),
  coachingPoints: z.string().nullable(),
  variants: z.string().nullable(),
  playersMin: z.number().int().nullable(),
  playersMax: z.number().int().nullable(),
  material: z.string().nullable(),
  videoUrl: z.string().nullable(),
  recentSessions: z.array(
    z.object({
      sessionId: z.string(),
      date: z.string(),
      team: Ref,
      rating: z.number().int().nullable(),
    }),
  ),
});
export type DrillDetail = z.infer<typeof DrillDetailSchema>;

export const DrillsResponseSchema = z.object({
  drills: z.array(DrillSummarySchema),
  contents: z.array(TrainingContentSchema),
  sections: z.array(Ref),
  teams: z.array(Ref.extend({ sectionId: z.string() })),
  access: z.object({ library: z.boolean(), create: z.boolean() }),
});
export type DrillsResponse = z.infer<typeof DrillsResponseSchema>;

export const DrillResponseSchema = z.object({
  drill: DrillDetailSchema,
  contents: z.array(TrainingContentSchema),
});
export type DrillResponse = z.infer<typeof DrillResponseSchema>;

// --- Recomendaciones ---

export const InsightSchema = z.object({
  rule: z.enum(INSIGHT_RULES),
  level: z.enum(INSIGHT_LEVELS),
  fingerprint: z.string(),
  playerId: z.string().nullable(),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  contentIds: z.array(z.string()),
  matchId: z.string().optional(),
  sessionId: z.string().optional(),
  groups: z
    .array(z.object({ key: z.enum(["recovery", "compensatory"]), playerIds: z.array(z.string()) }))
    .optional(),
});
export type InsightDto = z.infer<typeof InsightSchema>;

export const TeamInsightsResponseSchema = z.object({
  date: z.string(),
  insights: z.array(InsightSchema),
  contents: z.array(TrainingContentSchema),
  players: z.array(Ref),
  access: z.object({ answer: z.boolean() }),
});
export type TeamInsightsResponse = z.infer<typeof TeamInsightsResponseSchema>;

export const InsightFeedbackSchema = z.object({
  rule: z.enum(INSIGHT_RULES),
  fingerprint: z.string().min(1).max(200),
  playerId: z.string().uuid().nullable().optional(),
  outcome: z.enum(INSIGHT_OUTCOMES),
  reason: z.string().trim().max(200).nullable().optional(),
  /** Días que se silencia (por defecto 14). */
  snoozeDays: z.number().int().min(1).max(120).optional(),
});
export type InsightFeedback = z.infer<typeof InsightFeedbackSchema>;

// --- Sesiones ---

const Availability = z.object({
  status: z.enum(AVAILABILITY_STATUSES),
  restrictions: z.array(z.enum(RESTRICTION_TAGS)),
  maxMinutes: z.number().int().nullable(),
  fromOn: z.string().nullable(),
  expectedReturnOn: z.string().nullable(),
  note: z.string().nullable(),
});
export type AvailabilityDto = z.infer<typeof Availability>;
export const AvailabilitySchema = Availability;

export const SessionSummarySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  team: Ref,
  date: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  title: z.string(),
  facility: Ref.nullable(),
  /** Etiqueta MD efectiva: la puesta a mano o la calculada de los partidos. */
  mdLabel: z.string().nullable(),
  status: z.enum(SESSION_STATUSES),
  objective: z.string().nullable(),
  targetRpe: z.number().int().nullable(),
  plannedMinutes: z.number().int(),
  plannedLoad: z.number(),
  actualMinutes: z.number().int().nullable(),
  /** Carga media por jugador (RPE × minutos) del cierre. */
  actualLoad: z.number().nullable(),
  itemsCount: z.number().int(),
  contentMinutes: z.array(z.object({ contentId: z.string(), minutes: z.number().int() })),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionItemSchema = z.object({
  id: z.string(),
  block: z.enum(SESSION_BLOCKS),
  sortOrder: z.number().int(),
  drillId: z.string().nullable(),
  title: z.string(),
  minutes: z.number().int(),
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  restSec: z.number().int().nullable(),
  targetRpe: z.number().int().nullable(),
  groupLabel: z.string().nullable(),
  playerIds: z.array(z.string()).nullable(),
  contentIds: z.array(z.string()),
  restrictionTags: z.array(z.enum(RESTRICTION_TAGS)),
  notes: z.string().nullable(),
  rating: z.number().int().nullable(),
  /** De la tarea de la biblioteca, para el modo pista. */
  description: z.string().nullable(),
  coachingPoints: z.string().nullable(),
  diagram: DrillDiagramSchema.nullable(),
});
export type SessionItem = z.infer<typeof SessionItemSchema>;

export const SessionRosterEntrySchema = z.object({
  playerId: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  shirtNumber: z.number().int().nullable(),
  position: z.string().nullable(),
  isGoalkeeper: z.boolean(),
  availability: Availability,
  attendance: z.enum(["present", "absent", "excused"]).nullable(),
  load: z
    .object({
      rpe: z.number().int().nullable(),
      minutes: z.number().int(),
      participation: z.enum(PARTICIPATIONS),
    })
    .nullable(),
});
export type SessionRosterEntry = z.infer<typeof SessionRosterEntrySchema>;

export const SessionDetailResponseSchema = z.object({
  session: SessionSummarySchema.extend({
    notes: z.string().nullable(),
    rating: z.number().int().nullable(),
    cycleId: z.string().nullable(),
    contentIds: z.array(z.string()),
    mdLabelOverride: z.string().nullable(),
  }),
  section: z.object({ id: z.string(), name: z.string(), sportCode: z.string() }),
  items: z.array(SessionItemSchema),
  roster: z.array(SessionRosterEntrySchema),
  contents: z.array(TrainingContentSchema),
  cycles: z.array(
    z.object({ id: z.string(), name: z.string(), startsOn: z.string(), endsOn: z.string() }),
  ),
  insights: z.array(InsightSchema),
  tracking: z.enum(TRAINING_TRACKING_LEVELS),
  access: z.object({
    /** Cabecera de la sesión (objetivo, estado, MD, ciclo) y borrarla. */
    header: z.boolean(),
    /** Bloques que puede editar quien pregunta. */
    blocks: z.array(z.enum(SESSION_BLOCKS)),
    /** Cerrar la sesión: asistencia y RPE. */
    close: z.boolean(),
  }),
});
export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;

/** Si un entrenamiento de la agenda tiene sesión planificada (y quien pregunta llega a ella). */
export const EventSessionResponseSchema = z.object({ sessionId: z.string().nullable() });

export const TeamWeekResponseSchema = z.object({
  team: Ref.extend({
    section: z.object({ id: z.string(), name: z.string(), sportCode: z.string() }),
  }),
  week: z.object({ start: z.string(), end: z.string() }),
  days: z.array(
    z.object({
      date: z.string(),
      mdLabel: z.string().nullable(),
      sessions: z.array(SessionSummarySchema),
      /** Entrenamientos de la agenda sin sesión planificada. */
      trainings: z.array(
        z.object({
          eventId: z.string(),
          title: z.string(),
          startsAt: z.string(),
          endsAt: z.string(),
          facility: Ref.nullable(),
        }),
      ),
      matches: z.array(
        z.object({
          matchId: z.string().nullable(),
          eventId: z.string().nullable(),
          opponent: z.string().nullable(),
          homeAway: z.enum(HOME_AWAY).nullable(),
          startsAt: z.string().nullable(),
          status: z.enum(MATCH_STATUSES).nullable(),
          ownScore: z.number().int().nullable(),
          opponentScore: z.number().int().nullable(),
        }),
      ),
    }),
  ),
  availability: z.object({
    total: z.number().int(),
    available: z.number().int(),
    limited: z.number().int(),
    rehab: z.number().int(),
    out: z.number().int(),
  }),
  load: z.object({
    planned: z.number(),
    actual: z.number().nullable(),
    /** Media de las cuatro semanas anteriores con datos. */
    baseline: z.number().nullable(),
  }),
  cycle: z
    .object({ id: z.string(), name: z.string(), focusContentIds: z.array(z.string()) })
    .nullable(),
  templates: z.array(MicrocycleTemplateSchema),
  contents: z.array(TrainingContentSchema),
  tracking: z.enum(TRAINING_TRACKING_LEVELS),
  access: z.object({ write: z.boolean() }),
});
export type TeamWeekResponse = z.infer<typeof TeamWeekResponseSchema>;

export const TeamSeasonResponseSchema = z.object({
  team: Ref,
  season: z.object({ id: z.string(), name: z.string(), startsOn: z.string(), endsOn: z.string() }),
  plan: z.object({ id: z.string(), name: z.string(), notes: z.string().nullable() }).nullable(),
  cycles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      startsOn: z.string(),
      endsOn: z.string(),
      focusContentIds: z.array(z.string()),
      targetWeeklyLoad: z.number().int().nullable(),
      notes: z.string().nullable(),
    }),
  ),
  weeks: z.array(
    z.object({
      start: z.string(),
      planned: z.number(),
      actual: z.number().nullable(),
      sessions: z.number().int(),
      matches: z.number().int(),
    }),
  ),
  matches: z.array(
    z.object({
      date: z.string(),
      opponent: z.string().nullable(),
      matchId: z.string().nullable(),
      ownScore: z.number().int().nullable(),
      opponentScore: z.number().int().nullable(),
    }),
  ),
  contents: z.array(TrainingContentSchema),
  access: z.object({ write: z.boolean() }),
});
export type TeamSeasonResponse = z.infer<typeof TeamSeasonResponseSchema>;

export const TeamSessionsResponseSchema = z.object({
  team: Ref,
  sessions: z.array(SessionSummarySchema.extend({ drills: z.array(z.string()) })),
  contents: z.array(TrainingContentSchema),
});
export type TeamSessionsResponse = z.infer<typeof TeamSessionsResponseSchema>;

// --- Carga ---

/** Umbrales de la relación aguda:crónica de la sección: fuera de ellos, aviso (nunca predicción). */
export const AcwrThresholdsSchema = z.object({ high: z.number(), low: z.number() });

export const LoadMetricsSchema = z.object({
  acute: z.number(),
  chronic: z.number(),
  ratio: z.number().nullable(),
  monotony: z.number().nullable(),
  strain: z.number().nullable(),
  historyDays: z.number().int(),
});

const Wellness = z.object({
  date: z.string(),
  sleep: z.number().int(),
  fatigue: z.number().int(),
  soreness: z.number().int(),
  stress: z.number().int(),
  mood: z.number().int(),
  score: z.number().int(),
  sorenessArea: z.string().nullable(),
  note: z.string().nullable(),
});
export const WellnessSchema = Wellness;
export type WellnessDto = z.infer<typeof Wellness>;

export const TeamLoadResponseSchema = z.object({
  team: Ref,
  today: z.string(),
  days: z.array(z.string()),
  players: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      shirtNumber: z.number().int().nullable(),
      availability: Availability,
      metrics: LoadMetricsSchema,
      /** Carga diaria alineada con `days`. */
      daily: z.array(z.number()),
      lastWellness: Wellness.nullable(),
    }),
  ),
  insights: z.array(InsightSchema),
  tracking: z.enum(TRAINING_TRACKING_LEVELS),
  acwr: AcwrThresholdsSchema,
  access: z.object({ write: z.boolean() }),
});
export type TeamLoadResponse = z.infer<typeof TeamLoadResponseSchema>;

const PhysicalTest = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.enum(PHYSICAL_TEST_UNITS),
  direction: z.enum(PHYSICAL_TEST_DIRECTIONS),
  status: z.enum(["active", "archived"]),
});
export const PhysicalTestSchema = PhysicalTest;
export type PhysicalTestDto = z.infer<typeof PhysicalTest>;

export const PhysicalTestsResponseSchema = z.object({
  tests: z.array(PhysicalTest),
  access: z.object({ manage: z.boolean() }),
});
export type PhysicalTestsResponse = z.infer<typeof PhysicalTestsResponseSchema>;

const TestResult = z.object({
  testId: z.string(),
  playerId: z.string(),
  date: z.string(),
  value: z.number(),
});
export const TeamTestsResponseSchema = z.object({
  team: Ref,
  tests: z.array(PhysicalTest),
  players: z.array(
    z.object({ playerId: z.string(), name: z.string(), shirtNumber: z.number().int().nullable() }),
  ),
  results: z.array(TestResult),
  access: z.object({ write: z.boolean() }),
});
export type TeamTestsResponse = z.infer<typeof TeamTestsResponseSchema>;

/** La evolución de uno de los suyos, para la familia: nunca comparada con nadie (DESIGN.md 10). */
export const FamilyTestsResponseSchema = z.object({
  tests: z.array(PhysicalTest),
  results: z.array(TestResult.omit({ playerId: true })),
});
export type FamilyTestsResponse = z.infer<typeof FamilyTestsResponseSchema>;

export const PlayerPerformanceResponseSchema = z.object({
  player: z.object({
    id: z.string(),
    name: z.string(),
    photoUrl: z.string().nullable(),
    team: Ref.nullable(),
    section: Ref.nullable(),
  }),
  today: z.string(),
  availability: z.object({
    current: Availability,
    history: z.array(
      z.object({
        id: z.string(),
        status: z.enum(AVAILABILITY_STATUSES),
        restrictions: z.array(z.enum(RESTRICTION_TAGS)),
        maxMinutes: z.number().int().nullable(),
        fromOn: z.string(),
        expectedReturnOn: z.string().nullable(),
        endedOn: z.string().nullable(),
        note: z.string().nullable(),
      }),
    ),
  }),
  load: z.object({
    metrics: LoadMetricsSchema,
    acwr: AcwrThresholdsSchema,
    days: z.array(
      z.object({ date: z.string(), session: z.number(), match: z.number(), extra: z.number() }),
    ),
    extras: z.array(
      z.object({
        id: z.string(),
        date: z.string(),
        minutes: z.number().int(),
        rpe: z.number().int(),
        note: z.string().nullable(),
      }),
    ),
  }),
  wellness: z.array(Wellness),
  focus: z.object({
    contentIds: z.array(z.string()),
    contents: z.array(TrainingContentSchema),
    minutes: z.array(z.object({ contentId: z.string(), minutes: z.number().int() })),
    objective: z.object({ title: z.string(), reviewOn: z.string().nullable() }).nullable(),
  }),
  tests: z.array(
    z.object({
      test: PhysicalTest,
      results: z.array(z.object({ date: z.string(), value: z.number() })),
    }),
  ),
  insights: z.array(InsightSchema),
  access: z.object({
    loadWrite: z.boolean(),
    availabilityWrite: z.boolean(),
    healthRead: z.boolean(),
    focusWrite: z.boolean(),
  }),
});
export type PlayerPerformanceResponse = z.infer<typeof PlayerPerformanceResponseSchema>;

export const PlayerFocusSetSchema = z.object({
  contentIds: z.array(z.string().uuid()).max(6),
});
export type PlayerFocusSet = z.infer<typeof PlayerFocusSetSchema>;

// --- Salud ---

const Injury = z.object({
  id: z.string(),
  occurredOn: z.string(),
  context: z.enum(INJURY_CONTEXTS),
  eventId: z.string().nullable(),
  matchId: z.string().nullable(),
  bodyArea: z.enum(BODY_AREAS),
  side: z.enum(BODY_SIDES),
  kind: z.enum(INJURY_KINDS),
  mechanism: z.enum(INJURY_MECHANISMS),
  recurrence: z.boolean(),
  diagnosis: z.string().nullable(),
  clinicalNotes: z.string().nullable(),
  expectedReturnOn: z.string().nullable(),
  returnedOn: z.string().nullable(),
  status: z.enum(INJURY_STATUSES),
  daysOut: z.number().int(),
  severity: z.enum(INJURY_SEVERITIES),
  phases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      criteria: z.string().nullable(),
      startedOn: z.string().nullable(),
      doneOn: z.string().nullable(),
    }),
  ),
});
export const InjurySchema = Injury;
export type InjuryDto = z.infer<typeof Injury>;

export const HealthConsentSchema = z.object({
  grantedByName: z.string(),
  relationship: z.enum(CONSENT_RELATIONSHIPS),
  grantedOn: z.string(),
  textVersion: z.string(),
  revokedOn: z.string().nullable(),
});

export const PlayerHealthResponseSchema = z.object({
  consent: HealthConsentSchema.nullable(),
  currentTextVersion: z.string(),
  injuries: z.array(Injury),
  access: z.object({ write: z.boolean() }),
});
export type PlayerHealthResponse = z.infer<typeof PlayerHealthResponseSchema>;

export const InfirmaryResponseSchema = z.object({
  today: z.string(),
  players: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      team: Ref.nullable(),
      availability: Availability,
      /** Solo con acceso a Salud. */
      injury: z
        .object({
          id: z.string(),
          bodyArea: z.enum(BODY_AREAS),
          kind: z.enum(INJURY_KINDS),
          diagnosis: z.string().nullable(),
          occurredOn: z.string(),
          phase: z.string().nullable(),
        })
        .nullable(),
      returningThisWeek: z.boolean(),
    }),
  ),
  /** Molestias reportadas en el bienestar de los últimos dos días (con acceso a la carga). */
  soreness: z.array(
    z.object({
      playerId: z.string(),
      name: z.string(),
      date: z.string(),
      soreness: z.number().int(),
      sorenessArea: z.string().nullable(),
    }),
  ),
  access: z.object({ healthRead: z.boolean(), availabilityWrite: z.boolean() }),
});
export type InfirmaryResponse = z.infer<typeof InfirmaryResponseSchema>;

// --- Metodología ---

export const MethodologyResponseSchema = z.object({
  section: Ref,
  categories: z.array(Ref),
  methodology: TrainingSettingsSchema.shape.methodology,
  teams: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: Ref.nullable(),
      /** Entrenamientos de la agenda hasta hoy y cuántos tienen sesión planificada y cerrada. */
      trainings: z.number().int(),
      planned: z.number().int(),
      done: z.number().int(),
      minutesByKind: z.record(z.string(), z.number().int()),
      totalMinutes: z.number().int(),
      /** Minutos con tareas de la biblioteca del club o de la sección, en porcentaje. */
      officialShare: z.number().int().nullable(),
    }),
  ),
  access: z.object({ configure: z.boolean() }),
});
export type MethodologyResponse = z.infer<typeof MethodologyResponseSchema>;

// --- Jugador adulto con cuenta propia ---

export const AthleteResponseSchema = z.object({
  today: z.string(),
  player: z.object({ id: z.string(), name: z.string(), team: Ref.nullable() }).nullable(),
  wellnessToday: Wellness.nullable(),
  recent: z.array(z.object({ date: z.string(), score: z.number().int() })),
  pendingRpe: z.array(
    z.object({
      eventId: z.string(),
      title: z.string(),
      startsAt: z.string(),
      minutes: z.number().int(),
    }),
  ),
});
export type AthleteResponse = z.infer<typeof AthleteResponseSchema>;

export const AthleteRpeSchema = z.object({ rpe: z.number().int().min(0).max(10) });
export type AthleteRpe = z.infer<typeof AthleteRpeSchema>;
