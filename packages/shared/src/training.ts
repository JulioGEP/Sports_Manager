import { z } from "zod";
import { DiagramAnimationSchema } from "./drill-animation.ts";
import type { Locale, LocalizedText } from "./locales.ts";
import { DateOnlySchema } from "./structure.ts";
import { TimeOfDaySchema } from "./events.ts";

/**
 * Planificación de entrenamientos, carga, disponibilidad y salud (Fase 1, bloques 21 a 26,
 * ADR 0039, `docs/propuesta-planificacion-entrenamientos.md`).
 *
 * La sesión cuelga del entrenamiento de la agenda. Lo que se entrena son **contenidos** (un
 * catálogo por sección que el deporte propone y el club edita, como las acciones del partido) y
 * cada contenido puede señalar las acciones del partido que lo miden: es el puente que usan las
 * recomendaciones. Las listas de aquí son las restricciones CHECK de la base.
 */

// --- Contenidos ---

export const TRAINING_CONTENT_KINDS = [
  "technical",
  "tactical",
  "physical",
  "set_piece",
  "goalkeeper",
  "psychological",
] as const;
export type TrainingContentKind = (typeof TRAINING_CONTENT_KINDS)[number];
export const TrainingContentKindSchema = z.enum(TRAINING_CONTENT_KINDS);

export const TRAINING_CONTENT_STATUSES = ["active", "archived"] as const;
export type TrainingContentStatus = (typeof TRAINING_CONTENT_STATUSES)[number];

export const TRAINING_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const Code = z.string().regex(TRAINING_CODE_PATTERN);
const ShortName = z.string().trim().min(1).max(80);
const LongText = z.string().trim().max(2000);

export const TrainingContentCreateSchema = z.object({
  code: Code.optional(),
  name: ShortName,
  kind: TrainingContentKindSchema,
  /** Claves de acción del partido que miden este contenido (`goal`, `turnover`…). */
  relatedActionCodes: z.array(Code).max(12).optional(),
});
export type TrainingContentCreate = z.infer<typeof TrainingContentCreateSchema>;

export const TrainingContentUpdateSchema = TrainingContentCreateSchema.omit({ code: true })
  .partial()
  .extend({
    status: z.enum(TRAINING_CONTENT_STATUSES).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  });
export type TrainingContentUpdate = z.infer<typeof TrainingContentUpdateSchema>;

// --- Restricciones y etiquetas de tarea ---

/**
 * Lo que una tarea exige y lo que una restricción prohíbe: el mismo catálogo en los dos lados,
 * así el cruce es directo. Una tarea con `contact` choca con un jugador limitado "sin contacto".
 */
export const RESTRICTION_TAGS = [
  "contact",
  "jumps",
  "shooting",
  "direction_changes",
  "high_intensity",
] as const;
export type RestrictionTag = (typeof RESTRICTION_TAGS)[number];
export const RestrictionTagSchema = z.enum(RESTRICTION_TAGS);

// --- Biblioteca de tareas ---

export const DRILL_SCOPES = ["club", "section", "team", "personal"] as const;
export type DrillScope = (typeof DRILL_SCOPES)[number];
export const DrillScopeSchema = z.enum(DRILL_SCOPES);

export const DRILL_STATUSES = ["active", "archived"] as const;
export type DrillStatus = (typeof DRILL_STATUSES)[number];

/** Piezas de la pizarra: jugadores de los dos equipos, portero, balón, cono y miniportería. */
export const DIAGRAM_PIECE_KINDS = ["own", "rival", "keeper", "ball", "cone", "goal"] as const;
export type DiagramPieceKind = (typeof DIAGRAM_PIECE_KINDS)[number];
/** Tres flechas: pase (continua), conducción (ondulada) y desplazamiento sin balón (discontinua). */
export const DIAGRAM_ARROW_KINDS = ["pass", "dribble", "run"] as const;
export type DiagramArrowKind = (typeof DIAGRAM_ARROW_KINDS)[number];
/** Espacio que pinta la pizarra. */
export const DIAGRAM_FIELDS = ["full", "half", "free"] as const;
export type DiagramField = (typeof DIAGRAM_FIELDS)[number];

const Coord = z.number().min(0).max(100);
/**
 * Pizarra de la tarea: coordenadas en porcentaje de la pista (x a lo largo, y a lo ancho). Las
 * piezas están donde empieza la jugada; si hay `animation`, cada pista mueve una de ellas.
 */
export const DrillDiagramSchema = z
  .object({
    field: z.enum(DIAGRAM_FIELDS),
    pieces: z
      .array(
        z.object({
          kind: z.enum(DIAGRAM_PIECE_KINDS),
          x: Coord,
          y: Coord,
          label: z.string().trim().max(3).optional(),
        }),
      )
      .max(40),
    arrows: z
      .array(
        z.object({ kind: z.enum(DIAGRAM_ARROW_KINDS), x1: Coord, y1: Coord, x2: Coord, y2: Coord }),
      )
      .max(40),
    animation: DiagramAnimationSchema.optional(),
  })
  .refine(
    (d) => !d.animation || d.animation.tracks.every((track) => track.piece < d.pieces.length),
    {
      message: "Cada pista tiene que mover una pieza de la pizarra.",
    },
  );
export type DrillDiagram = z.infer<typeof DrillDiagramSchema>;

const Minutes = z.number().int().min(1).max(240);
/** Escala CR-10 de esfuerzo percibido (Foster): 0 reposo, 10 máximo. */
export const RpeSchema = z.number().int().min(0).max(10);

export const DrillCreateSchema = z.object({
  scope: DrillScopeSchema,
  /** Sección de la tarea (obligatoria con ámbito sección; con ámbito equipo, la del equipo). */
  sectionId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  name: ShortName,
  description: LongText.nullable().optional(),
  rules: LongText.nullable().optional(),
  coachingPoints: LongText.nullable().optional(),
  variants: LongText.nullable().optional(),
  /** Formato de juego: "4x4+2", "3x2". */
  format: z.string().trim().max(30).nullable().optional(),
  space: z.string().trim().max(60).nullable().optional(),
  playersMin: z.number().int().min(1).max(60).nullable().optional(),
  playersMax: z.number().int().min(1).max(60).nullable().optional(),
  durationMin: Minutes.nullable().optional(),
  targetRpe: RpeSchema.nullable().optional(),
  material: z.string().trim().max(400).nullable().optional(),
  diagram: DrillDiagramSchema.nullable().optional(),
  videoUrl: z.string().trim().url().max(400).nullable().optional(),
  restrictionTags: z.array(RestrictionTagSchema).max(RESTRICTION_TAGS.length).optional(),
  /** Contenidos que trabaja; el primero es el principal. */
  contentIds: z.array(z.string().uuid()).max(8).optional(),
});
export type DrillCreate = z.infer<typeof DrillCreateSchema>;

export const DrillUpdateSchema = DrillCreateSchema.omit({ scope: true, sectionId: true })
  .partial()
  .extend({
    scope: DrillScopeSchema.optional(),
    status: z.enum(DRILL_STATUSES).optional(),
  });
export type DrillUpdate = z.infer<typeof DrillUpdateSchema>;

// --- Planificación ---

/** Día respecto al partido: `MD` el día del partido, `MD-3` tres días antes, `MD+1` el siguiente. */
export const MD_LABEL_PATTERN = /^MD([+-][1-6])?$/;
export const MdLabelSchema = z.string().regex(MD_LABEL_PATTERN);

/** Etiqueta MD de un día dados el partido anterior y el siguiente (fechas AAAA-MM-DD). */
export function mdLabelOf(
  date: string,
  previousMatch: string | null,
  nextMatch: string | null,
): string | null {
  const day = Date.parse(`${date}T00:00:00Z`);
  const days = (other: string) => Math.round((Date.parse(`${other}T00:00:00Z`) - day) / 86_400_000);
  const toNext = nextMatch ? days(nextMatch) : null;
  const sincePrevious = previousMatch ? -days(previousMatch) : null;
  if (toNext === 0 || sincePrevious === 0) return "MD";
  // Uno o dos días después de un partido manda la recuperación; si no, la cuenta atrás.
  if (sincePrevious !== null && sincePrevious > 0 && sincePrevious <= 2)
    return toNext !== null && toNext > 0 && toNext <= sincePrevious
      ? `MD-${toNext}`
      : `MD+${sincePrevious}`;
  if (toNext !== null && toNext > 0 && toNext <= 6) return `MD-${toNext}`;
  if (sincePrevious !== null && sincePrevious > 0 && sincePrevious <= 6)
    return `MD+${sincePrevious}`;
  return null;
}

export const TrainingPlanSetSchema = z.object({
  name: ShortName,
  notes: LongText.nullable().optional(),
});
export type TrainingPlanSet = z.infer<typeof TrainingPlanSetSchema>;

const CycleBase = z.object({
  name: ShortName,
  startsOn: DateOnlySchema,
  endsOn: DateOnlySchema,
  focusContentIds: z.array(z.string().uuid()).max(12).optional(),
  /** Carga semanal objetivo del equipo, en unidades arbitrarias (RPE × minutos). */
  targetWeeklyLoad: z.number().int().min(0).max(100_000).nullable().optional(),
  notes: LongText.nullable().optional(),
});
export const TrainingCycleCreateSchema = CycleBase.refine((c) => c.startsOn <= c.endsOn, {
  message: "El ciclo tiene que acabar después de empezar.",
  path: ["endsOn"],
});
export type TrainingCycleCreate = z.infer<typeof TrainingCycleCreateSchema>;
export const TrainingCycleUpdateSchema = CycleBase.partial();
export type TrainingCycleUpdate = z.infer<typeof TrainingCycleUpdateSchema>;

/** Semana tipo: qué sesión toca cada día respecto al partido. */
export const MicrocycleDaySchema = z.object({
  /** Días respecto al partido: -4 … +2. */
  offset: z.number().int().min(-6).max(6),
  objective: z.string().trim().max(160),
  minutes: Minutes,
  targetRpe: RpeSchema,
  /** Hora si hay que crear el entrenamiento en la agenda. */
  startsAt: TimeOfDaySchema.optional(),
});
export type MicrocycleDay = z.infer<typeof MicrocycleDaySchema>;
export const MicrocycleTemplateSetSchema = z.object({
  name: ShortName,
  days: z.array(MicrocycleDaySchema).min(1).max(10),
});
export type MicrocycleTemplateSet = z.infer<typeof MicrocycleTemplateSetSchema>;

// --- Sesión ---

export const SESSION_STATUSES = ["draft", "planned", "done", "cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SessionStatusSchema = z.enum(SESSION_STATUSES);

/** Bloques de una sesión, en orden. Cada uno tiene responsable según el papel en el equipo. */
export const SESSION_BLOCKS = ["warmup", "main", "goalkeepers", "rehab", "cooldown"] as const;
export type SessionBlock = (typeof SESSION_BLOCKS)[number];
export const SessionBlockSchema = z.enum(SESSION_BLOCKS);

/** Valoración de una sesión o de una tarea: no funcionó, regular, funcionó. */
export const SessionRatingSchema = z.number().int().min(1).max(3);

export const SessionCreateSchema = z
  .object({
    /** Entrenamiento de la agenda; si no viene, se crea uno con fecha y hora. */
    eventId: z.string().uuid().optional(),
    date: DateOnlySchema.optional(),
    startsAt: TimeOfDaySchema.optional(),
    minutes: Minutes.optional(),
    facilityId: z.string().uuid().nullable().optional(),
    objective: z.string().trim().max(160).nullable().optional(),
  })
  .refine((s) => Boolean(s.eventId) || Boolean(s.date && s.startsAt), {
    message: "Indica el entrenamiento de la agenda o la fecha y la hora.",
    path: ["eventId"],
  });
export type SessionCreate = z.infer<typeof SessionCreateSchema>;

export const SessionUpdateSchema = z.object({
  objective: z.string().trim().max(160).nullable().optional(),
  mdLabel: MdLabelSchema.nullable().optional(),
  status: SessionStatusSchema.optional(),
  targetRpe: RpeSchema.nullable().optional(),
  cycleId: z.string().uuid().nullable().optional(),
  contentIds: z.array(z.string().uuid()).max(12).optional(),
  notes: LongText.nullable().optional(),
});
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>;

export const SessionItemInputSchema = z.object({
  /** Tarea existente que se conserva (si no, es nueva). */
  id: z.string().uuid().optional(),
  drillId: z.string().uuid().nullable().optional(),
  /** Título si es una tarea libre; con tarea de la biblioteca, por defecto su nombre. */
  title: ShortName.optional(),
  minutes: Minutes,
  sets: z.number().int().min(1).max(50).nullable().optional(),
  reps: z.number().int().min(1).max(200).nullable().optional(),
  restSec: z.number().int().min(0).max(1800).nullable().optional(),
  targetRpe: RpeSchema.nullable().optional(),
  /** Grupo ("Grupo A", "Porteros"); los jugadores, si no son todos. */
  groupLabel: z.string().trim().max(40).nullable().optional(),
  playerIds: z.array(z.string().uuid()).max(40).nullable().optional(),
  /** Contenidos (por defecto, los de la tarea). */
  contentIds: z.array(z.string().uuid()).max(8).optional(),
  notes: z.string().trim().max(400).nullable().optional(),
});
export type SessionItemInput = z.infer<typeof SessionItemInputSchema>;
export const SessionBlockSetSchema = z.object({ items: z.array(SessionItemInputSchema).max(20) });
export type SessionBlockSet = z.infer<typeof SessionBlockSetSchema>;

export const PARTICIPATIONS = ["full", "partial", "rehab"] as const;
export type Participation = (typeof PARTICIPATIONS)[number];
export const ParticipationSchema = z.enum(PARTICIPATIONS);

/** Cierre de la sesión: asistencia, participación y RPE de cada uno, duración real y valoración. */
export const SessionCloseSchema = z.object({
  actualMinutes: Minutes.optional(),
  rating: SessionRatingSchema.nullable().optional(),
  notes: LongText.nullable().optional(),
  /** RPE para todos cuando no se pasa uno por jugador (formativas). */
  groupRpe: RpeSchema.nullable().optional(),
  players: z
    .array(
      z.object({
        playerId: z.string().uuid(),
        status: z.enum(["present", "absent", "excused"]),
        participation: ParticipationSchema.optional(),
        rpe: RpeSchema.nullable().optional(),
        minutes: Minutes.nullable().optional(),
      }),
    )
    .max(60),
  itemRatings: z
    .array(z.object({ itemId: z.string().uuid(), rating: SessionRatingSchema }))
    .max(40)
    .optional(),
});
export type SessionClose = z.infer<typeof SessionCloseSchema>;

export const SessionCopySchema = z.object({
  /** Entrenamiento de destino: su sesión se crea o se sustituye. */
  eventId: z.string().uuid(),
});
export type SessionCopy = z.infer<typeof SessionCopySchema>;

export const WeekCopySchema = z.object({ from: DateOnlySchema, to: DateOnlySchema });
export type WeekCopy = z.infer<typeof WeekCopySchema>;
export const WeekTemplateApplySchema = z.object({
  templateId: z.string().uuid(),
  /** Un día de la semana a la que se aplica. */
  date: DateOnlySchema,
});
export type WeekTemplateApply = z.infer<typeof WeekTemplateApplySchema>;

// --- Carga ---

export const LOAD_SOURCES = ["session", "match", "extra"] as const;
export type LoadSource = (typeof LOAD_SOURCES)[number];

/** Carga extra (gimnasio, trabajo individual): fecha, minutos y RPE. */
export const ExtraLoadCreateSchema = z.object({
  date: DateOnlySchema,
  minutes: Minutes,
  rpe: RpeSchema,
  note: z.string().trim().max(200).nullable().optional(),
});
export type ExtraLoadCreate = z.infer<typeof ExtraLoadCreateSchema>;

/** RPE del partido: para el equipo y, si se quiere, por jugador. Los minutos salen de los eventos. */
export const MatchLoadSetSchema = z.object({
  rpe: RpeSchema.nullable(),
  players: z
    .array(z.object({ playerId: z.string().uuid(), rpe: RpeSchema.nullable() }))
    .max(30)
    .optional(),
});
export type MatchLoadSet = z.infer<typeof MatchLoadSetSchema>;

// --- Bienestar ---

/**
 * Cinco preguntas de 1 a 5 (McLean): sueño, fatiga, dolor muscular, estrés y ánimo. En las cinco,
 * 5 es lo mejor (descansado, fresco, sin molestias, tranquilo, de buen humor). Suma de 5 a 25.
 */
export const WELLNESS_ITEMS = ["sleep", "fatigue", "soreness", "stress", "mood"] as const;
export type WellnessItem = (typeof WELLNESS_ITEMS)[number];
const Scale = z.number().int().min(1).max(5);
export const WellnessEntrySchema = z.object({
  date: DateOnlySchema,
  sleep: Scale,
  fatigue: Scale,
  soreness: Scale,
  stress: Scale,
  mood: Scale,
  sorenessArea: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});
export type WellnessEntry = z.infer<typeof WellnessEntrySchema>;

export function wellnessScore(entry: Pick<WellnessEntry, WellnessItem>): number {
  return entry.sleep + entry.fatigue + entry.soreness + entry.stress + entry.mood;
}

// --- Disponibilidad ---

/**
 * Disponible, limitado (con restricciones), en readaptación o de baja. "Disponible" es la
 * ausencia de un periodo abierto: no se guarda.
 */
export const AVAILABILITY_STATUSES = ["available", "limited", "rehab", "out"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];
export const AvailabilityStatusSchema = z.enum(AVAILABILITY_STATUSES);
export const STORED_AVAILABILITY_STATUSES = ["limited", "rehab", "out"] as const;

export const AvailabilitySetSchema = z.object({
  status: AvailabilityStatusSchema,
  restrictions: z.array(RestrictionTagSchema).max(RESTRICTION_TAGS.length).optional(),
  maxMinutes: z.number().int().min(1).max(240).nullable().optional(),
  /** Desde cuándo; por defecto, hoy. */
  fromOn: DateOnlySchema.optional(),
  expectedReturnOn: DateOnlySchema.nullable().optional(),
  /** Nota operativa para el cuerpo técnico. Nunca un diagnóstico. */
  note: z.string().trim().max(160).nullable().optional(),
  injuryId: z.string().uuid().nullable().optional(),
});
export type AvailabilitySet = z.infer<typeof AvailabilitySetSchema>;

// --- Salud (área restringida) ---

export const INJURY_CONTEXTS = ["training", "match", "other"] as const;
export type InjuryContext = (typeof INJURY_CONTEXTS)[number];
export const INJURY_MECHANISMS = ["contact", "non_contact"] as const;
export type InjuryMechanism = (typeof INJURY_MECHANISMS)[number];
export const BODY_AREAS = [
  "head",
  "neck",
  "shoulder",
  "arm",
  "wrist_hand",
  "chest",
  "back",
  "hip_groin",
  "thigh_front",
  "thigh_back",
  "knee",
  "calf",
  "ankle",
  "foot",
  "other",
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];
export const BODY_SIDES = ["left", "right", "both", "none"] as const;
export type BodySide = (typeof BODY_SIDES)[number];
export const INJURY_KINDS = [
  "muscle",
  "ligament",
  "tendon",
  "bone",
  "joint",
  "contusion",
  "concussion",
  "illness",
  "other",
] as const;
export type InjuryKind = (typeof INJURY_KINDS)[number];
export const INJURY_STATUSES = ["active", "rehab", "recovered"] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

/** Gravedad por días de baja (consenso de la UEFA): mínima, leve, moderada, grave. */
export const INJURY_SEVERITIES = ["minimal", "mild", "moderate", "severe"] as const;
export type InjurySeverity = (typeof INJURY_SEVERITIES)[number];
export function injurySeverity(daysOut: number): InjurySeverity {
  if (daysOut <= 3) return "minimal";
  if (daysOut <= 7) return "mild";
  if (daysOut <= 28) return "moderate";
  return "severe";
}

const InjuryBase = z.object({
  occurredOn: DateOnlySchema,
  context: z.enum(INJURY_CONTEXTS),
  eventId: z.string().uuid().nullable().optional(),
  matchId: z.string().uuid().nullable().optional(),
  bodyArea: z.enum(BODY_AREAS),
  side: z.enum(BODY_SIDES),
  kind: z.enum(INJURY_KINDS),
  mechanism: z.enum(INJURY_MECHANISMS),
  recurrence: z.boolean().optional(),
  diagnosis: z.string().trim().max(400).nullable().optional(),
  clinicalNotes: z.string().trim().max(2000).nullable().optional(),
  expectedReturnOn: DateOnlySchema.nullable().optional(),
});
export const InjuryCreateSchema = InjuryBase;
export type InjuryCreate = z.infer<typeof InjuryCreateSchema>;
export const InjuryUpdateSchema = InjuryBase.partial().extend({
  status: z.enum(INJURY_STATUSES).optional(),
  returnedOn: DateOnlySchema.nullable().optional(),
});
export type InjuryUpdate = z.infer<typeof InjuryUpdateSchema>;

export const RehabPhasesSetSchema = z.object({
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        criteria: z.string().trim().max(400).nullable().optional(),
        startedOn: DateOnlySchema.nullable().optional(),
        doneOn: DateOnlySchema.nullable().optional(),
      }),
    )
    .max(12),
});
export type RehabPhasesSet = z.infer<typeof RehabPhasesSetSchema>;

export const CONSENT_RELATIONSHIPS = ["self", "guardian"] as const;
export type ConsentRelationship = (typeof CONSENT_RELATIONSHIPS)[number];
/** Versión vigente del texto de consentimiento de datos de salud. */
export const HEALTH_CONSENT_TEXT_VERSION = "2026-10";
export const HealthConsentSetSchema = z.object({
  grantedByName: z.string().trim().min(1).max(120),
  relationship: z.enum(CONSENT_RELATIONSHIPS),
  grantedOn: DateOnlySchema,
  textVersion: z.string().trim().min(1).max(20).optional(),
});
export type HealthConsentSet = z.infer<typeof HealthConsentSetSchema>;

// --- Tests físicos ---

export const PHYSICAL_TEST_UNITS = ["s", "cm", "m", "km_h", "level", "count"] as const;
export type PhysicalTestUnit = (typeof PHYSICAL_TEST_UNITS)[number];
export const PHYSICAL_TEST_DIRECTIONS = ["higher_better", "lower_better"] as const;
export type PhysicalTestDirection = (typeof PHYSICAL_TEST_DIRECTIONS)[number];
export const PhysicalTestCreateSchema = z.object({
  code: Code.optional(),
  name: ShortName,
  unit: z.enum(PHYSICAL_TEST_UNITS),
  direction: z.enum(PHYSICAL_TEST_DIRECTIONS),
});
export type PhysicalTestCreate = z.infer<typeof PhysicalTestCreateSchema>;
export const PhysicalTestUpdateSchema = PhysicalTestCreateSchema.omit({ code: true })
  .partial()
  .extend({ status: z.enum(["active", "archived"]).optional() });
export type PhysicalTestUpdate = z.infer<typeof PhysicalTestUpdateSchema>;
export const PhysicalTestResultsSetSchema = z.object({
  testId: z.string().uuid(),
  date: DateOnlySchema,
  results: z
    .array(
      z.object({
        playerId: z.string().uuid(),
        value: z.number().min(0).max(100_000),
        note: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .min(1)
    .max(60),
});
export type PhysicalTestResultsSet = z.infer<typeof PhysicalTestResultsSetSchema>;

// --- Ajustes de entrenamiento de la sección ---

/** Básico: objetivo, tareas y asistencia. Completo: además RPE individual, bienestar y tests. */
export const TRAINING_TRACKING_LEVELS = ["basic", "full"] as const;
export type TrainingTrackingLevel = (typeof TRAINING_TRACKING_LEVELS)[number];

/** Umbrales de las recomendaciones: el deporte propone, la sección cambia lo que quiera. */
export const InsightThresholdsSchema = z.object({
  /** Puntos de acierto en el tiro por debajo de la media de la temporada. */
  finishingDropPoints: z.number().min(1).max(50),
  /** Pérdidas por partido frente a la media (1,3 = un 30 % más). */
  turnoverRatio: z.number().min(1).max(3),
  /** Minuto de la parte antes del cual llegar al tope de faltas es pronto. */
  earlyFoulMinute: z.number().int().min(1).max(60),
  /** Proporción de goles encajados en los últimos minutos de cada parte. */
  lateGoalsShare: z.number().min(0.1).max(1),
  lateMinutes: z.number().int().min(1).max(15),
  /** Minutos de partido para recuperación y compensatorio. */
  recoveryMinutes: z.number().int().min(1).max(90),
  compensatoryMinutes: z.number().int().min(0).max(90),
  /** Relación de carga semanal planificada frente a las cuatro anteriores. */
  weeklyLoadHigh: z.number().min(1).max(3),
  weeklyLoadLow: z.number().min(0).max(1),
  /** Relación aguda:crónica: fuera de este rango, aviso. Nunca predice lesiones. */
  acwrHigh: z.number().min(1).max(3),
  acwrLow: z.number().min(0).max(1),
  /** Asistencia mínima en cuatro semanas (porcentaje). */
  attendanceMin: z.number().int().min(0).max(100),
  /** Minutos de trabajo del objetivo en tres semanas por debajo de los cuales se avisa. */
  focusMinutes: z.number().int().min(0).max(600),
});
export type InsightThresholds = z.infer<typeof InsightThresholdsSchema>;

export const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  finishingDropPoints: 8,
  turnoverRatio: 1.3,
  earlyFoulMinute: 15,
  lateGoalsShare: 0.4,
  lateMinutes: 5,
  recoveryMinutes: 25,
  compensatoryMinutes: 15,
  weeklyLoadHigh: 1.3,
  weeklyLoadLow: 0.8,
  acwrHigh: 1.5,
  acwrLow: 0.8,
  attendanceMin: 70,
  focusMinutes: 20,
};

/**
 * Reparto objetivo de minutos por tipo de contenido, en porcentaje, para una categoría. Parcial:
 * los tipos que no aparecen no tienen objetivo.
 */
export const MethodologyTargetSchema = z.partialRecord(
  TrainingContentKindSchema,
  z.number().int().min(0).max(100),
);
export type MethodologyTarget = z.infer<typeof MethodologyTargetSchema>;

export const TrainingSettingsSchema = z.object({
  tracking: z.enum(TRAINING_TRACKING_LEVELS),
  /** Formativa: se vigila el reparto de minutos de partido. Nulo: se deduce de la edad. */
  formative: z.boolean().nullable(),
  thresholds: InsightThresholdsSchema,
  /** Por categoría (id): reparto objetivo de contenidos. */
  methodology: z.record(z.string(), MethodologyTargetSchema),
});
export type TrainingSettings = z.infer<typeof TrainingSettingsSchema>;

export const TrainingSettingsPatchSchema = z.object({
  tracking: z.enum(TRAINING_TRACKING_LEVELS).optional(),
  formative: z.boolean().nullable().optional(),
  thresholds: InsightThresholdsSchema.partial().optional(),
  methodology: z.record(z.string(), MethodologyTargetSchema).optional(),
});
export type TrainingSettingsPatch = z.infer<typeof TrainingSettingsPatchSchema>;

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  tracking: "basic",
  formative: null,
  thresholds: DEFAULT_INSIGHT_THRESHOLDS,
  methodology: {},
};

/** Ajustes efectivos: los de por defecto con lo que la sección haya cambiado encima. */
export function resolveTrainingSettings(
  patch: TrainingSettingsPatch | null | undefined,
): TrainingSettings {
  const p = patch ?? {};
  return {
    tracking: p.tracking ?? DEFAULT_TRAINING_SETTINGS.tracking,
    formative: p.formative === undefined ? DEFAULT_TRAINING_SETTINGS.formative : p.formative,
    thresholds: {
      ...DEFAULT_INSIGHT_THRESHOLDS,
      ...(stripUndefined(p.thresholds ?? {}) as Partial<InsightThresholds>),
    },
    methodology: p.methodology ?? {},
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Clave a partir del nombre: "Salida de presión" → `salida_de_presion`. */
export function trainingCodeFromName(name: string): string {
  const code = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(code) && code.length >= 2 ? code : `c_${code}`.slice(0, 40);
}

// --- Catálogos por deporte ---

export interface TrainingContentSeed {
  code: string;
  name: LocalizedText;
  kind: TrainingContentKind;
  relatedActionCodes?: string[];
}

const t = (es: string, ca: string, en: string): LocalizedText => ({ es, ca, en });

/** Contenidos de los deportes de portería (fútbol sala, fútbol, balonmano). */
const GOAL_SPORT_CONTENTS: TrainingContentSeed[] = [
  {
    code: "finishing",
    name: t("Finalización", "Finalització", "Finishing"),
    kind: "technical",
    relatedActionCodes: ["goal", "shot_on_target", "shot_off_target"],
  },
  {
    code: "passing",
    name: t("Pase y control", "Passada i control", "Passing and control"),
    kind: "technical",
    relatedActionCodes: ["key_pass", "assist", "turnover"],
  },
  {
    code: "one_v_one_attack",
    name: t("1x1 ofensivo", "1x1 ofensiu", "1v1 attacking"),
    kind: "technical",
    relatedActionCodes: ["foul_received", "turnover"],
  },
  {
    code: "build_up",
    name: t("Salida de presión", "Sortida de pressió", "Playing out under pressure"),
    kind: "tactical",
    relatedActionCodes: ["turnover"],
  },
  {
    code: "positional_attack",
    name: t("Ataque posicional", "Atac posicional", "Positional attack"),
    kind: "tactical",
    relatedActionCodes: ["key_pass", "shot_on_target", "assist"],
  },
  {
    code: "pressing",
    name: t("Presión y recuperación", "Pressió i recuperació", "Pressing and ball recovery"),
    kind: "tactical",
    relatedActionCodes: ["steal", "opp_shot_on_target"],
  },
  {
    code: "transitions",
    name: t("Transiciones", "Transicions", "Transitions"),
    kind: "tactical",
    relatedActionCodes: ["steal", "turnover", "opp_goal"],
  },
  {
    code: "defending_without_fouls",
    name: t(
      "Defensa sin falta y 1x1 defensivo",
      "Defensa sense falta i 1x1 defensiu",
      "Defending without fouling",
    ),
    kind: "tactical",
    relatedActionCodes: ["foul", "yellow_card"],
  },
  {
    code: "set_piece_attack",
    name: t("ABP ofensiva", "ABP ofensiva", "Attacking set pieces"),
    kind: "set_piece",
    relatedActionCodes: ["corner"],
  },
  {
    code: "set_piece_defence",
    name: t("ABP defensiva", "ABP defensiva", "Defending set pieces"),
    kind: "set_piece",
    relatedActionCodes: ["opp_goal"],
  },
  {
    code: "power_play",
    name: t("Portero-jugador (5x4)", "Porter-jugador (5x4)", "Power play (5v4)"),
    kind: "tactical",
  },
  {
    code: "goalkeeping",
    name: t("Juego del portero", "Joc del porter", "Goalkeeping"),
    kind: "goalkeeper",
    relatedActionCodes: ["save", "opp_shot_on_target"],
  },
  {
    code: "intermittent_endurance",
    name: t("Resistencia intermitente", "Resistència intermitent", "Intermittent endurance"),
    kind: "physical",
  },
  {
    code: "repeated_sprint",
    name: t("Velocidad repetida", "Velocitat repetida", "Repeated sprint ability"),
    kind: "physical",
  },
  { code: "strength", name: t("Fuerza", "Força", "Strength"), kind: "physical" },
  {
    code: "injury_prevention",
    name: t("Prevención", "Prevenció", "Injury prevention"),
    kind: "physical",
  },
  {
    code: "concentration",
    name: t("Concentración y gestión", "Concentració i gestió", "Focus and game management"),
    kind: "psychological",
  },
];

const BASKETBALL_CONTENTS: TrainingContentSeed[] = [
  {
    code: "shooting",
    name: t("Tiro", "Tir", "Shooting"),
    kind: "technical",
    relatedActionCodes: ["two_points", "three_points", "free_throw", "missed_shot"],
  },
  {
    code: "ball_handling",
    name: t("Manejo de balón", "Maneig de pilota", "Ball handling"),
    kind: "technical",
    relatedActionCodes: ["turnover"],
  },
  {
    code: "rebounding",
    name: t("Rebote", "Rebot", "Rebounding"),
    kind: "technical",
    relatedActionCodes: ["rebound"],
  },
  {
    code: "team_defence",
    name: t("Defensa en equipo", "Defensa en equip", "Team defence"),
    kind: "tactical",
    relatedActionCodes: ["steal", "foul"],
  },
  {
    code: "transitions",
    name: t("Transiciones", "Transicions", "Transitions"),
    kind: "tactical",
    relatedActionCodes: ["steal", "turnover"],
  },
  {
    code: "intermittent_endurance",
    name: t("Resistencia intermitente", "Resistència intermitent", "Intermittent endurance"),
    kind: "physical",
  },
  {
    code: "injury_prevention",
    name: t("Prevención", "Prevenció", "Injury prevention"),
    kind: "physical",
  },
];

const GENERIC_CONTENTS: TrainingContentSeed[] = [
  { code: "technique", name: t("Técnica", "Tècnica", "Technique"), kind: "technical" },
  { code: "tactics", name: t("Táctica", "Tàctica", "Tactics"), kind: "tactical" },
  {
    code: "endurance",
    name: t("Resistencia", "Resistència", "Endurance"),
    kind: "physical",
  },
  { code: "strength", name: t("Fuerza", "Força", "Strength"), kind: "physical" },
  {
    code: "injury_prevention",
    name: t("Prevención", "Prevenció", "Injury prevention"),
    kind: "physical",
  },
];

export const DEFAULT_TRAINING_CONTENTS: Record<string, readonly TrainingContentSeed[]> = {
  futsal: GOAL_SPORT_CONTENTS,
  football: GOAL_SPORT_CONTENTS,
  handball: GOAL_SPORT_CONTENTS,
  basketball: BASKETBALL_CONTENTS,
};

export function defaultTrainingContents(
  sportCode: string,
  locale: Locale,
): (TrainingContentCreate & { code: string })[] {
  const seeds = DEFAULT_TRAINING_CONTENTS[sportCode] ?? GENERIC_CONTENTS;
  return seeds.map((seed) => ({
    code: seed.code,
    name: seed.name[locale],
    kind: seed.kind,
    relatedActionCodes: seed.relatedActionCodes ?? [],
  }));
}

/**
 * Biblioteca de arranque de fútbol sala: una docena de tareas para que la sección no empiece
 * vacía. La definitiva la escribe un entrenador del club piloto (decisión 6 de la propuesta).
 */
export interface DrillSeed {
  name: LocalizedText;
  description: LocalizedText;
  coachingPoints?: LocalizedText;
  format?: string;
  space: LocalizedText;
  playersMin?: number;
  playersMax?: number;
  durationMin: number;
  targetRpe: number;
  restrictionTags: RestrictionTag[];
  /** Códigos de contenido; el primero es el principal. */
  contents: string[];
  diagram?: DrillDiagram;
}

const halfCourt = (pieces: DrillDiagram["pieces"], arrows: DrillDiagram["arrows"] = []) =>
  ({ field: "half", pieces, arrows }) satisfies DrillDiagram;
const fullCourt = (pieces: DrillDiagram["pieces"], arrows: DrillDiagram["arrows"] = []) =>
  ({ field: "full", pieces, arrows }) satisfies DrillDiagram;

const FUTSAL_DRILLS: DrillSeed[] = [
  {
    name: t(
      "Activación con balón por parejas",
      "Activació amb pilota per parelles",
      "Paired ball activation",
    ),
    description: t(
      "Pases y conducciones por parejas con movilidad articular y cambios de ritmo progresivos.",
      "Passades i conduccions per parelles amb mobilitat articular i canvis de ritme progressius.",
      "Passing and dribbling in pairs with joint mobility and progressive changes of pace.",
    ),
    space: t("Media pista", "Mitja pista", "Half court"),
    playersMin: 2,
    durationMin: 12,
    targetRpe: 3,
    restrictionTags: [],
    contents: ["passing", "injury_prevention"],
    diagram: halfCourt(
      [
        { kind: "own", x: 30, y: 30 },
        { kind: "own", x: 60, y: 30 },
        { kind: "own", x: 30, y: 70 },
        { kind: "own", x: 60, y: 70 },
        { kind: "ball", x: 33, y: 30 },
      ],
      [
        { kind: "pass", x1: 32, y1: 30, x2: 58, y2: 30 },
        { kind: "dribble", x1: 32, y1: 70, x2: 58, y2: 70 },
      ],
    ),
  },
  {
    name: t("Rondo 4x4+2 comodines", "Rondo 4x4+2 comodins", "4v4+2 rondo"),
    description: t(
      "Mantener la posesión con dos comodines exteriores. Punto tras 8 pases seguidos.",
      "Mantenir la possessió amb dos comodins exteriors. Punt després de 8 passades seguides.",
      "Keep possession with two outside jokers. A point after 8 consecutive passes.",
    ),
    coachingPoints: t(
      "Perfilarse antes de recibir. Apoyos a los dos lados del poseedor.",
      "Perfilar-se abans de rebre. Suports als dos costats del posseïdor.",
      "Open your body before receiving. Support on both sides of the ball carrier.",
    ),
    format: "4x4+2",
    space: t("20 x 20 m", "20 x 20 m", "20 x 20 m"),
    playersMin: 10,
    durationMin: 15,
    targetRpe: 6,
    restrictionTags: ["contact", "direction_changes"],
    contents: ["passing", "pressing"],
    diagram: halfCourt([
      { kind: "own", x: 25, y: 25 },
      { kind: "own", x: 25, y: 75 },
      { kind: "own", x: 70, y: 25 },
      { kind: "own", x: 70, y: 75 },
      { kind: "rival", x: 40, y: 40 },
      { kind: "rival", x: 55, y: 40 },
      { kind: "rival", x: 40, y: 60 },
      { kind: "rival", x: 55, y: 60 },
      { kind: "cone", x: 10, y: 50, label: "C" },
      { kind: "cone", x: 88, y: 50, label: "C" },
      { kind: "ball", x: 28, y: 25 },
    ]),
  },
  {
    name: t(
      "Finalización tras pared",
      "Finalització després de paret",
      "Finishing after a one-two",
    ),
    description: t(
      "Pared con el pívot y tiro a la primera desde zona central. Alternar pierna.",
      "Paret amb el pivot i xut a la primera des de la zona central. Alternar cama.",
      "One-two with the pivot and first-time shot from the centre. Alternate feet.",
    ),
    coachingPoints: t(
      "Tiro raso y cruzado. Atacar el rechace.",
      "Xut arran i creuat. Atacar el rebuig.",
      "Low, across the keeper. Follow up the rebound.",
    ),
    space: t("Media pista con portería", "Mitja pista amb porteria", "Half court with goal"),
    playersMin: 4,
    durationMin: 15,
    targetRpe: 5,
    restrictionTags: ["shooting"],
    contents: ["finishing", "passing"],
    diagram: halfCourt(
      [
        { kind: "goal", x: 96, y: 50 },
        { kind: "keeper", x: 90, y: 50 },
        { kind: "own", x: 40, y: 50, label: "A" },
        { kind: "own", x: 72, y: 45, label: "P" },
        { kind: "ball", x: 43, y: 50 },
      ],
      [
        { kind: "pass", x1: 42, y1: 50, x2: 70, y2: 45 },
        { kind: "run", x1: 42, y1: 52, x2: 66, y2: 58 },
        { kind: "pass", x1: 70, y1: 47, x2: 66, y2: 56 },
      ],
    ),
  },
  {
    name: t("Finalización por zonas", "Finalització per zones", "Zone finishing"),
    description: t(
      "Series de tiro desde las nueve zonas del mapa del partido, con oposición pasiva.",
      "Sèries de xut des de les nou zones del mapa del partit, amb oposició passiva.",
      "Shooting sets from the nine match-map zones, with passive opposition.",
    ),
    space: t("Media pista con portería", "Mitja pista amb porteria", "Half court with goal"),
    playersMin: 3,
    durationMin: 12,
    targetRpe: 5,
    restrictionTags: ["shooting"],
    contents: ["finishing"],
  },
  {
    name: t("Salida de presión 4x3", "Sortida de pressió 4x3", "4v3 playing out"),
    description: t(
      "Portero y tres jugadores salen contra tres presionantes. Punto si se supera la línea media conduciendo.",
      "Porter i tres jugadors surten contra tres pressionants. Punt si se supera la línia mitjana conduint.",
      "Keeper and three players build out against three pressers. Point for dribbling over the halfway line.",
    ),
    coachingPoints: t(
      "Ocupar alturas distintas. Fijar antes de pasar.",
      "Ocupar alçades diferents. Fixar abans de passar.",
      "Stagger heights. Commit a defender before passing.",
    ),
    format: "4x3",
    space: t("Media pista", "Mitja pista", "Half court"),
    playersMin: 7,
    durationMin: 15,
    targetRpe: 7,
    restrictionTags: ["contact", "direction_changes"],
    contents: ["build_up", "goalkeeping"],
    diagram: halfCourt([
      { kind: "goal", x: 4, y: 50 },
      { kind: "keeper", x: 8, y: 50 },
      { kind: "own", x: 25, y: 20 },
      { kind: "own", x: 25, y: 80 },
      { kind: "own", x: 45, y: 50 },
      { kind: "rival", x: 35, y: 30 },
      { kind: "rival", x: 35, y: 70 },
      { kind: "rival", x: 55, y: 50 },
    ]),
  },
  {
    name: t("Presión tras pérdida 5x5", "Pressió després de pèrdua 5x5", "5v5 counter-pressing"),
    description: t(
      "Partido condicionado: tras perder el balón, cinco segundos para recuperarlo o doble punto rival.",
      "Partit condicionat: després de perdre la pilota, cinc segons per recuperar-la o doble punt rival.",
      "Conditioned game: after losing the ball, five seconds to win it back or the rival scores double.",
    ),
    format: "5x5",
    space: t("Pista entera", "Pista sencera", "Full court"),
    playersMin: 10,
    durationMin: 20,
    targetRpe: 8,
    restrictionTags: ["contact", "direction_changes", "high_intensity"],
    contents: ["pressing", "transitions"],
  },
  {
    name: t(
      "Defensa sin falta 1x1 en carril",
      "Defensa sense falta 1x1 en carril",
      "1v1 lane defending without fouling",
    ),
    description: t(
      "Duelo 1x1 en un carril de 5 m. Una falta resta dos puntos: se defiende con el cuerpo y los apoyos, nunca con las manos.",
      "Duel 1x1 en un carril de 5 m. Una falta resta dos punts: es defensa amb el cos i els suports, mai amb les mans.",
      "1v1 duel in a 5 m lane. A foul costs two points: defend with body position and footwork, never with hands.",
    ),
    format: "1x1",
    space: t("Carril de 5 x 15 m", "Carril de 5 x 15 m", "5 x 15 m lane"),
    playersMin: 2,
    durationMin: 12,
    targetRpe: 7,
    restrictionTags: ["contact", "direction_changes"],
    contents: ["defending_without_fouls"],
  },
  {
    name: t(
      "Córner ensayado: bloqueo y segundo palo",
      "Còrner assajat: bloqueig i segon pal",
      "Corner routine: screen and back post",
    ),
    description: t(
      "Saque de esquina con bloqueo al defensor del primer palo y llegada al segundo. Tres variantes con señal.",
      "Servei de córner amb bloqueig al defensor del primer pal i arribada al segon. Tres variants amb senyal.",
      "Corner with a screen on the near-post defender and a run to the back post. Three signalled variations.",
    ),
    space: t("Media pista con portería", "Mitja pista amb porteria", "Half court with goal"),
    playersMin: 5,
    durationMin: 10,
    targetRpe: 4,
    restrictionTags: ["shooting"],
    contents: ["set_piece_attack", "finishing"],
    diagram: halfCourt(
      [
        { kind: "goal", x: 96, y: 50 },
        { kind: "keeper", x: 91, y: 50 },
        { kind: "own", x: 98, y: 4, label: "S" },
        { kind: "own", x: 78, y: 40, label: "B" },
        { kind: "own", x: 70, y: 62 },
        { kind: "rival", x: 84, y: 38 },
        { kind: "rival", x: 80, y: 62 },
        { kind: "ball", x: 97, y: 6 },
      ],
      [
        { kind: "run", x1: 78, y1: 42, x2: 83, y2: 40 },
        { kind: "run", x1: 70, y1: 64, x2: 86, y2: 72 },
        { kind: "pass", x1: 96, y1: 7, x2: 86, y2: 70 },
      ],
    ),
  },
  {
    name: t(
      "Defensa de ABP en zona mixta",
      "Defensa d'ABP en zona mixta",
      "Mixed-zone set piece defence",
    ),
    description: t(
      "Defender córners y faltas laterales con dos en zona y dos al hombre. Rotar quién saca.",
      "Defensar còrners i faltes laterals amb dos en zona i dos a l'home. Rotar qui serveix.",
      "Defend corners and wide free kicks with two zonal and two man-marking. Rotate the taker.",
    ),
    space: t("Media pista con portería", "Mitja pista amb porteria", "Half court with goal"),
    playersMin: 8,
    durationMin: 10,
    targetRpe: 4,
    restrictionTags: ["contact", "jumps"],
    contents: ["set_piece_defence"],
  },
  {
    name: t("Portero-jugador 5x4", "Porter-jugador 5x4", "5v4 power play"),
    description: t(
      "Ataque con portero-jugador contra defensa en rombo. El equipo defensor puntúa si roba y tira a puerta vacía.",
      "Atac amb porter-jugador contra defensa en rombe. L'equip defensor puntua si roba i xuta a porteria buida.",
      "Power play against a diamond defence. Defenders score by winning the ball and shooting at the empty goal.",
    ),
    format: "5x4",
    space: t("Pista entera", "Pista sencera", "Full court"),
    playersMin: 9,
    durationMin: 15,
    targetRpe: 6,
    restrictionTags: ["shooting"],
    contents: ["power_play", "positional_attack"],
    diagram: fullCourt([
      { kind: "goal", x: 98, y: 50 },
      { kind: "keeper", x: 94, y: 50 },
      { kind: "own", x: 55, y: 25 },
      { kind: "own", x: 55, y: 75 },
      { kind: "own", x: 70, y: 10 },
      { kind: "own", x: 70, y: 90 },
      { kind: "own", x: 80, y: 50 },
      { kind: "rival", x: 66, y: 50 },
      { kind: "rival", x: 76, y: 30 },
      { kind: "rival", x: 76, y: 70 },
      { kind: "rival", x: 86, y: 50 },
    ]),
  },
  {
    name: t(
      "Intermitente 15-15 con balón",
      "Intermitent 15-15 amb pilota",
      "15-15 intermittent with ball",
    ),
    description: t(
      "Series de 15 s a alta intensidad conduciendo y 15 s de recuperación activa. 2 series de 6 minutos.",
      "Sèries de 15 s a alta intensitat conduint i 15 s de recuperació activa. 2 sèries de 6 minuts.",
      "15 s high-intensity dribbling and 15 s active recovery. 2 sets of 6 minutes.",
    ),
    space: t("Pista entera", "Pista sencera", "Full court"),
    playersMin: 1,
    durationMin: 15,
    targetRpe: 8,
    restrictionTags: ["high_intensity", "direction_changes"],
    contents: ["intermittent_endurance"],
  },
  {
    name: t("Velocidad repetida en 20 m", "Velocitat repetida en 20 m", "Repeated 20 m sprints"),
    description: t(
      "6 sprints de 20 m con 20 s de recuperación. 2 series con 3 minutos entre ellas.",
      "6 esprints de 20 m amb 20 s de recuperació. 2 sèries amb 3 minuts entre elles.",
      "6 x 20 m sprints with 20 s recovery. 2 sets with 3 minutes between them.",
    ),
    space: t("Banda de la pista", "Banda de la pista", "Along the touchline"),
    playersMin: 1,
    durationMin: 12,
    targetRpe: 9,
    restrictionTags: ["high_intensity"],
    contents: ["repeated_sprint"],
  },
  {
    name: t(
      "Preventivo de aductores e isquios",
      "Preventiu d'adductors i isquiotibials",
      "Groin and hamstring prevention",
    ),
    description: t(
      "Copenhague y nórdico por parejas, más estabilidad de tobillo. Antes de la parte principal.",
      "Copenhaguen i nòrdic per parelles, més estabilitat de turmell. Abans de la part principal.",
      "Copenhagen adduction and Nordic curls in pairs, plus ankle stability. Before the main block.",
    ),
    space: t("Zona de calentamiento", "Zona d'escalfament", "Warm-up area"),
    playersMin: 2,
    durationMin: 12,
    targetRpe: 5,
    restrictionTags: [],
    contents: ["injury_prevention", "strength"],
  },
  {
    name: t(
      "Juego del portero: blocaje y salida",
      "Joc del porter: blocatge i sortida",
      "Goalkeeping: catching and distribution",
    ),
    description: t(
      "Blocajes a media altura, caída lateral y salida rápida con la mano al pívot.",
      "Blocatges a mitja alçada, caiguda lateral i sortida ràpida amb la mà al pivot.",
      "Mid-height catches, side dives and fast hand distribution to the pivot.",
    ),
    space: t("Área y media pista", "Àrea i mitja pista", "Box and half court"),
    playersMin: 2,
    durationMin: 20,
    targetRpe: 6,
    restrictionTags: ["jumps"],
    contents: ["goalkeeping"],
  },
];

export const DEFAULT_DRILLS: Record<string, readonly DrillSeed[]> = { futsal: FUTSAL_DRILLS };

export function defaultDrills(sportCode: string): readonly DrillSeed[] {
  return DEFAULT_DRILLS[sportCode] ?? [];
}

/** Tests físicos que el club tiene a mano desde el primer día. */
export interface PhysicalTestSeed {
  code: string;
  name: LocalizedText;
  unit: PhysicalTestUnit;
  direction: PhysicalTestDirection;
}
export const DEFAULT_PHYSICAL_TESTS: readonly PhysicalTestSeed[] = [
  {
    code: "cmj",
    name: t(
      "Salto con contramovimiento (CMJ)",
      "Salt amb contramoviment (CMJ)",
      "Countermovement jump (CMJ)",
    ),
    unit: "cm",
    direction: "higher_better",
  },
  {
    code: "sprint_10",
    name: t("Sprint 10 m", "Esprint 10 m", "10 m sprint"),
    unit: "s",
    direction: "lower_better",
  },
  {
    code: "sprint_20",
    name: t("Sprint 20 m", "Esprint 20 m", "20 m sprint"),
    unit: "s",
    direction: "lower_better",
  },
  {
    code: "ift_30_15",
    name: t(
      "30-15 IFT (velocidad final)",
      "30-15 IFT (velocitat final)",
      "30-15 IFT (final speed)",
    ),
    unit: "km_h",
    direction: "higher_better",
  },
  {
    code: "rsa_mean",
    name: t(
      "Velocidad repetida (media 6 x 20 m)",
      "Velocitat repetida (mitjana 6 x 20 m)",
      "Repeated sprint (6 x 20 m mean)",
    ),
    unit: "s",
    direction: "lower_better",
  },
];

/**
 * Bloques que puede editar cada papel del cuerpo técnico. El primer entrenador, el ayudante y
 * "otro" llevan la sesión entera; preparación física, la activación y la vuelta a la calma;
 * fisioterapia, la readaptación; el entrenador de porteros, su bloque; la delegación, ninguno.
 */
export const BLOCKS_BY_TEAM_ROLE: Record<string, readonly SessionBlock[]> = {
  head_coach: SESSION_BLOCKS,
  assistant: SESSION_BLOCKS,
  other: SESSION_BLOCKS,
  fitness: ["warmup", "cooldown"],
  physio: ["rehab"],
  goalkeeper_coach: ["goalkeepers"],
  delegate: [],
};
