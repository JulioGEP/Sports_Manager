import { z } from "zod";
import { CAPACITIES, DAY_ROLES, TIME_DOMAINS } from "../capacities.ts";
import { EXERCISE_CATEGORIES } from "../exercises.ts";
import { WORKOUT_LEVELS, WorkoutBlockInputSchema } from "../fitness.ts";
import {
  BOX_EQUIPMENT_KINDS,
  EmphasisSchema,
  LEVEL_CAPACITIES,
  PLAN_BLOCK_KINDS,
  PLAN_TEMPLATE_CODES,
  PlanStructureSchema,
  PlanTestCodeSchema,
} from "../planning.ts";
import {
  ADJUSTMENT_KINDS,
  MOVEMENT_PATTERNS,
  PROJECTION_BANDS,
  VALIDATION_CHECKS,
} from "../planning-analysis.ts";
import { AI_PLAN_KINDS, COPILOT_OPS } from "../planning-ai.ts";
import { DateOnlySchema } from "../structure.ts";
import { AI_FAILURES, AI_GENERATION_STATUSES } from "../training-ai.ts";
import { AthleteLevelSchema, WorkoutViewSchema } from "./fitness.ts";
import { AiQuotaSchema } from "./training-ai.ts";

/** Contratos de la planificación del box (ADR 0053). */

const Ref = z.object({ id: z.string(), name: z.string() });
const EmphasisView = z.object(
  Object.fromEntries(CAPACITIES.map((c) => [c, z.number()])) as Record<
    (typeof CAPACITIES)[number],
    z.ZodNumber
  >,
);

// --- Material ---

export const EquipmentItemSchema = z.object({
  id: z.string(),
  kind: z.enum(BOX_EQUIPMENT_KINDS as unknown as [string, ...string[]]),
  name: z.string(),
  quantity: z.number().int(),
  outOfService: z.number().int(),
  repairUntil: z.string().nullable(),
  minKg: z.number().nullable(),
  maxKg: z.number().nullable(),
  facility: Ref.nullable(),
  notes: z.string().nullable(),
  /** Unidades usables hoy. */
  availableToday: z.number().int(),
});
export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;
export const EquipmentResponseSchema = z.object({
  items: z.array(EquipmentItemSchema),
  facilities: z.array(Ref),
  canWrite: z.boolean(),
});
export type EquipmentResponse = z.infer<typeof EquipmentResponseSchema>;
export const EquipmentItemResponseSchema = z.object({ item: EquipmentItemSchema });

// --- Ajustes de la programación ---

export const ATHLETE_PREVIEWS = ["none", "roles", "wod"] as const;
export type AthletePreview = (typeof ATHLETE_PREVIEWS)[number];

const LevelName = z.string().trim().min(1).max(30).nullable();
export const PlanningSettingsSchema = z.object({
  /** Nombre de cada nivel en el box. Nulo: el de siempre. */
  levelNames: z.object({
    foundations: LevelName,
    scaled: LevelName,
    rx: LevelName,
    rx_plus: LevelName,
  }),
  /** Qué ve el atleta de los días que vienen: nada, el papel de cada día o el WOD publicado. */
  athletePreview: z.enum(ATHLETE_PREVIEWS),
});
export type PlanningSettings = z.infer<typeof PlanningSettingsSchema>;
export const PlanningSettingsUpdateSchema = PlanningSettingsSchema.partial();
export const PlanningSettingsResponseSchema = z.object({
  settings: PlanningSettingsSchema,
  canWrite: z.boolean(),
});

// --- Lo que ya sabe el box (para crear un plan) ---

export const ComboSchema = z.object({
  days: z.array(z.number().int()),
  share: z.number(),
  count: z.number().int(),
});

export const PlanningContextResponseSchema = z.object({
  section: Ref,
  discipline: z.string(),
  sport: z.string().nullable(),
  classWeekdays: z.array(z.number().int()),
  classMinutes: z.number().int(),
  classSize: z.number().int(),
  athletes: z.number().int(),
  levels: z.object(
    Object.fromEntries(WORKOUT_LEVELS.map((l) => [l, z.number().int()])) as Record<
      (typeof WORKOUT_LEVELS)[number],
      z.ZodNumber
    >,
  ),
  frequency: z.object({
    average: z.number().nullable(),
    distribution: z.array(z.object({ days: z.number().int(), share: z.number() })),
    combos: z.array(ComboSchema),
  }),
  inventory: z.array(
    z.object({
      kind: z.string(),
      name: z.string(),
      available: z.number().int(),
      weights: z.string().nullable(),
    }),
  ),
  exercises: z.object({
    total: z.number().int(),
    byCategory: z.array(
      z.object({ category: z.enum(EXERCISE_CATEGORIES), count: z.number().int() }),
    ),
    /** Ejercicios que salen como escalado en los WODs del box y no tienen ficha. */
    missing: z.array(z.string()),
  }),
  suggestedClosures: z.array(z.string()),
  /** Calibración del último plan terminado de la disciplina, si la hay. */
  calibration: z.number().nullable(),
  previous: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      endsOn: z.string(),
      calibration: z.number().nullable(),
      improved: z.number().int(),
      athletes: z.number().int(),
      headline: z
        .object({ code: z.string(), realPct: z.number(), low: z.number(), high: z.number() })
        .nullable(),
    }),
  ),
  /** Plan activo de la disciplina, si lo hay. */
  active: Ref.nullable(),
  ai: z.object({ available: z.boolean(), quota: AiQuotaSchema }),
  canWrite: z.boolean(),
});
export type PlanningContextResponse = z.infer<typeof PlanningContextResponseSchema>;

// --- El plan ---

export const PLAN_STATUSES = ["draft", "active", "finished", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PlanCreateSchema = z.object({
  sectionId: z.string().uuid(),
  templateCode: z.enum(PLAN_TEMPLATE_CODES),
  name: z.string().trim().min(1).max(80),
  goal: z.string().trim().max(400).nullable().optional(),
  eventName: z.string().trim().max(80).nullable().optional(),
  eventDate: DateOnlySchema.nullable().optional(),
  /** Lunes de la primera semana. */
  startsOn: DateOnlySchema,
  weeks: z.number().int().min(3).max(52),
  emphasis: EmphasisSchema,
  /** Días por semana de referencia para la proyección. */
  frequency: z.number().int().min(2).max(6),
  tests: z.array(PlanTestCodeSchema).max(6),
  closures: z.array(DateOnlySchema).max(60),
  /** Bloques decididos por el arquitecto con IA; si no, los de la plantilla. */
  phases: z
    .array(
      z.object({
        kind: z.enum(PLAN_BLOCK_KINDS),
        weeks: z.number().int().min(1).max(12),
        focus: z.string().trim().max(200).nullable(),
      }),
    )
    .max(20)
    .optional(),
  /** Activo ya (si no hay otro activo en la disciplina) o en borrador. */
  activate: z.boolean().optional(),
});
export type PlanCreate = z.infer<typeof PlanCreateSchema>;

export const PlanUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  goal: z.string().trim().max(400).nullable().optional(),
  eventName: z.string().trim().max(80).nullable().optional(),
  eventDate: DateOnlySchema.nullable().optional(),
  emphasis: EmphasisSchema.optional(),
  frequency: z.number().int().min(2).max(6).optional(),
  tests: z.array(PlanTestCodeSchema).max(6).optional(),
  closures: z.array(DateOnlySchema).max(60).optional(),
  status: z.enum(PLAN_STATUSES).optional(),
  /** La estructura editada a mano (un bloque más largo, un papel cambiado, semanas añadidas). */
  structure: PlanStructureSchema.optional(),
});
export type PlanUpdate = z.infer<typeof PlanUpdateSchema>;

export const ProjectionSchema = z.object({
  frequencyFactor: z.number(),
  capacities: z.array(
    z.object({
      capacity: z.enum(CAPACITIES),
      points: z.number(),
      band: z.enum(PROJECTION_BANDS),
      gain: z.number(),
    }),
  ),
  tests: z.array(
    z.object({
      code: z.string(),
      unit: z.enum(["percent", "reps"]),
      low: z.number(),
      high: z.number(),
    }),
  ),
});

export const PlanSummarySchema = z.object({
  id: z.string(),
  section: Ref,
  name: z.string(),
  templateCode: z.enum(PLAN_TEMPLATE_CODES),
  status: z.enum(PLAN_STATUSES),
  startsOn: z.string(),
  endsOn: z.string(),
  weeks: z.number().int(),
  currentWeek: z.number().int().nullable(),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

export const PlanViewSchema = PlanSummarySchema.extend({
  goal: z.string().nullable(),
  eventName: z.string().nullable(),
  eventDate: z.string().nullable(),
  emphasis: EmphasisView,
  frequency: z.number().int(),
  tests: z.array(z.string()),
  closures: z.array(z.string()),
  structure: PlanStructureSchema,
  /** La proyección guardada al crearlo (con la que se calibra al acabar). */
  projection: ProjectionSchema.nullable(),
  /** Mediana de los tests al empezar, por código. */
  baselines: z.record(z.string(), z.number()),
  workouts: z.number().int(),
  canWrite: z.boolean(),
  createdAt: z.string(),
});
export type PlanView = z.infer<typeof PlanViewSchema>;
export const PlansResponseSchema = z.object({ plans: z.array(PlanSummarySchema) });
export const PlanResponseSchema = z.object({ plan: PlanViewSchema });
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

// --- La semana del plan ---

export const ValidationResultSchema = z.object({
  check: z.enum(VALIDATION_CHECKS),
  status: z.enum(["ok", "warn", "fail"]),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export const LogisticsSchema = z.object({
  label: z.string(),
  kind: z.string(),
  available: z.number().int(),
  needed: z.number().int(),
  mode: z.enum(["ok", "pool", "partners", "waves", "short"]),
  waves: z.number().int(),
});

export const CoverageSchema = z.object({
  days: z.array(z.number().int()),
  share: z.number(),
  covered: z.array(z.enum(CAPACITIES)),
  missing: z.array(z.object({ capacity: z.enum(CAPACITIES), addTo: z.number().int() })),
});

export const WeekLimitSchema = z.object({
  code: z.enum(["overhead_days", "heavy_streak", "run_days", "jump_days"]),
  value: z.number().int(),
  max: z.number().int(),
});

export const PlanWeekDaySchema = z.object({
  date: z.string(),
  weekday: z.number().int(),
  role: z.enum(DAY_ROLES).nullable(),
  closed: z.boolean(),
  /** Clases ese día y plazas de la más grande. */
  classes: z.number().int(),
  classSize: z.number().int(),
  workout: WorkoutViewSchema.nullable(),
  validation: z.array(ValidationResultSchema),
  logistics: z.array(LogisticsSchema),
  prescription: z
    .object({
      movementCode: z.string(),
      sets: z.number().int(),
      reps: z.number().int(),
      percent: z.number().int(),
      rmReps: z.number().int().nullable(),
    })
    .nullable(),
});
export type PlanWeekDay = z.infer<typeof PlanWeekDaySchema>;

export const PlanWeekResponseSchema = z.object({
  plan: PlanSummarySchema,
  week: z.object({
    n: z.number().int(),
    startsOn: z.string(),
    kind: z.enum(PLAN_BLOCK_KINDS),
    block: z.number().int(),
    blockLabel: z.string(),
    blockFocus: z.string().nullable(),
    volume: z.number().int(),
    intensity: z.number().int(),
    tags: z.array(z.string()),
  }),
  days: z.array(PlanWeekDaySchema),
  /** Énfasis del bloque y reparto de minutos programados esta semana (en puntos sobre 100). */
  balance: z.object({ block: EmphasisView, week: EmphasisView }),
  coverage: z.array(CoverageSchema),
  limits: z.array(WeekLimitSchema),
  /** Lo que el copiloto ha escrito y espera a que el coach lo aplique. */
  pendingAi: z.string().nullable(),
  canWrite: z.boolean(),
});
export type PlanWeekResponse = z.infer<typeof PlanWeekResponseSchema>;

export const PlanDraftsResponseSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
});

// --- IA del plan ---

export const AiPlanSessionSchema = z.object({
  date: z.string(),
  title: z.string(),
  intentFeel: z.string().nullable(),
  why: z.array(z.string()),
  blocks: z.array(WorkoutBlockInputSchema),
});

export const AiPlanProposalSchema = z.union([
  z.object({
    kind: z.literal("plan_architect"),
    templateCode: z.enum(PLAN_TEMPLATE_CODES),
    name: z.string(),
    weeks: z.number().int(),
    emphasis: EmphasisView,
    phases: z.array(
      z.object({
        kind: z.enum(PLAN_BLOCK_KINDS),
        weeks: z.number().int(),
        focus: z.string().nullable(),
      }),
    ),
    tests: z.array(z.string()),
    rationale: z.string(),
  }),
  z.object({ kind: z.literal("plan_week"), sessions: z.array(AiPlanSessionSchema) }),
  z.object({
    kind: z.literal("plan_copilot"),
    reply: z.string(),
    changes: z.array(
      z.object({
        op: z.enum(COPILOT_OPS),
        date: z.string(),
        toDate: z.string().nullable(),
        before: z.string(),
        after: z.string(),
        why: z.string(),
        session: AiPlanSessionSchema.nullable(),
      }),
    ),
  }),
]);
export type AiPlanProposal = z.infer<typeof AiPlanProposalSchema>;

export const AiPlanGenerationSchema = z.object({
  id: z.string(),
  kind: z.enum(AI_PLAN_KINDS),
  status: z.enum(AI_GENERATION_STATUSES),
  failure: z.enum(AI_FAILURES).nullable(),
  planId: z.string().nullable(),
  week: z.number().int().nullable(),
  message: z.string().nullable(),
  proposal: AiPlanProposalSchema.nullable(),
  appliedAt: z.string().nullable(),
  quota: AiQuotaSchema,
});
export type AiPlanGeneration = z.infer<typeof AiPlanGenerationSchema>;
export const AiPlanGenerationResponseSchema = z.object({ generation: AiPlanGenerationSchema });
export type AiPlanGenerationResponse = z.infer<typeof AiPlanGenerationResponseSchema>;

export const AiPlanApplySchema = z.object({
  /** Qué sesiones (programador) o cambios (copiloto) aplicar, por posición. Sin lista: todos. */
  indexes: z.array(z.number().int().min(0).max(20)).max(21).optional(),
});
export const AiPlanApplyResponseSchema = z.object({
  applied: z.number().int(),
  skipped: z.number().int(),
});

// --- Revisión del domingo ---

export const ReviewRowSchema = z.object({
  workoutId: z.string(),
  date: z.string(),
  title: z.string().nullable(),
  role: z.enum(DAY_ROLES).nullable(),
  metric: z.enum(["minutes", "effort", "completion"]),
  low: z.number(),
  high: z.number(),
  value: z.number().nullable(),
  scaleMax: z.number(),
  verdict: z.enum(["as_planned", "longer", "shorter", "harder", "easier", "no_data"]),
  samples: z.number().int(),
  modality: z.enum(["run", "row", "other"]),
  movementCode: z.string().nullable(),
  percent: z.number().nullable(),
});

export const AdjustmentViewSchema = z.object({
  key: z.string(),
  kind: z.enum(ADJUSTMENT_KINDS),
  workoutId: z.string(),
  date: z.string(),
  blockId: z.string().nullable(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  status: z.enum(["pending", "accepted", "discarded"]),
});

export const PlanReviewResponseSchema = z.object({
  plan: PlanSummarySchema,
  week: z.number().int(),
  startsOn: z.string(),
  /** Semanas que se pueden revisar (ya empezadas). */
  weeks: z.array(z.number().int()),
  rows: z.array(ReviewRowSchema),
  kpis: z.object({
    fulfilled: z.number().int(),
    attendees: z.number().int(),
    usualAttendees: z.number().nullable(),
    effort: z.number().nullable(),
    plannedEffort: z.number().nullable(),
    logged: z.number().int(),
    prs: z.number().int(),
  }),
  adjustments: z.array(AdjustmentViewSchema),
  learned: z.array(
    z.object({
      code: z.enum([
        "time_run",
        "time_row",
        "time_other",
        "effort_long_engine",
        "attendance_saturday",
      ]),
      value: z.number(),
      samples: z.number().int(),
    }),
  ),
  canWrite: z.boolean(),
});
export type PlanReviewResponse = z.infer<typeof PlanReviewResponseSchema>;
export const AdjustmentDecisionSchema = z.object({
  key: z.string().min(1).max(200),
  decision: z.enum(["accept", "discard"]),
});

// --- Salud de la programación ---

export const PlanHealthResponseSchema = z.object({
  plan: PlanSummarySchema,
  /** Semanas que entran: hasta la que viene. */
  weeks: z.array(z.number().int()),
  kpis: z.object({
    fulfilled: z.number().int(),
    athletesWithPr: z.number().int(),
    athletes: z.number().int(),
    frequency: z.number().nullable(),
    frequencyBefore: z.number().nullable(),
    aiAccepted: z.number().int().nullable(),
    planned: z.number().int(),
    scheduledAhead: z.number().int(),
  }),
  balance: z.array(z.object({ capacity: z.enum(CAPACITIES), plan: z.number(), real: z.number() })),
  durations: z.array(
    z.object({ domain: z.enum(TIME_DOMAINS), plan: z.number(), real: z.number() }),
  ),
  heat: z.array(z.object({ pattern: z.enum(MOVEMENT_PATTERNS), weeks: z.array(z.number().int()) })),
  limits: z.array(WeekLimitSchema),
  ai: z.object({
    byKind: z.array(
      z.object({ kind: z.string(), count: z.number().int(), costMicros: z.number().int() }),
    ),
    totalMicros: z.number().int(),
  }),
});
export type PlanHealthResponse = z.infer<typeof PlanHealthResponseSchema>;

// --- El atleta ---

export const MyCycleTestSchema = z.object({
  code: z.string(),
  /** Su marca al empezar el plan y la última, en kilos, segundos o repeticiones. */
  baseline: z.number().nullable(),
  latest: z.number().nullable(),
  low: z.number().nullable(),
  high: z.number().nullable(),
});

export const MyCycleResponseSchema = z.object({
  plan: z
    .object({
      id: z.string(),
      name: z.string(),
      section: Ref,
      startsOn: z.string(),
      endsOn: z.string(),
      weeks: z.number().int(),
      week: z.number().int().nullable(),
      blockKind: z.enum(PLAN_BLOCK_KINDS).nullable(),
      blockLabel: z.string().nullable(),
      blockFocus: z.string().nullable(),
      structure: PlanStructureSchema,
      finished: z.boolean(),
    })
    .nullable(),
  milestones: z.array(
    z.object({
      date: z.string(),
      kind: z.enum(["deload", "block", "retest", "test", "event", "end"]),
      label: z.string(),
    }),
  ),
  tests: z.array(MyCycleTestSchema),
  /** Días por semana a los que se refiere su rango (los suyos, de 2 a 4). */
  frequency: z.number().int(),
  constancy: z.object({
    sessions: z.number().int(),
    weeks: z.array(z.object({ n: z.number().int(), sessions: z.number().int() })),
    perWeek: z.number(),
  }),
  week: z.array(
    z.object({
      date: z.string(),
      role: z.enum(DAY_ROLES).nullable(),
      booked: z.boolean(),
      attended: z.boolean(),
    }),
  ),
  /** Lo que le falta esta semana y la clase que lo cubre. */
  nudge: z
    .object({
      capacity: z.enum(CAPACITIES),
      date: z.string(),
      role: z.enum(DAY_ROLES),
      classId: z.string().nullable(),
      time: z.string().nullable(),
      free: z.number().int().nullable(),
    })
    .nullable(),
  levels: z.array(AthleteLevelSchema),
  athletePreview: z.enum(ATHLETE_PREVIEWS),
});
export type MyCycleResponse = z.infer<typeof MyCycleResponseSchema>;

export const MyLevelUpdateSchema = z.object({
  capacity: z.enum(LEVEL_CAPACITIES),
  /** Nulo: vuelve a la sugerencia. */
  level: z.enum(WORKOUT_LEVELS).nullable(),
});
export const MyLevelsResponseSchema = z.object({ levels: z.array(AthleteLevelSchema) });

export const MyCycleSummaryResponseSchema = z.object({
  plan: z.object({
    id: z.string(),
    name: z.string(),
    startsOn: z.string(),
    endsOn: z.string(),
    weeks: z.number().int(),
    structure: PlanStructureSchema,
  }),
  athlete: z.object({ firstName: z.string(), lastName: z.string() }),
  club: z.string(),
  sessions: z.number().int(),
  prs: z.number().int(),
  tests: z.array(MyCycleTestSchema),
  finished: z.boolean(),
});
export type MyCycleSummaryResponse = z.infer<typeof MyCycleSummaryResponseSchema>;
