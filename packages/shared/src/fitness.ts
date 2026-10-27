import { z } from "zod";
import type { LocalizedText } from "./locales.ts";
import { DateTimeSchema } from "./events.ts";
import { DateOnlySchema } from "./structure.ts";
import { addDays, daysBetween, weekStartOf } from "./training-load.ts";
import {
  CapacitySchema,
  DayRoleSchema,
  TimeDomainSchema,
  WorkoutTrackSchema,
} from "./capacities.ts";

/**
 * Clubs de fitness (ADR 0049): el box de CrossFit, HYROX o entrenamiento funcional. Mismo motor que
 * el club deportivo, con lo que en un box es otra cosa: clases abiertas que cada atleta reserva,
 * tarifas con derecho de uso, el WOD del día con resultados, marcas personales y la comunidad.
 * Aquí viven el vocabulario de datos, los esquemas de entrada y las reglas puras que comparten la
 * API (que decide) y la web (que explica).
 */

// --- Clases y reservas ---

/**
 * Estado de una reserva. `waitlist` espera plaza; `late_cancel` es una cancelación fuera de plazo;
 * `no_show`, reservó y no vino; `attended`, hizo check-in.
 */
export const BOOKING_STATUSES = [
  "booked",
  "waitlist",
  "cancelled",
  "late_cancel",
  "no_show",
  "attended",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BookingStatusSchema = z.enum(BOOKING_STATUSES);
/** Los estados que ocupan una plaza de la clase. */
export const SEAT_STATUSES: readonly BookingStatus[] = ["booked", "attended"];

/** Reglas de reserva del club. Las fija la administración en Ajustes. */
export const BookingPolicySchema = z.object({
  /** La reserva abre tantos días antes de la clase. */
  opensDaysBefore: z.number().int().min(0).max(60),
  /** Y cierra tantos minutos antes de empezar (0: hasta que empieza). */
  closesMinutesBefore: z.number().int().min(0).max(1440),
  /** Cancelar es gratis hasta tantas horas antes; después es cancelación tardía. */
  cancelHoursBefore: z.number().int().min(0).max(72),
  /** La cancelación tardía gasta la sesión de la tarifa. */
  lateCancelConsumes: z.boolean(),
  /** No presentarse gasta la sesión de la tarifa. */
  noShowConsumes: z.boolean(),
  /** Máximo de clases reservadas por día. Nulo: sin límite. */
  maxPerDay: z.number().int().min(1).max(10).nullable(),
  /** Con la clase llena, se puede apuntar a la espera; la primera plaza libre la sube sola. */
  waitlist: z.boolean(),
  /** Los atletas ven quién viene a la clase (cada uno puede ocultarse). */
  showAttendees: z.boolean(),
  /** Hay clasificación por WOD (cada uno puede ocultarse). */
  showLeaderboards: z.boolean(),
});
export type BookingPolicy = z.infer<typeof BookingPolicySchema>;
export const BookingPolicyUpdateSchema = BookingPolicySchema.partial();
export type BookingPolicyUpdate = z.infer<typeof BookingPolicyUpdateSchema>;

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  opensDaysBefore: 7,
  closesMinutesBefore: 0,
  cancelHoursBefore: 2,
  lateCancelConsumes: true,
  noShowConsumes: true,
  maxPerDay: null,
  waitlist: true,
  showAttendees: true,
  showLeaderboards: true,
};

/**
 * Un tipo de clase (WOD, Open Box, Halterofilia) es un grupo abierto de una disciplina: el box no
 * ve temporadas ni categorías, la API las pone por él.
 */
export const ClassTypeCreateSchema = z.object({
  sectionId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(999).nullable().optional(),
});
export type ClassTypeCreate = z.infer<typeof ClassTypeCreateSchema>;
export const ClassTypeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  capacity: z.number().int().min(1).max(999).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});
export type ClassTypeUpdate = z.infer<typeof ClassTypeUpdateSchema>;

/** Reservar para uno mismo; el personal reserva para un atleta con su id. */
export const BookingCreateSchema = z.object({ playerId: z.string().uuid().optional() });
export type BookingCreate = z.infer<typeof BookingCreateSchema>;

/**
 * El aforo de una clase concreta (ADR 0057), no el de su tipo de clase: nunca por debajo de quien
 * ya tiene plaza. Si sube, las plazas nuevas pasan a la espera por orden.
 */
export const ClassCapacityUpdateSchema = z.object({ capacity: z.number().int().min(1).max(500) });
export type ClassCapacityUpdate = z.infer<typeof ClassCapacityUpdateSchema>;

/** Check-in del coach: llegó o no; quitarlo devuelve la reserva a reservada. */
export const CheckInSchema = z.object({
  playerId: z.string().uuid(),
  present: z.boolean(),
});
export type CheckIn = z.infer<typeof CheckInSchema>;

// --- Tarifas y bonos ---

/**
 * Derecho de uso de un plan de cuota. `none`: una cuota de socio de toda la vida. `unlimited`:
 * todas las clases. `per_week` y `per_month`: tantas clases por semana o por mes natural. `pack`:
 * un bono de tantas sesiones que caduca a los días de validez.
 */
export const PLAN_ENTITLEMENTS = ["none", "unlimited", "per_week", "per_month", "pack"] as const;
export type PlanEntitlement = (typeof PLAN_ENTITLEMENTS)[number];
export const PlanEntitlementSchema = z.enum(PLAN_ENTITLEMENTS);

/** Lo que un plan con derecho de uso añade a un plan de cuota. */
export const PlanEntitlementFieldsSchema = z.object({
  entitlement: PlanEntitlementSchema.optional(),
  /** Clases por semana o por mes, o sesiones del bono. */
  sessions: z.number().int().min(1).max(999).nullable().optional(),
  /** Días que dura un bono desde su alta. */
  validityDays: z.number().int().min(1).max(730).nullable().optional(),
  /** Tipos de clase que incluye. Nulo o vacío: todos. */
  classTeamIds: z.array(z.string().uuid()).max(50).nullable().optional(),
  /** Planificación (ADR 0053): incluye Clase+, el trabajo extra del Open Box. */
  includesPlus: z.boolean().optional(),
  /** Es la cuota de una programación propia (individual o de grupo): se ve quién la paga. */
  includesProgramming: z.boolean().optional(),
});

/** Necesita número de sesiones todo lo que no es ilimitado ni cuota simple. */
export function entitlementNeedsSessions(entitlement: PlanEntitlement): boolean {
  return entitlement === "per_week" || entitlement === "per_month" || entitlement === "pack";
}

export const SUBSCRIPTION_STATUSES = ["active", "paused", "cancelled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const SubscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

/** Cómo se cobra la tarifa: el club genera los cargos, o domiciliada por Stripe. */
export const PLAN_BILLINGS = ["manual", "stripe"] as const;
export type PlanBilling = (typeof PLAN_BILLINGS)[number];

export const SubscriptionCreateSchema = z.object({
  playerId: z.string().uuid(),
  feePlanId: z.string().uuid(),
  startsOn: DateOnlySchema,
  /** Crea ya el cargo del primer periodo (o del bono). */
  chargeNow: z.boolean().optional(),
});
export type SubscriptionCreate = z.infer<typeof SubscriptionCreateSchema>;

export const SubscriptionUpdateSchema = z.object({
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  /** Con la tarifa en pausa: hasta qué día (incluido). */
  pausedUntil: DateOnlySchema.nullable().optional(),
  endsOn: DateOnlySchema.nullable().optional(),
});
export type SubscriptionUpdate = z.infer<typeof SubscriptionUpdateSchema>;

/** Genera el cargo del periodo para todas las tarifas recurrentes activas que aún no lo tienen. */
export const PlanChargesGenerateSchema = z.object({
  /** Mes del cargo, `AAAA-MM`. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido: usa AAAA-MM."),
  dueOn: DateOnlySchema,
});
export type PlanChargesGenerate = z.infer<typeof PlanChargesGenerateSchema>;

// --- Programación: el WOD ---

export const WORKOUT_STATUSES = ["draft", "published"] as const;
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];
export const WorkoutStatusSchema = z.enum(WORKOUT_STATUSES);

export const WORKOUT_BLOCK_KINDS = [
  "warmup",
  "strength",
  "skill",
  "wod",
  "accessory",
  "cooldown",
] as const;
export type WorkoutBlockKind = (typeof WORKOUT_BLOCK_KINDS)[number];
export const WorkoutBlockKindSchema = z.enum(WORKOUT_BLOCK_KINDS);

/**
 * Cómo se puntúa un bloque. `time`: menos es mejor, y quien no acaba en el time cap va detrás por
 * repeticiones. `rounds_reps`: rondas y repeticiones (AMRAP). El resto: más es mejor.
 */
export const SCORE_TYPES = [
  "time",
  "rounds_reps",
  "load",
  "reps",
  "distance",
  "calories",
  "none",
] as const;
export type ScoreType = (typeof SCORE_TYPES)[number];
export const ScoreTypeSchema = z.enum(SCORE_TYPES);

/**
 * Niveles de un WOD, del más sencillo al más exigente. Iniciación (ADR 0053) es el atleta de los
 * primeros meses: menos volumen, variantes simples y foco en la técnica.
 */
export const WORKOUT_LEVELS = ["foundations", "scaled", "rx", "rx_plus"] as const;
export type WorkoutLevel = (typeof WORKOUT_LEVELS)[number];
export const WorkoutLevelSchema = z.enum(WORKOUT_LEVELS);

/** Repeticiones de las máximas que se guardan: 1RM, 2RM, 3RM, 5RM y 10RM. */
export const REP_MAXES = [1, 2, 3, 5, 10] as const;
export type RepMax = (typeof REP_MAXES)[number];
export const RepMaxSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(10),
]);

const BlockText = z.string().trim().max(2000);
const LevelText = z.string().trim().max(400);

export const WorkoutBlockInputSchema = z
  .object({
    kind: WorkoutBlockKindSchema,
    title: z.string().trim().min(1).max(80),
    description: BlockText.nullable().optional(),
    scoreType: ScoreTypeSchema,
    timeCapSeconds: z
      .number()
      .int()
      .min(30)
      .max(4 * 3600)
      .nullable()
      .optional(),
    /** Movimiento del catálogo: con un porcentaje, la app calcula los kilos de cada atleta. */
    movementCode: z.string().trim().min(1).max(40).nullable().optional(),
    percent: z.number().int().min(1).max(150).nullable().optional(),
    /** Si el bloque busca una máxima (1RM, 3RM…), el resultado entra en las marcas del atleta. */
    rmReps: RepMaxSchema.nullable().optional(),
    foundations: LevelText.nullable().optional(),
    scaled: LevelText.nullable().optional(),
    rx: LevelText.nullable().optional(),
    rxPlus: LevelText.nullable().optional(),
    /** Planificación (ADR 0053): la capacidad que trabaja, sus minutos y los ejercicios que usa. */
    capacity: CapacitySchema.nullable().optional(),
    plannedMinutes: z.number().int().min(1).max(120).nullable().optional(),
    exerciseIds: z.array(z.string().uuid()).max(12).optional(),
    /** Clase o Clase+ (el trabajo extra del Open Box). */
    track: WorkoutTrackSchema.optional(),
  })
  .refine((b) => !b.percent || b.movementCode, {
    message: "Un porcentaje necesita el movimiento al que se aplica.",
    path: ["percent"],
  })
  .refine((b) => !b.rmReps || (b.movementCode && b.scoreType === "load"), {
    message: "Una máxima necesita un movimiento y puntuarse en kilos.",
    path: ["rmReps"],
  });
export type WorkoutBlockInput = z.infer<typeof WorkoutBlockInputSchema>;

/**
 * El WOD de un día para una disciplina (sección) y, si se quiere, para un tipo de clase concreto.
 * Sin tipo de clase vale para todas las clases de la disciplina ese día.
 */
export const WorkoutUpsertSchema = z.object({
  sectionId: z.string().uuid(),
  teamId: z.string().uuid().nullable().optional(),
  onDate: DateOnlySchema,
  title: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: WorkoutStatusSchema,
  /** Con el WOD publicado: a partir de cuándo lo ven los atletas. Nulo: ya. */
  publishAt: DateTimeSchema.nullable().optional(),
  blocks: z.array(WorkoutBlockInputSchema).min(1).max(12),
  /**
   * Planificación (ADR 0053): el plan y la semana a los que sirve, el papel del día, la intención
   * (dominio de tiempo, esfuerzo de 1 a 5 y cómo se tiene que sentir) y su porqué, una razón por línea.
   */
  planId: z.string().uuid().nullable().optional(),
  planWeek: z.number().int().min(1).max(60).nullable().optional(),
  dayRole: DayRoleSchema.nullable().optional(),
  intentDomain: TimeDomainSchema.nullable().optional(),
  intentEffort: z.number().int().min(1).max(5).nullable().optional(),
  intentFeel: z.string().trim().max(300).nullable().optional(),
  why: z.string().trim().max(1200).nullable().optional(),
  /**
   * La sesión de un plan propio (de un nivel, un grupo o una persona), no la del box: solo la ven
   * los atletas del plan y va aparte del WOD de la disciplina ese día. Pide `planId`.
   */
  specific: z.boolean().optional(),
});
export type WorkoutUpsert = z.infer<typeof WorkoutUpsertSchema>;

/** El marcador de un resultado: solo se rellena lo que pide el tipo de puntuación del bloque. */
export const ScoreSchema = z.object({
  timeSeconds: z
    .number()
    .int()
    .min(1)
    .max(24 * 3600)
    .nullable()
    .optional(),
  rounds: z.number().int().min(0).max(999).nullable().optional(),
  reps: z.number().int().min(0).max(99_999).nullable().optional(),
  loadKg: z.number().min(0).max(1000).nullable().optional(),
  distanceM: z.number().int().min(0).max(1_000_000).nullable().optional(),
  calories: z.number().int().min(0).max(99_999).nullable().optional(),
});
export type Score = z.infer<typeof ScoreSchema>;

export const WorkoutResultSchema = z.object({
  level: WorkoutLevelSchema,
  score: ScoreSchema,
  /** En un bloque por tiempo: acabó dentro del time cap. Si no, cuentan sus repeticiones. */
  completed: z.boolean().optional(),
  /** Cómo le ha ido, de 1 (suave) a 5 (al límite). */
  effort: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().trim().max(400).nullable().optional(),
});
export type WorkoutResult = z.infer<typeof WorkoutResultSchema>;

// --- Marcas personales ---

export const MOVEMENT_KINDS = ["weightlifting", "powerlifting", "gymnastics", "cardio"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export interface MovementEntry {
  code: string;
  kind: MovementKind;
  name: LocalizedText;
}

const mv = (code: string, kind: MovementKind, es: string, ca: string, en: string) => ({
  code,
  kind,
  name: { es, ca, en },
});

/** Catálogo de movimientos con máxima: el WOD los cita y el atleta guarda sus marcas. */
export const MOVEMENTS: readonly MovementEntry[] = [
  mv("back_squat", "powerlifting", "Back squat", "Back squat", "Back squat"),
  mv("front_squat", "powerlifting", "Front squat", "Front squat", "Front squat"),
  mv("overhead_squat", "weightlifting", "Overhead squat", "Overhead squat", "Overhead squat"),
  mv("deadlift", "powerlifting", "Peso muerto", "Pes mort", "Deadlift"),
  mv("sumo_deadlift", "powerlifting", "Peso muerto sumo", "Pes mort sumo", "Sumo deadlift"),
  mv("bench_press", "powerlifting", "Press banca", "Press banca", "Bench press"),
  mv("strict_press", "weightlifting", "Press estricto", "Press estricte", "Strict press"),
  mv("push_press", "weightlifting", "Push press", "Push press", "Push press"),
  mv("push_jerk", "weightlifting", "Push jerk", "Push jerk", "Push jerk"),
  mv("split_jerk", "weightlifting", "Split jerk", "Split jerk", "Split jerk"),
  mv("clean", "weightlifting", "Clean", "Clean", "Clean"),
  mv("power_clean", "weightlifting", "Power clean", "Power clean", "Power clean"),
  mv("squat_clean", "weightlifting", "Squat clean", "Squat clean", "Squat clean"),
  mv("clean_and_jerk", "weightlifting", "Clean & jerk", "Clean & jerk", "Clean & jerk"),
  mv("snatch", "weightlifting", "Snatch", "Snatch", "Snatch"),
  mv("power_snatch", "weightlifting", "Power snatch", "Power snatch", "Power snatch"),
  mv("thruster", "weightlifting", "Thruster", "Thruster", "Thruster"),
  mv("hip_thrust", "powerlifting", "Hip thrust", "Hip thrust", "Hip thrust"),
  mv(
    "weighted_pull_up",
    "gymnastics",
    "Dominada lastrada",
    "Dominada llastrada",
    "Weighted pull-up",
  ),
  mv("weighted_dip", "gymnastics", "Fondo lastrado", "Fons llastrat", "Weighted dip"),
];
export const MOVEMENT_CODES = MOVEMENTS.map((m) => m.code);
export function movementByCode(code: string | null | undefined): MovementEntry | null {
  return MOVEMENTS.find((m) => m.code === code) ?? null;
}

export const PersonalRecordCreateSchema = z.object({
  movementCode: z.string().refine((v) => MOVEMENT_CODES.includes(v), "Movimiento desconocido."),
  reps: RepMaxSchema,
  loadKg: z.number().min(0.5).max(1000),
  onDate: DateOnlySchema,
  note: z.string().trim().max(200).nullable().optional(),
});
export type PersonalRecordCreate = z.infer<typeof PersonalRecordCreateSchema>;

/** Familias de benchmarks, en el orden en que se enseñan. */
export const BENCHMARK_FAMILIES = ["girls", "heroes", "open", "hybrid"] as const;
export type BenchmarkFamily = (typeof BENCHMARK_FAMILIES)[number];

export interface BenchmarkEntry {
  code: string;
  /** Girls y Heroes de siempre, WODs del Open y pruebas de HYROX. */
  family: BenchmarkFamily;
  scoreType: ScoreType;
  name: string;
  description: LocalizedText;
  /** Duración del AMRAP o time cap, en minutos: llena los minutos del bloque. */
  minutes?: number;
}

const bm = (
  code: string,
  family: BenchmarkFamily,
  scoreType: ScoreType,
  name: string,
  es: string,
  ca: string,
  en: string,
  minutes?: number,
): BenchmarkEntry => ({
  code,
  family,
  scoreType,
  name,
  description: { es, ca, en },
  ...(minutes ? { minutes } : {}),
});

/** Benchmarks: los WODs con nombre que se repiten para medir el progreso. */
export const BENCHMARKS: readonly BenchmarkEntry[] = [
  bm(
    "fran",
    "girls",
    "time",
    "Fran",
    "21-15-9 thrusters (43/30 kg) y pull-ups",
    "21-15-9 thrusters (43/30 kg) i pull-ups",
    "21-15-9 thrusters (43/30 kg) and pull-ups",
  ),
  bm(
    "grace",
    "girls",
    "time",
    "Grace",
    "30 clean & jerks (61/43 kg) por tiempo",
    "30 clean & jerks (61/43 kg) per temps",
    "30 clean & jerks (61/43 kg) for time",
  ),
  bm(
    "helen",
    "girls",
    "time",
    "Helen",
    "3 rondas: 400 m carrera, 21 KB swings (24/16 kg), 12 pull-ups",
    "3 rondes: 400 m cursa, 21 KB swings (24/16 kg), 12 pull-ups",
    "3 rounds: 400 m run, 21 KB swings (24/16 kg), 12 pull-ups",
  ),
  bm(
    "cindy",
    "girls",
    "rounds_reps",
    "Cindy",
    "AMRAP 20': 5 pull-ups, 10 push-ups, 15 air squats",
    "AMRAP 20': 5 pull-ups, 10 flexions, 15 air squats",
    "AMRAP 20': 5 pull-ups, 10 push-ups, 15 air squats",
    20,
  ),
  bm(
    "diane",
    "girls",
    "time",
    "Diane",
    "21-15-9 peso muerto (102/70 kg) y handstand push-ups",
    "21-15-9 pes mort (102/70 kg) i handstand push-ups",
    "21-15-9 deadlifts (102/70 kg) and handstand push-ups",
  ),
  bm(
    "isabel",
    "girls",
    "time",
    "Isabel",
    "30 snatches (61/43 kg) por tiempo",
    "30 snatches (61/43 kg) per temps",
    "30 snatches (61/43 kg) for time",
  ),
  bm(
    "karen",
    "girls",
    "time",
    "Karen",
    "150 wall balls (9/6 kg) por tiempo",
    "150 wall balls (9/6 kg) per temps",
    "150 wall balls (9/6 kg) for time",
  ),
  bm(
    "annie",
    "girls",
    "time",
    "Annie",
    "50-40-30-20-10 double unders y sit-ups",
    "50-40-30-20-10 double unders i sit-ups",
    "50-40-30-20-10 double unders and sit-ups",
  ),
  bm(
    "jackie",
    "girls",
    "time",
    "Jackie",
    "1000 m remo, 50 thrusters (20/15 kg), 30 pull-ups",
    "1000 m rem, 50 thrusters (20/15 kg), 30 pull-ups",
    "1000 m row, 50 thrusters (20/15 kg), 30 pull-ups",
  ),
  bm(
    "elizabeth",
    "girls",
    "time",
    "Elizabeth",
    "21-15-9 cleans (61/43 kg) y ring dips",
    "21-15-9 cleans (61/43 kg) i ring dips",
    "21-15-9 cleans (61/43 kg) and ring dips",
  ),
  bm(
    "amanda",
    "girls",
    "time",
    "Amanda",
    "9-7-5 muscle-ups y squat snatches (61/43 kg)",
    "9-7-5 muscle-ups i squat snatches (61/43 kg)",
    "9-7-5 muscle-ups and squat snatches (61/43 kg)",
  ),
  bm(
    "angie",
    "girls",
    "time",
    "Angie",
    "100 pull-ups, 100 push-ups, 100 sit-ups y 100 air squats, en ese orden",
    "100 pull-ups, 100 flexions, 100 sit-ups i 100 air squats, en aquest ordre",
    "100 pull-ups, 100 push-ups, 100 sit-ups and 100 air squats, in that order",
  ),
  bm(
    "barbara",
    "girls",
    "time",
    "Barbara",
    "5 rondas: 20 pull-ups, 30 push-ups, 40 sit-ups, 50 air squats; 3' de descanso entre rondas",
    "5 rondes: 20 pull-ups, 30 flexions, 40 sit-ups, 50 air squats; 3' de descans entre rondes",
    "5 rounds: 20 pull-ups, 30 push-ups, 40 sit-ups, 50 air squats; 3' rest between rounds",
  ),
  bm(
    "candy",
    "girls",
    "time",
    "Candy",
    "5 rondas: 20 pull-ups, 40 push-ups, 60 air squats",
    "5 rondes: 20 pull-ups, 40 flexions, 60 air squats",
    "5 rounds: 20 pull-ups, 40 push-ups, 60 air squats",
  ),
  bm(
    "eva",
    "girls",
    "time",
    "Eva",
    "5 rondas: 800 m carrera, 30 KB swings (32/24 kg), 30 pull-ups",
    "5 rondes: 800 m cursa, 30 KB swings (32/24 kg), 30 pull-ups",
    "5 rounds: 800 m run, 30 KB swings (32/24 kg), 30 pull-ups",
  ),
  bm(
    "kelly",
    "girls",
    "time",
    "Kelly",
    "5 rondas: 400 m carrera, 30 box jumps (61/51 cm), 30 wall balls (9/6 kg)",
    "5 rondes: 400 m cursa, 30 box jumps (61/51 cm), 30 wall balls (9/6 kg)",
    "5 rounds: 400 m run, 30 box jumps (61/51 cm), 30 wall balls (9/6 kg)",
  ),
  bm(
    "linda",
    "girls",
    "time",
    "Linda",
    "10-9-8-7-6-5-4-3-2-1: peso muerto (1,5 × peso corporal), press banca (peso corporal) y clean (0,75 × peso corporal)",
    "10-9-8-7-6-5-4-3-2-1: pes mort (1,5 × pes corporal), press banca (pes corporal) i clean (0,75 × pes corporal)",
    "10-9-8-7-6-5-4-3-2-1: deadlift (1.5 × bodyweight), bench press (bodyweight) and clean (0.75 × bodyweight)",
  ),
  bm(
    "lynne",
    "girls",
    "reps",
    "Lynne",
    "5 rondas: máximas repeticiones de press banca con tu peso corporal y de pull-ups. Cuenta el total",
    "5 rondes: màximes repeticions de press banca amb el teu pes corporal i de pull-ups. Compta el total",
    "5 rounds: max-rep bench press (bodyweight) and max-rep pull-ups. Score: total reps",
  ),
  bm(
    "mary",
    "girls",
    "rounds_reps",
    "Mary",
    "AMRAP 20': 5 handstand push-ups, 10 pistols alternos, 15 pull-ups",
    "AMRAP 20': 5 handstand push-ups, 10 pistols alternes, 15 pull-ups",
    "AMRAP 20': 5 handstand push-ups, 10 alternating pistols, 15 pull-ups",
    20,
  ),
  bm(
    "nancy",
    "girls",
    "time",
    "Nancy",
    "5 rondas: 400 m carrera, 15 overhead squats (43/30 kg)",
    "5 rondes: 400 m cursa, 15 overhead squats (43/30 kg)",
    "5 rounds: 400 m run, 15 overhead squats (43/30 kg)",
  ),
  bm(
    "nicole",
    "girls",
    "reps",
    "Nicole",
    "AMRAP 20': 400 m carrera y máximas pull-ups. Cuentan las pull-ups",
    "AMRAP 20': 400 m cursa i màximes pull-ups. Compten les pull-ups",
    "AMRAP 20': 400 m run, then max pull-ups. Score: total pull-ups",
    20,
  ),
  bm(
    "murph",
    "heroes",
    "time",
    "Murph",
    "1,6 km carrera, 100 pull-ups, 200 push-ups, 300 air squats, 1,6 km carrera",
    "1,6 km cursa, 100 pull-ups, 200 flexions, 300 air squats, 1,6 km cursa",
    "1 mile run, 100 pull-ups, 200 push-ups, 300 air squats, 1 mile run",
  ),
  bm(
    "dt",
    "heroes",
    "time",
    "DT",
    "5 rondas: 12 peso muerto, 9 hang power cleans, 6 push jerks (70/47 kg)",
    "5 rondes: 12 pes mort, 9 hang power cleans, 6 push jerks (70/47 kg)",
    "5 rounds: 12 deadlifts, 9 hang power cleans, 6 push jerks (70/47 kg)",
  ),
  bm(
    "jt",
    "heroes",
    "time",
    "JT",
    "21-15-9 handstand push-ups, ring dips y push-ups",
    "21-15-9 handstand push-ups, ring dips i flexions",
    "21-15-9 handstand push-ups, ring dips and push-ups",
  ),
  bm(
    "michael",
    "heroes",
    "time",
    "Michael",
    "3 rondas: 800 m carrera, 50 back extensions, 50 sit-ups",
    "3 rondes: 800 m cursa, 50 back extensions, 50 sit-ups",
    "3 rounds: 800 m run, 50 back extensions, 50 sit-ups",
  ),
  bm(
    "badger",
    "heroes",
    "time",
    "Badger",
    "3 rondas: 30 squat cleans (43/30 kg), 30 pull-ups, 800 m carrera",
    "3 rondes: 30 squat cleans (43/30 kg), 30 pull-ups, 800 m cursa",
    "3 rounds: 30 squat cleans (43/30 kg), 30 pull-ups, 800 m run",
  ),
  bm(
    "nate",
    "heroes",
    "rounds_reps",
    "Nate",
    "AMRAP 20': 2 muscle-ups, 4 handstand push-ups, 8 KB swings (32/24 kg)",
    "AMRAP 20': 2 muscle-ups, 4 handstand push-ups, 8 KB swings (32/24 kg)",
    "AMRAP 20': 2 muscle-ups, 4 handstand push-ups, 8 KB swings (32/24 kg)",
    20,
  ),
  bm(
    "randy",
    "heroes",
    "time",
    "Randy",
    "75 power snatches (34/25 kg) por tiempo",
    "75 power snatches (34/25 kg) per temps",
    "75 power snatches (34/25 kg) for time",
  ),
  bm(
    "ryan",
    "heroes",
    "time",
    "Ryan",
    "5 rondas: 7 muscle-ups, 21 burpees tocando una marca 30 cm por encima del alcance",
    "5 rondes: 7 muscle-ups, 21 burpees tocant una marca 30 cm per sobre de l'abast",
    "5 rounds: 7 muscle-ups, 21 burpees to a target 30 cm above reach",
  ),
  bm(
    "josh",
    "heroes",
    "time",
    "Josh",
    "21 overhead squats (43/30 kg), 42 pull-ups, 15 OHS, 30 pull-ups, 9 OHS, 18 pull-ups",
    "21 overhead squats (43/30 kg), 42 pull-ups, 15 OHS, 30 pull-ups, 9 OHS, 18 pull-ups",
    "21 overhead squats (43/30 kg), 42 pull-ups, 15 OHS, 30 pull-ups, 9 OHS, 18 pull-ups",
  ),
  bm(
    "kalsu",
    "heroes",
    "time",
    "Kalsu",
    "100 thrusters (61/43 kg) por tiempo, con 5 burpees al empezar cada minuto",
    "100 thrusters (61/43 kg) per temps, amb 5 burpees en començar cada minut",
    "100 thrusters (61/43 kg) for time, with 5 burpees at the top of every minute",
  ),
  bm(
    "open_12_1",
    "open",
    "reps",
    "Open 12.1",
    "AMRAP 7': burpees tocando una marca 15 cm por encima del alcance",
    "AMRAP 7': burpees tocant una marca 15 cm per sobre de l'abast",
    "AMRAP 7': burpees to a target 15 cm above reach",
    7,
  ),
  bm(
    "open_14_1",
    "open",
    "rounds_reps",
    "Open 14.1",
    "AMRAP 10': 30 double unders, 15 power snatches (34/25 kg)",
    "AMRAP 10': 30 double unders, 15 power snatches (34/25 kg)",
    "AMRAP 10': 30 double unders, 15 power snatches (34/25 kg)",
    10,
  ),
  bm(
    "open_15_5",
    "open",
    "time",
    "Open 15.5",
    "27-21-15-9 calorías de remo y thrusters (43/30 kg)",
    "27-21-15-9 calories de rem i thrusters (43/30 kg)",
    "27-21-15-9 calorie row and thrusters (43/30 kg)",
  ),
  bm(
    "open_16_5",
    "open",
    "time",
    "Open 16.5",
    "21-18-15-12-9-6-3 thrusters (43/30 kg) y bar-facing burpees",
    "21-18-15-12-9-6-3 thrusters (43/30 kg) i bar-facing burpees",
    "21-18-15-12-9-6-3 thrusters (43/30 kg) and bar-facing burpees",
  ),
  bm(
    "open_17_1",
    "open",
    "time",
    "Open 17.1",
    "10-20-30-40-50 dumbbell snatches (22,5/15 kg) con 15 burpee box jump overs (61/51 cm) después de cada serie. Cap 20'",
    "10-20-30-40-50 dumbbell snatches (22,5/15 kg) amb 15 burpee box jump overs (61/51 cm) després de cada sèrie. Cap 20'",
    "10-20-30-40-50 dumbbell snatches (22.5/15 kg) with 15 burpee box jump-overs (61/51 cm) after each set. Cap 20'",
    20,
  ),
  bm(
    "open_20_1",
    "open",
    "time",
    "Open 20.1",
    "10 rondas: 8 ground to overheads (43/29 kg), 10 bar-facing burpees. Cap 15'",
    "10 rondes: 8 ground to overheads (43/29 kg), 10 bar-facing burpees. Cap 15'",
    "10 rounds: 8 ground-to-overheads (43/29 kg), 10 bar-facing burpees. Cap 15'",
    15,
  ),
  bm(
    "open_24_1",
    "open",
    "time",
    "Open 24.1",
    "21-15-9: dumbbell snatches (22,5/15 kg) con un brazo, lateral burpees sobre la mancuerna, snatches con el otro brazo y lateral burpees. Cap 15'",
    "21-15-9: dumbbell snatches (22,5/15 kg) amb un braç, lateral burpees per sobre de la manuella, snatches amb l'altre braç i lateral burpees. Cap 15'",
    "21-15-9: dumbbell snatches (22.5/15 kg) arm 1, lateral burpees over the dumbbell, snatches arm 2, lateral burpees. Cap 15'",
    15,
  ),
  bm(
    "row_2k",
    "hybrid",
    "time",
    "2K Row",
    "2000 m de remo por tiempo",
    "2000 m de rem per temps",
    "2000 m row for time",
  ),
  bm(
    "run_5k",
    "hybrid",
    "time",
    "5K Run",
    "5 km de carrera por tiempo",
    "5 km de cursa per temps",
    "5 km run for time",
  ),
  bm(
    "hybrid_sim",
    "hybrid",
    "time",
    "Hybrid Sim",
    "8 × (1 km carrera + estación): ski, sled push, sled pull, burpee broad jumps, remo, farmers carry, sandbag lunges, wall balls",
    "8 × (1 km cursa + estació): ski, sled push, sled pull, burpee broad jumps, rem, farmers carry, sandbag lunges, wall balls",
    "8 × (1 km run + station): ski, sled push, sled pull, burpee broad jumps, row, farmers carry, sandbag lunges, wall balls",
  ),
  bm(
    "row_500",
    "hybrid",
    "time",
    "500m Row",
    "500 m de remo por tiempo",
    "500 m de rem per temps",
    "500 m row for time",
  ),
  bm(
    "ski_1k",
    "hybrid",
    "time",
    "1K Ski",
    "1000 m de SkiErg por tiempo",
    "1000 m de SkiErg per temps",
    "1000 m SkiErg for time",
  ),
  bm(
    "run_1k",
    "hybrid",
    "time",
    "1K Run",
    "1 km de carrera por tiempo",
    "1 km de cursa per temps",
    "1 km run for time",
  ),
];
export const BENCHMARK_CODES = BENCHMARKS.map((b) => b.code);
export function benchmarkByCode(code: string | null | undefined): BenchmarkEntry | null {
  return BENCHMARKS.find((b) => b.code === code) ?? null;
}

export const BenchmarkResultCreateSchema = z.object({
  benchmarkCode: z.string().refine((v) => BENCHMARK_CODES.includes(v), "Benchmark desconocido."),
  level: WorkoutLevelSchema,
  score: ScoreSchema,
  completed: z.boolean().optional(),
  onDate: DateOnlySchema,
  note: z.string().trim().max(200).nullable().optional(),
});
export type BenchmarkResultCreate = z.infer<typeof BenchmarkResultCreateSchema>;

/** Medidas corporales del atleta: privadas, y para su coach solo si él lo comparte. */
export const BodyMeasurementCreateSchema = z
  .object({
    onDate: DateOnlySchema,
    weightKg: z.number().min(20).max(300).nullable().optional(),
    bodyFatPct: z.number().min(2).max(70).nullable().optional(),
    waistCm: z.number().min(30).max(250).nullable().optional(),
    hipCm: z.number().min(30).max(250).nullable().optional(),
    chestCm: z.number().min(30).max(250).nullable().optional(),
    armCm: z.number().min(10).max(80).nullable().optional(),
    thighCm: z.number().min(20).max(120).nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (m) =>
      [m.weightKg, m.bodyFatPct, m.waistCm, m.hipCm, m.chestCm, m.armCm, m.thighCm].some(
        (v) => v !== null && v !== undefined,
      ),
    { message: "Apunta al menos una medida." },
  );
export type BodyMeasurementCreate = z.infer<typeof BodyMeasurementCreateSchema>;

/** Privacidad del atleta: salir o no en las listas de clase y en la clasificación, y compartir medidas. */
export const FitnessPreferencesSchema = z.object({
  hideFromAttendees: z.boolean(),
  hideFromLeaderboards: z.boolean(),
  shareBodyWithCoach: z.boolean(),
});
export type FitnessPreferences = z.infer<typeof FitnessPreferencesSchema>;
export const FitnessPreferencesUpdateSchema = FitnessPreferencesSchema.partial();
export const DEFAULT_FITNESS_PREFERENCES: FitnessPreferences = {
  hideFromAttendees: false,
  hideFromLeaderboards: false,
  shareBodyWithCoach: false,
};

// --- Comunidad ---

export const ANNOUNCEMENT_AUDIENCES = ["all", "section"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const AnnouncementCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4000),
    audience: z.enum(ANNOUNCEMENT_AUDIENCES),
    sectionId: z.string().uuid().nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .refine((a) => a.audience !== "section" || a.sectionId, {
    message: "Elige la disciplina del anuncio.",
    path: ["sectionId"],
  });
export type AnnouncementCreate = z.infer<typeof AnnouncementCreateSchema>;
export const AnnouncementUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  pinned: z.boolean().optional(),
});
export type AnnouncementUpdate = z.infer<typeof AnnouncementUpdateSchema>;

/** Mensaje entre el box y un atleta adulto. Nunca con menores (DESIGN.md, regla 13). */
export const MessageCreateSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export type MessageCreate = z.infer<typeof MessageCreateSchema>;

// --- Leads y clases de prueba ---

export const LEAD_SOURCES = ["web", "walk_in", "referral", "social", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_STATUSES = ["new", "trial_booked", "trial_done", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LeadStatusSchema = z.enum(LEAD_STATUSES);

const Phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+0-9 ()-]*$/, "Teléfono inválido.");

export const LeadCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(200).nullable().optional(),
    phone: Phone.nullable().optional(),
    source: z.enum(LEAD_SOURCES),
    notes: z.string().trim().max(1000).nullable().optional(),
    /** Clase de prueba reservada. */
    trialEventId: z.string().uuid().nullable().optional(),
  })
  .refine((l) => l.email || l.phone, {
    message: "Hace falta un email o un teléfono para volver a contactar.",
    path: ["email"],
  });
export type LeadCreate = z.infer<typeof LeadCreateSchema>;
export const LeadUpdateSchema = z.object({
  status: LeadStatusSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  trialEventId: z.string().uuid().nullable().optional(),
});
export type LeadUpdate = z.infer<typeof LeadUpdateSchema>;

/** Pasar un lead a atleta: su ficha y, si se quiere, la tarifa que contrata desde un día. */
export const LeadConvertSchema = z.object({
  feePlanId: z.string().uuid().nullable().optional(),
  startsOn: DateOnlySchema.optional(),
  /** Crea ya el cargo de la tarifa. */
  chargeNow: z.boolean().optional(),
});
export type LeadConvert = z.infer<typeof LeadConvertSchema>;

/** La web del box pide una clase de prueba (API pública, sin sesión). */
export const PublicTrialRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: Phone.nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  /** Acepta que el box le contacte. Sin esto no se guarda nada. */
  consent: z.literal(true),
});
export type PublicTrialRequest = z.infer<typeof PublicTrialRequestSchema>;

// --- Reglas puras ---

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Las ventanas de una clase: cuándo abre y cierra la reserva y hasta cuándo se cancela gratis. */
export function bookingWindows(startsAt: Date, policy: BookingPolicy) {
  return {
    opensAt: new Date(startsAt.getTime() - policy.opensDaysBefore * DAY),
    closesAt: new Date(startsAt.getTime() - policy.closesMinutesBefore * MINUTE),
    freeCancelUntil: new Date(startsAt.getTime() - policy.cancelHoursBefore * HOUR),
  };
}

/** Lo que pasa al cancelar ahora: gratis o tardía. Una clase empezada ya no se cancela. */
export function cancellationKindAt(
  now: Date,
  startsAt: Date,
  policy: BookingPolicy,
): "free" | "late" | "too_late" {
  if (now.getTime() >= startsAt.getTime()) return "too_late";
  return now.getTime() <= bookingWindows(startsAt, policy).freeCancelUntil.getTime()
    ? "free"
    : "late";
}

/** Si una reserva en ese estado gasta sesión de la tarifa, según la política del club. */
export function bookingConsumes(status: BookingStatus, policy: BookingPolicy): boolean {
  switch (status) {
    case "booked":
    case "attended":
      return true;
    case "late_cancel":
      return policy.lateCancelConsumes;
    case "no_show":
      return policy.noShowConsumes;
    default:
      return false;
  }
}

/** Una tarifa con lo justo para contar: su derecho de uso y sus fechas. */
export interface EntitlementPlan {
  entitlement: PlanEntitlement;
  sessions: number | null;
  validityDays: number | null;
  startsOn: string;
  endsOn: string | null;
  status: SubscriptionStatus;
  pausedUntil: string | null;
  classTeamIds: string[] | null;
}

/** Último día en que vale una tarifa: el fin puesto o, en un bono, la caducidad. */
export function planExpiresOn(plan: EntitlementPlan): string | null {
  const pack =
    plan.entitlement === "pack" && plan.validityDays
      ? addDays(plan.startsOn, plan.validityDays - 1)
      : null;
  if (pack && plan.endsOn) return pack < plan.endsOn ? pack : plan.endsOn;
  return pack ?? plan.endsOn;
}

/** El periodo de cuenta que contiene una fecha: su semana ISO, su mes o la vida del bono. */
export function entitlementPeriod(
  plan: EntitlementPlan,
  date: string,
): { from: string; to: string } | null {
  switch (plan.entitlement) {
    case "per_week": {
      const from = weekStartOf(date);
      return { from, to: addDays(from, 6) };
    }
    case "per_month": {
      const from = `${date.slice(0, 7)}-01`;
      const next = new Date(Date.parse(`${from}T00:00:00Z`));
      next.setUTCMonth(next.getUTCMonth() + 1);
      return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
    }
    case "pack":
      return { from: plan.startsOn, to: planExpiresOn(plan) ?? "9999-12-31" };
    default:
      return null;
  }
}

/** Una reserva que cuenta: el día de la clase en la zona del club y si gasta sesión. */
export interface CountedBooking {
  date: string;
  consumes: boolean;
}

export interface EntitlementUsage {
  /** Sesiones del periodo; nulo si es ilimitado. */
  limit: number | null;
  used: number;
  remaining: number | null;
  period: { from: string; to: string } | null;
}

/** Cuántas sesiones lleva gastadas el atleta en el periodo de esa fecha y cuántas le quedan. */
export function entitlementUsage(
  plan: EntitlementPlan,
  date: string,
  bookings: readonly CountedBooking[],
): EntitlementUsage {
  if (plan.entitlement === "unlimited") {
    return { limit: null, used: countIn(bookings, null), remaining: null, period: null };
  }
  const period = entitlementPeriod(plan, date);
  const limit = plan.sessions ?? 0;
  const used = countIn(bookings, period);
  return { limit, used, remaining: Math.max(0, limit - used), period };
}

function countIn(bookings: readonly CountedBooking[], period: { from: string; to: string } | null) {
  return bookings.filter(
    (b) => b.consumes && (!period || (b.date >= period.from && b.date <= period.to)),
  ).length;
}

/** Por qué no se puede reservar una clase. Nulo: se puede (a plaza o a la espera). */
export const BOOKING_BLOCKS = [
  "not_open_yet",
  "closed",
  "already_booked",
  "full",
  "no_plan",
  "plan_paused",
  "plan_expired",
  "not_covered",
  "no_sessions_left",
  "daily_limit",
] as const;
export type BookingBlock = (typeof BOOKING_BLOCKS)[number];

export interface BookingCheckInput {
  now: Date;
  startsAt: Date;
  /** Día de la clase en la zona del club. */
  date: string;
  teamId: string | null;
  policy: BookingPolicy;
  capacity: number | null;
  seatsTaken: number;
  /** El estado de la reserva propia en esa clase, si la hay. */
  myStatus: BookingStatus | null;
  /** Tarifas del atleta (todas): se usa la primera que permite esa clase. */
  plans: readonly (EntitlementPlan & { id: string })[];
  /** Reservas del atleta para contar sesiones (sin la de esta clase). */
  bookings: readonly CountedBooking[];
  /** Clases ya reservadas ese día (para el máximo diario). */
  bookedThatDay: number;
}

export interface BookingCheck {
  /** Se puede: con plaza (`book`) o a la espera (`waitlist`). */
  action: "book" | "waitlist" | null;
  block: BookingBlock | null;
  /** La tarifa que se usará. */
  planId: string | null;
  usage: EntitlementUsage | null;
}

/** Si una tarifa vale para una clase ese día: activa, empezada, sin caducar y que la incluya. */
export function planCovers(
  plan: EntitlementPlan,
  date: string,
  teamId: string | null,
): "ok" | "paused" | "expired" | "not_covered" | "inactive" {
  if (plan.entitlement === "none") return "not_covered";
  if (plan.status === "cancelled" || plan.status === "expired") return "inactive";
  if (date < plan.startsOn) return "inactive";
  const expires = planExpiresOn(plan);
  if (expires && date > expires) return "expired";
  if (plan.status === "paused" && (!plan.pausedUntil || date <= plan.pausedUntil)) return "paused";
  if (
    plan.classTeamIds &&
    plan.classTeamIds.length > 0 &&
    (!teamId || !plan.classTeamIds.includes(teamId))
  )
    return "not_covered";
  return "ok";
}

/**
 * La regla de reserva entera: ventana, plaza, tarifa, sesiones y máximo diario. La API decide con
 * ella y la web explica con la misma razón por qué un botón no está.
 */
export function checkBooking(input: BookingCheckInput): BookingCheck {
  const none = (block: BookingBlock, usage: EntitlementUsage | null = null): BookingCheck => ({
    action: null,
    block,
    planId: null,
    usage,
  });
  if (input.myStatus === "booked" || input.myStatus === "waitlist" || input.myStatus === "attended")
    return none("already_booked");
  const windows = bookingWindows(input.startsAt, input.policy);
  if (input.now.getTime() < windows.opensAt.getTime()) return none("not_open_yet");
  if (input.now.getTime() >= windows.closesAt.getTime()) return none("closed");

  let block: BookingBlock = "no_plan";
  let chosen: (EntitlementPlan & { id: string }) | null = null;
  let usage: EntitlementUsage | null = null;
  for (const plan of input.plans) {
    const covers = planCovers(plan, input.date, input.teamId);
    if (covers === "paused") {
      block = "plan_paused";
      continue;
    }
    if (covers === "expired") {
      if (block === "no_plan") block = "plan_expired";
      continue;
    }
    if (covers === "not_covered") {
      if (block === "no_plan" && plan.entitlement !== "none") block = "not_covered";
      continue;
    }
    if (covers === "inactive") continue;
    const u = entitlementUsage(plan, input.date, input.bookings);
    if (u.remaining !== null && u.remaining <= 0) {
      block = "no_sessions_left";
      usage = u;
      continue;
    }
    chosen = plan;
    usage = u;
    break;
  }
  if (!chosen) return none(block, usage);
  if (input.policy.maxPerDay !== null && input.bookedThatDay >= input.policy.maxPerDay)
    return none("daily_limit", usage);
  const full = input.capacity !== null && input.seatsTaken >= input.capacity;
  if (full && !input.policy.waitlist) return none("full", usage);
  return { action: full ? "waitlist" : "book", block: null, planId: chosen.id, usage };
}

// --- Marcadores ---

/** Valor numérico de un marcador para ordenar. Nulo si falta lo que pide el tipo. */
export function scoreValue(type: ScoreType, score: Score): number | null {
  switch (type) {
    case "time":
      return score.timeSeconds ?? null;
    case "rounds_reps":
      return score.rounds === null || score.rounds === undefined
        ? null
        : score.rounds * 1000 + (score.reps ?? 0);
    case "load":
      return score.loadKg ?? null;
    case "reps":
      return score.reps ?? null;
    case "distance":
      return score.distanceM ?? null;
    case "calories":
      return score.calories ?? null;
    default:
      return null;
  }
}

/** Un resultado tal como se ordena en una clasificación. */
export interface RankedScore {
  level: WorkoutLevel;
  value: number;
  /** En bloques por tiempo: acabó dentro del time cap. */
  completed: boolean;
  /** Repeticiones de quien no acabó (por tiempo). */
  capReps: number;
}

const LEVEL_ORDER: Record<WorkoutLevel, number> = { rx_plus: 0, rx: 1, scaled: 2, foundations: 3 };

/**
 * Orden de una clasificación: primero el nivel más exigente; dentro, por tiempo menos es mejor y
 * quien no acabó va detrás por repeticiones; en el resto, más es mejor. Negativo: `a` va antes.
 */
export function compareScores(type: ScoreType, a: RankedScore, b: RankedScore): number {
  const level = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
  if (level !== 0) return level;
  if (type === "time") {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    if (!a.completed) return b.capReps - a.capReps;
    return a.value - b.value;
  }
  return b.value - a.value;
}

/** `8:47`, `1:02:05`. */
export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** `8:47` → 527 segundos. Admite `mm:ss` y `h:mm:ss`. */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0]!, nums[1]!];
  if (m! > 59 && nums.length === 3) return null;
  if (s! > 59) return null;
  const total = h! * 3600 + m! * 60 + s!;
  return total > 0 ? total : null;
}

/** Kilos con su coma decimal: `72,5`. */
export function formatKg(kg: number, locale = "es"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kg);
}

/** El marcador como se lee: `8:47`, `5+12`, `72,5 kg`, `CAP+14` si no acabó en el time cap. */
export function formatScore(
  type: ScoreType,
  score: Score,
  completed = true,
  locale = "es",
): string {
  switch (type) {
    case "time":
      if (!completed) return `CAP+${score.reps ?? 0}`;
      return score.timeSeconds ? formatSeconds(score.timeSeconds) : "";
    case "rounds_reps":
      return `${score.rounds ?? 0}+${score.reps ?? 0}`;
    case "load":
      return score.loadKg !== null && score.loadKg !== undefined
        ? `${formatKg(score.loadKg, locale)} kg`
        : "";
    case "reps":
      return score.reps !== null && score.reps !== undefined ? String(score.reps) : "";
    case "distance":
      return score.distanceM !== null && score.distanceM !== undefined
        ? `${score.distanceM} m`
        : "";
    case "calories":
      return score.calories !== null && score.calories !== undefined ? `${score.calories} cal` : "";
    default:
      return "";
  }
}

/** ¿Trae el marcador lo que pide su tipo? */
export function scoreIsComplete(type: ScoreType, score: Score, completed = true): boolean {
  if (type === "none") return true;
  if (type === "time" && !completed) return score.reps !== null && score.reps !== undefined;
  return scoreValue(type, score) !== null;
}

// --- Cargas ---

/** 1RM estimado desde una máxima a varias repeticiones (Epley). Una 1RM es ella misma. */
export function estimateOneRm(loadKg: number, reps: number): number {
  return reps <= 1 ? loadKg : loadKg * (1 + reps / 30);
}

/** Redondea a lo que se puede cargar en la barra: medio kilo por defecto. */
export function roundLoad(kg: number, step = 0.5): number {
  return Math.round(kg / step) * step;
}

/** Los kilos de un porcentaje de la 1RM, ya redondeados. */
export function percentLoad(oneRmKg: number, percent: number, step = 0.5): number {
  return roundLoad((oneRmKg * percent) / 100, step);
}

/** La mejor 1RM de un movimiento: la real o, si solo hay máximas a más repeticiones, la estimada. */
export function bestOneRm(records: readonly { reps: number; loadKg: number }[]): {
  kg: number;
  estimated: boolean;
} | null {
  let best: { kg: number; estimated: boolean } | null = null;
  for (const r of records) {
    const kg = roundLoad(estimateOneRm(r.loadKg, r.reps));
    const estimated = r.reps > 1;
    if (!best || kg > best.kg || (kg === best.kg && !estimated)) best = { kg, estimated };
  }
  return best;
}

// --- Constancia ---

/**
 * Racha en semanas: semanas ISO seguidas con al menos una clase, terminando en la semana de hoy
 * (o en la anterior si esta aún no tiene ninguna). Y la mejor racha de todas.
 */
export function weeklyStreaks(
  dates: readonly string[],
  today: string,
): { current: number; best: number } {
  const weeks = new Set(dates.map((d) => weekStartOf(d)));
  if (weeks.size === 0) return { current: 0, best: 0 };
  const sorted = [...weeks].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = addDays(sorted[i - 1]!, 7) === sorted[i] ? run + 1 : 1;
    if (run > best) best = run;
  }
  let cursor = weekStartOf(today);
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let current = 0;
  while (weeks.has(cursor)) {
    current++;
    cursor = addDays(cursor, -7);
  }
  return { current, best };
}

/** Mayores de edad a una fecha: los mensajes con el box solo son entre adultos. */
export function isAdultOn(birthDate: string | null, today: string): boolean {
  if (!birthDate) return true;
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  const adultFrom = `${String(y + 18).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return today >= adultFrom;
}

// --- Acciones de semana de la programación (ADR 0050) ---

/** Publica de una vez los borradores de un rango (la semana), de una disciplina o de todas. */
export const WorkoutsPublishSchema = z
  .object({
    from: DateOnlySchema,
    to: DateOnlySchema,
    sectionId: z.string().uuid().optional(),
  })
  .refine((v) => v.to >= v.from, { message: "El final va después del inicio.", path: ["to"] })
  .refine((v) => daysBetween(v.from, v.to) <= 31, {
    message: "Como mucho un mes de una vez.",
    path: ["to"],
  });
export type WorkoutsPublish = z.infer<typeof WorkoutsPublishSchema>;

/**
 * Copia los WODs de `days` días desde `from` a los mismos días desde `to`, como borradores. Los
 * días que ya tienen WOD (de esa disciplina o tipo de clase) se saltan: nunca se pisa nada.
 */
export const WorkoutsCopySchema = z
  .object({
    from: DateOnlySchema,
    to: DateOnlySchema,
    days: z.number().int().min(1).max(14),
    sectionId: z.string().uuid().optional(),
  })
  .refine((v) => v.from !== v.to, { message: "Elige otro día de destino.", path: ["to"] });
export type WorkoutsCopy = z.infer<typeof WorkoutsCopySchema>;
