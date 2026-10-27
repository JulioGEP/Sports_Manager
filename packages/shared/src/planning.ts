import { z } from "zod";
import { EXERCISE_EQUIPMENT, type ExerciseEquipment } from "./exercises.ts";
import { movementByCode, WORKOUT_LEVELS, type WorkoutLevel } from "./fitness.ts";
import type { Locale, LocalizedText } from "./locales.ts";
import {
  CAPACITIES,
  DayRoleSchema,
  type Capacity,
  type DayRole,
  type TimeDomain,
} from "./capacities.ts";
import { DateOnlySchema } from "./structure.ts";
import { addDays, daysBetween, weekStartOf } from "./training-load.ts";

/**
 * Planificación del box (ADR 0053). Encima del WOD de cada día (ADR 0050) hay un plan: un objetivo
 * con fecha, bloques de semanas (base, desarrollo, realización, descarga) y el papel de cada día de
 * la semana. Aquí viven el vocabulario, los catálogos (capacidades, papeles, plantillas, tests) y el
 * motor que construye el plan. Todo es puro: la API decide con esto y la web lo enseña en vivo
 * mientras se configura, sin ir al servidor.
 */

// --- Capacidades ---

const Points = z.number().int().min(0).max(100).multipleOf(5);
/** Cien puntos repartidos entre las seis capacidades, de cinco en cinco. */
export const EmphasisSchema = z
  .object({
    strength: Points,
    weightlifting: Points,
    gymnastics: Points,
    engine: Points,
    intensity: Points,
    mobility: Points,
  })
  .refine((e) => CAPACITIES.reduce((s, c) => s + e[c], 0) === 100, {
    message: "Reparte exactamente 100 puntos.",
  });
export type Emphasis = z.infer<typeof EmphasisSchema>;

export function emphasisTotal(e: Emphasis): number {
  return CAPACITIES.reduce((s, c) => s + e[c], 0);
}

/**
 * Capacidades en las que se sugiere un nivel a cada atleta. La intensidad se hace con el nivel
 * más prudente entre gimnásticos y motor; la movilidad no tiene niveles.
 */
export const LEVEL_CAPACITIES = ["strength", "weightlifting", "gymnastics", "engine"] as const;
export type LevelCapacity = (typeof LEVEL_CAPACITIES)[number];
export const LevelCapacitySchema = z.enum(LEVEL_CAPACITIES);

/** Con qué nivel del atleta se lee un bloque de cierta capacidad. */
export function levelCapacityOf(capacity: Capacity | null): LevelCapacity[] {
  switch (capacity) {
    case "strength":
    case "weightlifting":
    case "gymnastics":
    case "engine":
      return [capacity];
    case "intensity":
      return ["gymnastics", "engine"];
    default:
      return [];
  }
}

const LEVEL_RANK: Record<WorkoutLevel, number> = { foundations: 0, scaled: 1, rx: 2, rx_plus: 3 };
export function levelRank(level: WorkoutLevel): number {
  return LEVEL_RANK[level];
}
/** El más prudente de varios niveles. */
export function lowestLevel(levels: readonly WorkoutLevel[]): WorkoutLevel | null {
  if (levels.length === 0) return null;
  return [...levels].sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b])[0]!;
}

// --- Material del box ---

/** Tipos de material del inventario: los de los ejercicios, salvo "sin material". */
export const BOX_EQUIPMENT_KINDS = EXERCISE_EQUIPMENT.filter(
  (k): k is Exclude<ExerciseEquipment, "bodyweight"> => k !== "bodyweight",
);
export type BoxEquipmentKind = (typeof BOX_EQUIPMENT_KINDS)[number];
export const BoxEquipmentKindSchema = z.enum(
  BOX_EQUIPMENT_KINDS as unknown as [BoxEquipmentKind, ...BoxEquipmentKind[]],
);

/** Máquinas que se reparten como una sola bolsa cuando el WOD dice "la máquina que toque". */
export const MACHINE_KINDS = [
  "rower",
  "bike",
  "ski",
] as const satisfies readonly BoxEquipmentKind[];
/** Calorías equivalentes a una de assault bike: 21 de bike son 25 de remo o de ski. */
export const CALORIE_FACTOR: Record<(typeof MACHINE_KINDS)[number], number> = {
  bike: 1,
  rower: 1.2,
  ski: 1.2,
};
/** Metros de carrera por cada caloría de bike, para quien corre en lugar de máquina. */
export const RUN_METERS_PER_BIKE_CAL = 19;

export const EquipmentItemInputSchema = z
  .object({
    kind: BoxEquipmentKindSchema,
    name: z.string().trim().min(1).max(80),
    quantity: z.number().int().min(0).max(9999),
    /** Unidades fuera de servicio (rotas, en reparación). */
    outOfService: z.number().int().min(0).max(9999).default(0),
    /** Hasta cuándo están fuera de servicio. Nulo: hasta que se diga. */
    repairUntil: DateOnlySchema.nullable().optional(),
    minKg: z.number().min(0).max(500).nullable().optional(),
    maxKg: z.number().min(0).max(500).nullable().optional(),
    facilityId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(400).nullable().optional(),
  })
  .refine((e) => e.outOfService <= e.quantity, {
    message: "No puede haber más unidades fuera de servicio que unidades.",
    path: ["outOfService"],
  })
  .refine((e) => e.minKg == null || e.maxKg == null || e.minKg <= e.maxKg, {
    message: "El peso mínimo va antes que el máximo.",
    path: ["maxKg"],
  });
export type EquipmentItemInput = z.infer<typeof EquipmentItemInputSchema>;

/** Una línea del inventario tal como la usa el planificador. */
export interface InventoryLine {
  kind: BoxEquipmentKind;
  quantity: number;
  outOfService: number;
  repairUntil: string | null;
}

/** Unidades que se pueden usar un día: las que hay menos las que están fuera de servicio entonces. */
export function availableOn(line: InventoryLine, date: string): number {
  const out = line.outOfService > 0 && (!line.repairUntil || date < line.repairUntil);
  return Math.max(0, line.quantity - (out ? line.outOfService : 0));
}

/** Unidades usables de cada tipo un día. */
export function inventoryOn(
  lines: readonly InventoryLine[],
  date: string,
): Map<BoxEquipmentKind, number> {
  const out = new Map<BoxEquipmentKind, number>();
  for (const l of lines) out.set(l.kind, (out.get(l.kind) ?? 0) + availableOn(l, date));
  return out;
}

// --- Dominios de tiempo, papeles del día y tipos de bloque ---

/** Minutos de cada dominio. */
export const TIME_DOMAIN_RANGE: Record<TimeDomain, readonly [number, number]> = {
  short: [3, 7],
  medium: [7, 15],
  long: [15, 30],
  very_long: [30, 60],
};
export function domainOfMinutes(minutes: number): TimeDomain {
  if (minutes < 7) return "short";
  if (minutes < 15) return "medium";
  if (minutes < 30) return "long";
  return "very_long";
}

export interface DayRoleInfo {
  /** La capacidad principal: el color del día. */
  capacity: Capacity;
  /** Lo que toca ese día, para saber si una combinación de días cubre el bloque. */
  covers: readonly Capacity[];
  domain: TimeDomain | null;
  /** Esfuerzo objetivo de 1 a 5. */
  effort: number;
  /** Barra pesada: no más de dos días seguidos. */
  heavyBarbell: boolean;
  /** Trabajo de hombro por encima de la cabeza. */
  overhead: boolean;
  /** Levantamiento principal según el bloque, si el día lo tiene. */
  lift: LiftSlot | null;
}

export type LiftSlot = "lower" | "upper" | "olympic" | "olympic_snatch" | "hinge";

export const DAY_ROLE_INFO: Record<DayRole, DayRoleInfo> = {
  heavy_lower: {
    capacity: "strength",
    covers: ["strength", "intensity"],
    domain: "short",
    effort: 4,
    heavyBarbell: true,
    overhead: false,
    lift: "lower",
  },
  gymnastics_engine: {
    capacity: "gymnastics",
    covers: ["gymnastics", "engine"],
    domain: "medium",
    effort: 3,
    heavyBarbell: false,
    overhead: true,
    lift: null,
  },
  olympic_metcon: {
    capacity: "weightlifting",
    covers: ["weightlifting", "intensity"],
    domain: "medium",
    effort: 3,
    heavyBarbell: true,
    overhead: false,
    lift: "olympic",
  },
  long_engine: {
    capacity: "engine",
    covers: ["engine", "mobility"],
    domain: "very_long",
    effort: 2,
    heavyBarbell: false,
    overhead: false,
    lift: null,
  },
  upper_intervals: {
    capacity: "strength",
    covers: ["strength", "intensity", "engine"],
    domain: "medium",
    effort: 4,
    heavyBarbell: true,
    overhead: true,
    lift: "upper",
  },
  team: {
    capacity: "intensity",
    covers: ["intensity", "engine", "gymnastics"],
    domain: "long",
    effort: 3,
    heavyBarbell: false,
    overhead: false,
    lift: null,
  },
  skill_mobility: {
    capacity: "mobility",
    covers: ["mobility", "gymnastics"],
    domain: null,
    effort: 2,
    heavyBarbell: false,
    overhead: false,
    lift: null,
  },
  test: {
    capacity: "strength",
    covers: ["strength", "weightlifting", "gymnastics", "engine"],
    domain: null,
    effort: 5,
    heavyBarbell: true,
    overhead: false,
    lift: null,
  },
  benchmark: {
    capacity: "intensity",
    covers: ["intensity", "gymnastics"],
    domain: "medium",
    effort: 4,
    heavyBarbell: false,
    overhead: false,
    lift: null,
  },
  open_sim: {
    capacity: "intensity",
    covers: ["intensity", "gymnastics", "weightlifting"],
    domain: "medium",
    effort: 5,
    heavyBarbell: false,
    overhead: true,
    lift: null,
  },
  hyrox_stations: {
    capacity: "engine",
    covers: ["engine", "strength"],
    domain: "long",
    effort: 3,
    heavyBarbell: false,
    overhead: false,
    lift: null,
  },
  hyrox_strength: {
    capacity: "strength",
    covers: ["strength", "engine"],
    domain: "medium",
    effort: 3,
    heavyBarbell: true,
    overhead: false,
    lift: "hinge",
  },
  hyrox_sim: {
    capacity: "engine",
    covers: ["engine", "intensity"],
    domain: "very_long",
    effort: 4,
    heavyBarbell: false,
    overhead: false,
    lift: null,
  },
  oly_technique: {
    capacity: "weightlifting",
    covers: ["weightlifting", "mobility"],
    domain: null,
    effort: 3,
    heavyBarbell: false,
    overhead: true,
    lift: "olympic_snatch",
  },
  oly_strength: {
    capacity: "weightlifting",
    covers: ["weightlifting", "strength"],
    domain: null,
    effort: 4,
    heavyBarbell: true,
    overhead: true,
    lift: "olympic",
  },
};

/** Tipos de bloque del plan: los mesociclos. */
export const PLAN_BLOCK_KINDS = ["test", "base", "build", "peak", "deload", "maintenance"] as const;
export type PlanBlockKind = (typeof PLAN_BLOCK_KINDS)[number];
export const PlanBlockKindSchema = z.enum(PLAN_BLOCK_KINDS);

/** Disciplinas que sabe planificar el motor: el patrón de la semana cambia con ella. */
/**
 * Para quién es un plan (ADR 0054): todo el box (la disciplina entera), un nivel (el grupo de RX),
 * un grupo de personas o una sola persona. Un plan que no es de todo el box tiene su lista de
 * atletas, y cada atleta está como mucho en uno activo: su programación manda sobre la del box.
 */
export const PLAN_AUDIENCES = ["section", "level", "group", "athlete"] as const;
export type PlanAudience = (typeof PLAN_AUDIENCES)[number];
export const PlanAudienceSchema = z.enum(PLAN_AUDIENCES);

/** Días por semana que admite un plan: de uno a siete, según para quién sea. */
export const PLAN_FREQUENCY_MIN = 1;
export const PLAN_FREQUENCY_MAX = 7;

export const PLAN_DISCIPLINES = ["crossfit", "hyrox", "weightlifting"] as const;
export type PlanDiscipline = (typeof PLAN_DISCIPLINES)[number];
export const PlanDisciplineSchema = z.enum(PLAN_DISCIPLINES);

/** La disciplina del motor según el deporte de la sección y el nombre del tipo de clase. */
export function disciplineOf(sportCode: string | null, sectionName: string): PlanDiscipline {
  const name = sectionName.toLowerCase();
  if (/hyrox|h[ií]brid/.test(name)) return "hyrox";
  if (/halterof|weightlift|halterof/.test(name)) return "weightlifting";
  if (sportCode === "weightlifting") return "weightlifting";
  return "crossfit";
}

/**
 * Patrón de la semana por disciplina y tipo de bloque, en orden de lunes a sábado. Con menos días
 * de clase se quedan los de más prioridad (`ROLE_PRIORITY`) en el orden del patrón.
 */
const WEEK_PATTERNS: Record<PlanDiscipline, Record<PlanBlockKind, DayRole[]>> = {
  crossfit: {
    base: [
      "heavy_lower",
      "gymnastics_engine",
      "olympic_metcon",
      "long_engine",
      "upper_intervals",
      "team",
    ],
    build: [
      "heavy_lower",
      "gymnastics_engine",
      "olympic_metcon",
      "long_engine",
      "upper_intervals",
      "benchmark",
    ],
    peak: [
      "heavy_lower",
      "open_sim",
      "olympic_metcon",
      "long_engine",
      "gymnastics_engine",
      "open_sim",
    ],
    deload: [
      "skill_mobility",
      "gymnastics_engine",
      "olympic_metcon",
      "long_engine",
      "skill_mobility",
      "team",
    ],
    maintenance: ["team", "skill_mobility", "long_engine", "team", "skill_mobility", "team"],
    test: ["test", "gymnastics_engine", "test", "long_engine", "test", "team"],
  },
  hyrox: {
    base: [
      "hyrox_stations",
      "hyrox_strength",
      "long_engine",
      "upper_intervals",
      "team",
      "hyrox_sim",
    ],
    build: [
      "hyrox_stations",
      "hyrox_strength",
      "long_engine",
      "upper_intervals",
      "team",
      "hyrox_sim",
    ],
    peak: ["hyrox_sim", "hyrox_strength", "long_engine", "hyrox_stations", "team", "hyrox_sim"],
    deload: ["hyrox_stations", "skill_mobility", "long_engine", "skill_mobility", "team", "team"],
    maintenance: ["long_engine", "skill_mobility", "team", "long_engine", "skill_mobility", "team"],
    test: ["test", "hyrox_stations", "long_engine", "test", "team", "hyrox_sim"],
  },
  weightlifting: {
    base: [
      "oly_technique",
      "oly_strength",
      "heavy_lower",
      "oly_technique",
      "oly_strength",
      "skill_mobility",
    ],
    build: [
      "oly_strength",
      "oly_technique",
      "heavy_lower",
      "oly_strength",
      "oly_technique",
      "skill_mobility",
    ],
    peak: [
      "oly_strength",
      "oly_technique",
      "heavy_lower",
      "oly_strength",
      "skill_mobility",
      "test",
    ],
    deload: [
      "oly_technique",
      "skill_mobility",
      "oly_technique",
      "skill_mobility",
      "oly_technique",
      "skill_mobility",
    ],
    maintenance: [
      "oly_technique",
      "skill_mobility",
      "oly_technique",
      "skill_mobility",
      "oly_technique",
      "skill_mobility",
    ],
    test: ["test", "oly_technique", "test", "skill_mobility", "test", "skill_mobility"],
  },
};

/** Con pocos días de clase, los que se quedan primero. */
const ROLE_PRIORITY: readonly DayRole[] = [
  "test",
  "heavy_lower",
  "hyrox_stations",
  "oly_strength",
  "gymnastics_engine",
  "long_engine",
  "open_sim",
  "olympic_metcon",
  "oly_technique",
  "hyrox_strength",
  "hyrox_sim",
  "upper_intervals",
  "benchmark",
  "team",
  "skill_mobility",
];

/**
 * Los papeles de una semana para unos días de clase (1 = lunes … 7 = domingo). Un día cerrado se
 * queda sin papel, pero no mueve los del resto: el atleta sabe que el miércoles es halterofilia.
 */
export function rolesForWeek(
  discipline: PlanDiscipline,
  kind: PlanBlockKind,
  classWeekdays: readonly number[],
  closed: readonly number[] = [],
): (DayRole | null)[] {
  const days = [...new Set(classWeekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const pattern = [...WEEK_PATTERNS[discipline][kind]];
  if (days.length > pattern.length) pattern.push("skill_mobility");
  // Con menos días, se quedan los de más prioridad, sin repetir papel si se puede.
  let chosen: { role: DayRole; at: number }[] = pattern.map((role, at) => ({ role, at }));
  if (days.length < chosen.length) {
    const ranked = [...chosen].sort((a, b) => {
      const pa = ROLE_PRIORITY.indexOf(a.role);
      const pb = ROLE_PRIORITY.indexOf(b.role);
      const seenA = chosen.filter((c) => c.role === a.role && c.at < a.at).length;
      const seenB = chosen.filter((c) => c.role === b.role && c.at < b.at).length;
      return seenA - seenB || pa - pb || a.at - b.at;
    });
    chosen = ranked.slice(0, days.length).sort((a, b) => a.at - b.at);
  }
  const out: (DayRole | null)[] = Array.from({ length: 7 }, () => null);
  days.forEach((d, i) => {
    out[d - 1] = closed.includes(d) ? null : (chosen[i]?.role ?? null);
  });
  return out;
}

// --- Tests ---

export const PLAN_TEST_KINDS = ["movement", "benchmark", "reps"] as const;
export type PlanTestKind = (typeof PLAN_TEST_KINDS)[number];

export interface PlanTestEntry {
  code: string;
  kind: PlanTestKind;
  /** Movimiento del catálogo (1RM) o benchmark del catálogo. */
  ref: string | null;
  /** Menos es mejor (tiempos). */
  lowerIsBetter: boolean;
  /** De qué capacidades depende, con su peso. */
  weights: Partial<Record<Capacity, number>>;
  name: LocalizedText;
}

const t = (
  code: string,
  kind: PlanTestKind,
  ref: string | null,
  lowerIsBetter: boolean,
  weights: Partial<Record<Capacity, number>>,
  es: string,
  ca: string,
  en: string,
): PlanTestEntry => ({ code, kind, ref, lowerIsBetter, weights, name: { es, ca, en } });

/** Pruebas de partida y de llegada que puede llevar un plan. */
export const PLAN_TESTS: readonly PlanTestEntry[] = [
  t(
    "back_squat",
    "movement",
    "back_squat",
    false,
    { strength: 1 },
    "Back squat 1RM",
    "Back squat 1RM",
    "Back squat 1RM",
  ),
  t(
    "front_squat",
    "movement",
    "front_squat",
    false,
    { strength: 1 },
    "Front squat 1RM",
    "Front squat 1RM",
    "Front squat 1RM",
  ),
  t(
    "deadlift",
    "movement",
    "deadlift",
    false,
    { strength: 1 },
    "Peso muerto 1RM",
    "Pes mort 1RM",
    "Deadlift 1RM",
  ),
  t(
    "strict_press",
    "movement",
    "strict_press",
    false,
    { strength: 1 },
    "Press estricto 1RM",
    "Press estricte 1RM",
    "Strict press 1RM",
  ),
  t(
    "clean",
    "movement",
    "squat_clean",
    false,
    { weightlifting: 0.8, strength: 0.2 },
    "Clean 1RM",
    "Clean 1RM",
    "Clean 1RM",
  ),
  t(
    "snatch",
    "movement",
    "snatch",
    false,
    { weightlifting: 0.85, strength: 0.15 },
    "Snatch 1RM",
    "Snatch 1RM",
    "Snatch 1RM",
  ),
  t(
    "clean_and_jerk",
    "movement",
    "clean_and_jerk",
    false,
    { weightlifting: 0.8, strength: 0.2 },
    "Clean & jerk 1RM",
    "Clean & jerk 1RM",
    "Clean & jerk 1RM",
  ),
  t(
    "fran",
    "benchmark",
    "fran",
    true,
    { intensity: 0.5, gymnastics: 0.3, weightlifting: 0.2 },
    "Fran",
    "Fran",
    "Fran",
  ),
  t(
    "grace",
    "benchmark",
    "grace",
    true,
    { weightlifting: 0.5, intensity: 0.5 },
    "Grace",
    "Grace",
    "Grace",
  ),
  t(
    "helen",
    "benchmark",
    "helen",
    true,
    { engine: 0.4, gymnastics: 0.3, intensity: 0.3 },
    "Helen",
    "Helen",
    "Helen",
  ),
  t(
    "cindy",
    "benchmark",
    "cindy",
    false,
    { gymnastics: 0.5, engine: 0.3, intensity: 0.2 },
    "Cindy",
    "Cindy",
    "Cindy",
  ),
  t("row_2k", "benchmark", "row_2k", true, { engine: 1 }, "Remo 2 km", "Rem 2 km", "2K row"),
  t("run_5k", "benchmark", "run_5k", true, { engine: 1 }, "Carrera 5 km", "Cursa 5 km", "5K run"),
  t(
    "hybrid_sim",
    "benchmark",
    "hybrid_sim",
    true,
    { engine: 0.6, strength: 0.2, intensity: 0.2 },
    "Simulacro híbrido",
    "Simulacre híbrid",
    "Hybrid sim",
  ),
  t(
    "max_pullups",
    "reps",
    null,
    false,
    { gymnastics: 1 },
    "Dominadas seguidas",
    "Dominades seguides",
    "Max pull-ups",
  ),
];
export const PLAN_TEST_CODES = PLAN_TESTS.map((x) => x.code);
export const PlanTestCodeSchema = z
  .string()
  .refine((v) => PLAN_TEST_CODES.includes(v), "Test desconocido.");
export function planTestByCode(code: string): PlanTestEntry | null {
  return PLAN_TESTS.find((x) => x.code === code) ?? null;
}

/**
 * Qué test va en cada día de test de una semana: las máximas el primer día, los benchmarks en los
 * siguientes y las repeticiones máximas con el más suave. En una semana que no es de test pero lleva
 * retest (una descarga), las máximas van el primer día con clase.
 */
export function testsByDay(
  week: Pick<PlanWeek, "kind" | "roles" | "tags">,
  tests: readonly string[],
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const entries = tests.map(planTestByCode).filter((x): x is PlanTestEntry => x !== null);
  const movements = entries.filter((e) => e.kind === "movement").map((e) => e.code);
  if (week.kind !== "test") {
    if (!week.tags.includes("retest") || movements.length === 0) return out;
    const first = week.roles.findIndex((r) => r !== null);
    if (first >= 0) out.set(first + 1, movements);
    return out;
  }
  const days = week.roles.map((r, i) => (r === "test" ? i + 1 : 0)).filter((d) => d > 0);
  if (days.length === 0) return out;
  const benchmarks = entries.filter((e) => e.kind === "benchmark").map((e) => e.code);
  const reps = entries.filter((e) => e.kind === "reps").map((e) => e.code);
  const put = (day: number, code: string) => out.set(day, [...(out.get(day) ?? []), code]);
  for (const code of movements) put(days[0]!, code);
  benchmarks.forEach((code, i) => put(days[Math.min(days.length - 1, 1 + i)] ?? days[0]!, code));
  for (const code of reps) put(days[days.length - 1]!, code);
  return out;
}

// --- Plantillas ---

export const PLAN_TEMPLATE_CODES = [
  "continuous",
  "open",
  "strength_base",
  "engine",
  "muscle_up",
  "back_to_box",
  "hyrox_race",
  "weightlifting_technique",
  "custom",
] as const;
export type PlanTemplateCode = (typeof PLAN_TEMPLATE_CODES)[number];
export const PlanTemplateCodeSchema = z.enum(PLAN_TEMPLATE_CODES);

export const PLAN_GOALS = ["compete", "balance", "strength", "engine", "skill", "return"] as const;
export type PlanGoal = (typeof PLAN_GOALS)[number];

export interface PlanPhase {
  kind: Exclude<PlanBlockKind, "test" | "deload" | "maintenance">;
  /** Parte de las semanas de carga. */
  share: number;
}

export interface PlanTemplate {
  code: PlanTemplateCode;
  goal: PlanGoal;
  discipline: PlanDiscipline;
  /** Semanas por defecto, mínimas y máximas. */
  weeks: { default: number; min: number; max: number };
  /** Termina en una fecha (el Open, la carrera). */
  untilEvent: boolean;
  /** Sin fin: bloques que rotan y un test cada ocho semanas. */
  continuous: boolean;
  emphasis: Emphasis;
  phases: readonly PlanPhase[];
  tests: readonly string[];
  /** Material que pide de verdad: sin él, se sustituye y se avisa. */
  equipment: readonly BoxEquipmentKind[];
  /** Destacada en la galería en estos meses (1 a 12). */
  featuredMonths: readonly number[];
}

const E = (
  strength: number,
  weightlifting: number,
  gymnastics: number,
  engine: number,
  intensity: number,
  mobility: number,
): Emphasis => ({ strength, weightlifting, gymnastics, engine, intensity, mobility });

export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    code: "open",
    goal: "compete",
    discipline: "crossfit",
    weeks: { default: 16, min: 8, max: 20 },
    untilEvent: true,
    continuous: false,
    emphasis: E(25, 15, 25, 15, 15, 5),
    phases: [
      { kind: "base", share: 0.35 },
      { kind: "build", share: 0.4 },
      { kind: "peak", share: 0.25 },
    ],
    tests: ["back_squat", "fran", "row_2k", "max_pullups"],
    equipment: ["barbell", "pullup_bar", "rower", "wall_ball", "box", "jump_rope"],
    featuredMonths: [10, 11, 12],
  },
  {
    code: "continuous",
    goal: "balance",
    discipline: "crossfit",
    weeks: { default: 12, min: 8, max: 24 },
    untilEvent: false,
    continuous: true,
    emphasis: E(20, 15, 20, 20, 15, 10),
    phases: [
      { kind: "base", share: 0.5 },
      { kind: "build", share: 0.5 },
    ],
    tests: ["back_squat", "helen", "max_pullups"],
    equipment: ["barbell", "pullup_bar"],
    featuredMonths: [],
  },
  {
    code: "strength_base",
    goal: "strength",
    discipline: "crossfit",
    weeks: { default: 8, min: 6, max: 12 },
    untilEvent: false,
    continuous: false,
    emphasis: E(45, 15, 15, 15, 5, 5),
    phases: [
      { kind: "base", share: 0.6 },
      { kind: "build", share: 0.4 },
    ],
    tests: ["back_squat", "deadlift", "strict_press"],
    equipment: ["barbell"],
    featuredMonths: [2, 3, 4],
  },
  {
    code: "engine",
    goal: "engine",
    discipline: "crossfit",
    weeks: { default: 6, min: 4, max: 10 },
    untilEvent: false,
    continuous: false,
    emphasis: E(15, 5, 10, 45, 20, 5),
    phases: [
      { kind: "base", share: 0.5 },
      { kind: "build", share: 0.5 },
    ],
    tests: ["row_2k", "helen"],
    equipment: ["rower", "bike"],
    featuredMonths: [5, 6],
  },
  {
    code: "muscle_up",
    goal: "skill",
    discipline: "crossfit",
    weeks: { default: 6, min: 4, max: 10 },
    untilEvent: false,
    continuous: false,
    emphasis: E(20, 0, 45, 15, 10, 10),
    phases: [
      { kind: "base", share: 0.5 },
      { kind: "build", share: 0.5 },
    ],
    tests: ["max_pullups", "cindy"],
    equipment: ["rings", "pullup_bar", "parallettes"],
    featuredMonths: [],
  },
  {
    code: "back_to_box",
    goal: "return",
    discipline: "crossfit",
    weeks: { default: 4, min: 3, max: 6 },
    untilEvent: false,
    continuous: false,
    emphasis: E(25, 10, 15, 25, 5, 20),
    phases: [{ kind: "base", share: 1 }],
    tests: [],
    equipment: ["barbell", "rower"],
    featuredMonths: [1, 9],
  },
  {
    code: "hyrox_race",
    goal: "compete",
    discipline: "hyrox",
    weeks: { default: 12, min: 8, max: 16 },
    untilEvent: true,
    continuous: false,
    emphasis: E(20, 0, 5, 40, 20, 15),
    phases: [
      { kind: "base", share: 0.4 },
      { kind: "build", share: 0.4 },
      { kind: "peak", share: 0.2 },
    ],
    tests: ["hybrid_sim", "row_2k", "run_5k"],
    equipment: ["sled", "sandbag", "wall_ball", "rower", "ski"],
    featuredMonths: [1, 2, 3, 9, 10],
  },
  {
    code: "weightlifting_technique",
    goal: "skill",
    discipline: "weightlifting",
    weeks: { default: 6, min: 4, max: 12 },
    untilEvent: false,
    continuous: false,
    emphasis: E(25, 50, 0, 5, 5, 15),
    phases: [
      { kind: "base", share: 0.5 },
      { kind: "build", share: 0.5 },
    ],
    tests: ["snatch", "clean_and_jerk"],
    equipment: ["barbell"],
    featuredMonths: [],
  },
  {
    code: "custom",
    goal: "balance",
    discipline: "crossfit",
    weeks: { default: 8, min: 3, max: 24 },
    untilEvent: false,
    continuous: false,
    emphasis: E(20, 15, 20, 20, 15, 10),
    phases: [
      { kind: "base", share: 0.5 },
      { kind: "build", share: 0.5 },
    ],
    tests: [],
    equipment: [],
    featuredMonths: [],
  },
];

export function planTemplateByCode(code: string): PlanTemplate | null {
  return PLAN_TEMPLATES.find((x) => x.code === code) ?? null;
}

/** Material que pide una plantilla y no está (o no hay ninguna unidad usable). */
export function missingEquipment(
  template: PlanTemplate,
  inventory: ReadonlyMap<BoxEquipmentKind, number>,
): BoxEquipmentKind[] {
  if (inventory.size === 0) return [];
  return template.equipment.filter((k) => (inventory.get(k) ?? 0) === 0);
}

// --- Festivos ---

/** Domingo de Pascua (algoritmo de Meeus). */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Días que un box suele cerrar o tener a medio gas entre dos fechas: los festivos nacionales, el
 * viernes santo y las vísperas de Navidad y Año Nuevo. Es una propuesta: el plan guarda los cierres
 * que el box confirma.
 */
export function suggestedClosures(from: string, to: string): string[] {
  const out: string[] = [];
  const fixed = [
    "01-01",
    "01-06",
    "05-01",
    "08-15",
    "10-12",
    "11-01",
    "12-06",
    "12-08",
    "12-24",
    "12-25",
    "12-31",
  ];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const md of fixed) out.push(`${year}-${md}`);
    out.push(addDays(easterSunday(year), -2));
  }
  return out.filter((d) => d >= from && d <= to).sort();
}

// --- La estructura del plan ---

export const PLAN_WEEK_TAGS = ["test", "retest", "holiday", "event"] as const;
export type PlanWeekTag = (typeof PLAN_WEEK_TAGS)[number];

export const PlanBlockSchema = z.object({
  kind: PlanBlockKindSchema,
  /** Primera semana del bloque, desde 1. */
  startWeek: z.number().int().min(1).max(60),
  weeks: z.number().int().min(1).max(30),
  emphasis: EmphasisSchema,
  /** El objetivo del bloque en una frase. Nulo: el de su tipo. */
  focus: z.string().trim().max(200).nullable(),
});
export type PlanBlock = z.infer<typeof PlanBlockSchema>;

export const PlanWeekSchema = z.object({
  n: z.number().int().min(1).max(60),
  block: z.number().int().min(0).max(60),
  kind: PlanBlockKindSchema,
  /** Volumen e intensidad previstos, de 0 a 100. */
  volume: z.number().int().min(0).max(100),
  intensity: z.number().int().min(0).max(100),
  /** Papel de cada día, de lunes a domingo. Nulo: sin clase o cerrado. */
  roles: z.array(DayRoleSchema.nullable()).length(7),
  /** Días cerrados (1 = lunes … 7 = domingo). */
  closed: z.array(z.number().int().min(1).max(7)),
  tags: z.array(z.enum(PLAN_WEEK_TAGS)),
});
export type PlanWeek = z.infer<typeof PlanWeekSchema>;

export const PlanStructureSchema = z
  .object({
    discipline: PlanDisciplineSchema,
    blocks: z.array(PlanBlockSchema).min(1).max(30),
    weeks: z.array(PlanWeekSchema).min(1).max(60),
  })
  .refine((s) => s.weeks.every((w, i) => w.n === i + 1 && w.block < s.blocks.length), {
    message: "Semanas numeradas desde 1 y con un bloque que existe.",
  });
export type PlanStructure = z.infer<typeof PlanStructureSchema>;

export interface BuildPlanInput {
  template: PlanTemplate;
  discipline?: PlanDiscipline;
  /** Lunes de la primera semana. */
  startsOn: string;
  weeks: number;
  /** Días con clase de la disciplina (1 = lunes … 7 = domingo). */
  classWeekdays: readonly number[];
  /** Días que el box cierra o va a medio gas. */
  closures?: readonly string[];
  emphasis?: Emphasis;
  tests?: readonly string[];
  /** Secuencia de bloques decidida fuera (el arquitecto con IA); si no, la de la plantilla. */
  phases?: readonly { kind: PlanBlockKind; weeks: number; focus?: string | null }[];
  eventDate?: string | null;
}

const VOLUME_INTENSITY: Record<PlanBlockKind, (pos: number) => [number, number]> = {
  base: (p) => [Math.min(85, 70 + 5 * p), Math.min(75, 60 + 5 * p)],
  build: (p) => [Math.min(85, 75 + 5 * p), Math.min(85, 70 + 5 * p)],
  peak: (p) => [Math.max(55, 70 - 5 * p), Math.min(92, 85 + 3 * p)],
  deload: () => [50, 50],
  maintenance: () => [45, 55],
  test: () => [40, 80],
};

/** Cómo mueve cada tipo de bloque el énfasis del plan. */
const PHASE_SHIFT: Record<PlanBlockKind, Partial<Record<Capacity, number>>> = {
  base: { strength: 1.3, engine: 1.2, intensity: 0.6 },
  build: { gymnastics: 1.25, weightlifting: 1.25, intensity: 1.2, strength: 0.85 },
  peak: { intensity: 1.6, gymnastics: 1.1, strength: 0.7, mobility: 0.8 },
  deload: { mobility: 2, intensity: 0.4 },
  maintenance: { mobility: 1.6, engine: 1.2, intensity: 0.6 },
  test: {},
};

/** Reparte 100 puntos de cinco en cinco respetando proporciones (resto mayor). */
export function normalizeEmphasis(raw: Record<Capacity, number>): Emphasis {
  const total = CAPACITIES.reduce((s, c) => s + Math.max(0, raw[c]), 0) || 1;
  const units = CAPACITIES.map((c) => (Math.max(0, raw[c]) / total) * 20);
  const floor = units.map((u) => Math.floor(u));
  let left = 20 - floor.reduce((s, u) => s + u, 0);
  const order = units
    .map((u, i) => ({ i, r: u - Math.floor(u) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floor[i]! += 1;
    left -= 1;
  }
  return Object.fromEntries(CAPACITIES.map((c, i) => [c, floor[i]! * 5])) as Emphasis;
}

export function blockEmphasis(plan: Emphasis, kind: PlanBlockKind): Emphasis {
  if (kind === "test") return plan;
  const shift = PHASE_SHIFT[kind];
  return normalizeEmphasis(
    Object.fromEntries(CAPACITIES.map((c) => [c, plan[c] * (shift[c] ?? 1)])) as Record<
      Capacity,
      number
    >,
  );
}

/** Reparte `total` semanas entre partes con su peso, sin perder ninguna (resto mayor). */
function apportion(total: number, shares: readonly number[]): number[] {
  const sum = shares.reduce((s, x) => s + x, 0) || 1;
  const raw = shares.map((s) => (s / sum) * total);
  const out = raw.map((r) => Math.floor(r));
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => ({ i, r: r - Math.floor(r) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

/** Semanas de carga de un bloque con sus descargas: una cada cuatro o cinco semanas. */
function withDeloads(kind: PlanBlockKind, count: number): PlanBlockKind[] {
  const deloads = count <= 3 ? 0 : Math.round(count / 5);
  const out: PlanBlockKind[] = Array.from({ length: count }, () => kind);
  for (let k = 1; k <= deloads; k++) {
    const at = Math.round((k * count) / deloads) - 1;
    out[at] = "deload";
  }
  return out;
}

/** Día de la semana (1 = lunes … 7 = domingo) de una fecha. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Construye el plan: semanas de test, semanas festivas (dos o más días de clase cerrados pasan a
 * mantenimiento), bloques de carga con sus descargas, la ola de volumen e intensidad y el papel de
 * cada día. Determinista: los mismos datos dan el mismo plan en la API y en la web.
 */
export function buildPlanStructure(input: BuildPlanInput): PlanStructure {
  const { template } = input;
  const discipline = input.discipline ?? template.discipline;
  const emphasis = input.emphasis ?? template.emphasis;
  const tests = input.tests ?? template.tests;
  const n = Math.max(1, Math.min(60, input.weeks));
  const startsOn = weekStartOf(input.startsOn);
  const closures = new Set(input.closures ?? []);
  const classDays = [...new Set(input.classWeekdays)].sort((a, b) => a - b);

  const closedOf = (week: number) => {
    const monday = addDays(startsOn, (week - 1) * 7);
    return classDays.filter((d) => closures.has(addDays(monday, d - 1)));
  };

  const kinds: (PlanBlockKind | null)[] = Array.from({ length: n }, () => null);
  const tags: PlanWeekTag[][] = Array.from({ length: n }, () => []);
  const focuses: (string | null)[] = Array.from({ length: n }, () => null);

  if (input.phases && input.phases.length > 0) {
    let w = 0;
    for (const p of input.phases) {
      for (let i = 0; i < p.weeks && w < n; i++, w++) {
        kinds[w] = p.kind;
        focuses[w] = p.focus ?? null;
      }
    }
    for (; w < n; w++) kinds[w] = input.phases[input.phases.length - 1]!.kind;
    kinds.forEach((k, i) => {
      if (k === "test") tags[i]!.push(i === 0 ? "test" : "retest");
    });
  } else {
    const hasTests = tests.length > 0 && n >= 4;
    if (hasTests && !template.continuous) {
      kinds[0] = "test";
      tags[0]!.push("test");
      kinds[n - 1] = "test";
      tags[n - 1]!.push("retest");
    }
    for (let i = 0; i < n; i++) {
      if (kinds[i]) continue;
      if (classDays.length > 0 && closedOf(i + 1).length >= 2) {
        kinds[i] = "maintenance";
        tags[i]!.push("holiday");
      }
    }
    const free = kinds.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0);
    const counts = apportion(
      free.length,
      template.phases.map((p) => p.share),
    );
    const sequence = template.phases.flatMap((p, i) => withDeloads(p.kind, counts[i]!));
    free.forEach((slot, i) => {
      kinds[slot] = sequence[i] ?? "base";
    });
    // En planes largos, la última descarga antes de la realización lleva un retest de fuerza.
    const peakAt = kinds.indexOf("peak");
    if (n >= 14 && peakAt > 0 && hasTests) {
      for (let i = peakAt - 1; i >= 0; i--) {
        if (kinds[i] === "deload") {
          tags[i]!.push("retest");
          break;
        }
        if (kinds[i] !== "maintenance") break;
      }
    }
    // Continua: un test cada ocho semanas, en la descarga más cercana.
    if (template.continuous && hasTests) {
      for (let i = 7; i < n; i += 8) {
        const at = kinds.slice(Math.max(0, i - 2), i + 1).lastIndexOf("deload");
        const idx = at >= 0 ? Math.max(0, i - 2) + at : i;
        if (!tags[idx]!.includes("retest")) tags[idx]!.push("retest");
      }
    }
  }
  if (input.eventDate) {
    const idx = Math.floor(daysBetween(startsOn, input.eventDate) / 7);
    if (idx >= 0 && idx < n) tags[idx]!.push("event");
  }

  // Bloques: tramos seguidos del mismo tipo.
  const blocks: PlanBlock[] = [];
  const blockOf: number[] = [];
  kinds.forEach((k, i) => {
    const kind = k ?? "base";
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind && (focuses[i] ?? null) === last.focus) {
      last.weeks += 1;
    } else {
      blocks.push({
        kind,
        startWeek: i + 1,
        weeks: 1,
        emphasis: blockEmphasis(emphasis, kind),
        focus: focuses[i] ?? null,
      });
    }
    blockOf.push(blocks.length - 1);
  });

  const weeks: PlanWeek[] = kinds.map((k, i) => {
    const kind = k ?? "base";
    const block = blocks[blockOf[i]!]!;
    const pos = i + 1 - block.startWeek;
    const [volume, intensity] = VOLUME_INTENSITY[kind](pos);
    const closed = closedOf(i + 1);
    return {
      n: i + 1,
      block: blockOf[i]!,
      kind,
      volume,
      intensity,
      roles: rolesForWeek(discipline, kind, classDays, closed),
      closed,
      tags: tags[i]!,
    };
  });
  return { discipline, blocks, weeks };
}

/** Semana del plan en la que cae una fecha (desde 1), o nula si queda fuera. */
export function planWeekOf(startsOn: string, weeks: number, date: string): number | null {
  const d = daysBetween(weekStartOf(startsOn), date);
  if (d < 0) return null;
  const n = Math.floor(d / 7) + 1;
  return n <= weeks ? n : null;
}

/** Lunes de una semana del plan. */
export function planWeekStart(startsOn: string, n: number): string {
  return addDays(weekStartOf(startsOn), (n - 1) * 7);
}

/** Último día del plan (domingo de su última semana). */
export function planEndsOn(startsOn: string, weeks: number): string {
  return addDays(weekStartOf(startsOn), weeks * 7 - 1);
}

/** El papel de un día concreto del plan. */
export function roleOn(structure: PlanStructure, startsOn: string, date: string): DayRole | null {
  const n = planWeekOf(startsOn, structure.weeks.length, date);
  if (!n) return null;
  return structure.weeks[n - 1]!.roles[isoWeekday(date) - 1] ?? null;
}

// --- Progresiones ---

export interface Prescription {
  movementCode: string;
  sets: number;
  reps: number;
  percent: number;
  /** Semana de test: se busca la máxima. */
  rmReps: 1 | null;
}

const LIFTS: Record<LiftSlot, Partial<Record<PlanBlockKind, string>>> = {
  lower: {
    base: "back_squat",
    build: "front_squat",
    peak: "back_squat",
    deload: "back_squat",
    maintenance: "back_squat",
    test: "back_squat",
  },
  upper: {
    base: "strict_press",
    build: "push_press",
    peak: "push_jerk",
    deload: "strict_press",
    maintenance: "strict_press",
    test: "strict_press",
  },
  olympic: {
    base: "power_clean",
    build: "squat_clean",
    peak: "clean_and_jerk",
    deload: "power_clean",
    maintenance: "power_clean",
    test: "squat_clean",
  },
  olympic_snatch: {
    base: "power_snatch",
    build: "snatch",
    peak: "snatch",
    deload: "power_snatch",
    maintenance: "power_snatch",
    test: "snatch",
  },
  hinge: {
    base: "deadlift",
    build: "deadlift",
    peak: "deadlift",
    deload: "deadlift",
    maintenance: "deadlift",
    test: "deadlift",
  },
};

type Scheme = readonly [number, number, number];
const STRENGTH_SCHEMES: Record<PlanBlockKind, readonly Scheme[]> = {
  base: [
    [5, 5, 70],
    [5, 4, 75],
    [4, 4, 78],
    [4, 3, 82],
    [4, 3, 84],
    [3, 3, 85],
  ],
  build: [
    [4, 3, 80],
    [5, 2, 85],
    [4, 2, 88],
    [3, 2, 90],
    [3, 1, 92],
  ],
  peak: [
    [3, 2, 85],
    [2, 1, 90],
    [2, 1, 92],
  ],
  deload: [[3, 5, 60]],
  maintenance: [[3, 5, 65]],
  test: [[1, 1, 100]],
};
const OLYMPIC_SCHEMES: Record<PlanBlockKind, readonly Scheme[]> = {
  base: [
    [5, 3, 65],
    [5, 3, 70],
    [4, 2, 75],
    [4, 2, 78],
    [5, 2, 78],
    [4, 2, 80],
  ],
  build: [
    [5, 2, 75],
    [4, 2, 80],
    [3, 2, 83],
    [4, 1, 86],
    [3, 1, 88],
  ],
  peak: [
    [3, 1, 85],
    [3, 1, 88],
    [2, 1, 90],
  ],
  deload: [[3, 2, 60]],
  maintenance: [[4, 2, 65]],
  test: [[1, 1, 100]],
};

/** Minutos del día de motor largo por tipo de bloque y semana dentro del bloque. */
const ENGINE_MINUTES: Record<PlanBlockKind, readonly number[]> = {
  base: [25, 28, 32, 35, 35, 38],
  build: [30, 35, 40, 40, 42],
  peak: [30, 30, 25],
  deload: [20],
  maintenance: [25],
  test: [20],
};

/** El levantamiento de un papel en una semana del plan: series, repeticiones y porcentaje. */
export function prescriptionFor(
  structure: PlanStructure,
  week: number,
  role: DayRole,
): Prescription | null {
  const w = structure.weeks[week - 1];
  if (!w) return null;
  const slot = DAY_ROLE_INFO[role].lift;
  if (!slot) return null;
  const movementCode = LIFTS[slot][w.kind];
  if (!movementCode) return null;
  const block = structure.blocks[w.block]!;
  const pos = Math.max(0, week - block.startWeek);
  const olympic = slot === "olympic" || slot === "olympic_snatch";
  const schemes = (olympic ? OLYMPIC_SCHEMES : STRENGTH_SCHEMES)[w.kind];
  const [sets, reps, percent] = schemes[Math.min(pos, schemes.length - 1)]!;
  if (w.kind === "test") return { movementCode, sets: 1, reps: 1, percent: 100, rmReps: 1 };
  return { movementCode, sets, reps, percent, rmReps: null };
}

/** Minutos del motor largo de una semana. */
export function engineMinutesFor(structure: PlanStructure, week: number): number | null {
  const w = structure.weeks[week - 1];
  if (!w) return null;
  const block = structure.blocks[w.block]!;
  const list = ENGINE_MINUTES[w.kind];
  return list[Math.min(Math.max(0, week - block.startWeek), list.length - 1)] ?? null;
}

export interface ProgressionRow {
  movementCode: string;
  role: DayRole;
  /** Por semana, la prescripción o nula si esa semana no hay ese levantamiento. */
  weeks: (Prescription | null)[];
}

/** Tabla de progresiones de un tramo de semanas: un levantamiento por fila. */
export function progressionTable(
  structure: PlanStructure,
  from: number,
  to: number,
): ProgressionRow[] {
  const rows = new Map<string, ProgressionRow>();
  const span = to - from + 1;
  for (let week = from; week <= to; week++) {
    const w = structure.weeks[week - 1];
    if (!w) continue;
    for (const role of w.roles) {
      if (!role) continue;
      const p = prescriptionFor(structure, week, role);
      if (!p) continue;
      const key = `${role}:${p.movementCode}`;
      const row = rows.get(key) ?? {
        movementCode: p.movementCode,
        role,
        weeks: Array.from({ length: span }, () => null),
      };
      row.weeks[week - from] = p;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

/** "4×3 · 82 %", o "1RM" en semana de test. */
export function formatPrescription(p: Prescription): string {
  if (p.rmReps) return "1RM";
  return `${p.sets}×${p.reps} · ${p.percent} %`;
}

// --- Textos del motor ---

/** Nombres que el motor escribe en los borradores, en el idioma del club. */
export const DAY_ROLE_NAMES: Record<DayRole, LocalizedText> = {
  heavy_lower: { es: "Pesado y corto", ca: "Pesat i curt", en: "Heavy and short" },
  gymnastics_engine: {
    es: "Gimnásticos y motor medio",
    ca: "Gimnàstics i motor mitjà",
    en: "Gymnastics and medium engine",
  },
  olympic_metcon: {
    es: "Halterofilia y metcon medio",
    ca: "Halterofília i metcon mitjà",
    en: "Weightlifting and medium metcon",
  },
  long_engine: { es: "Motor largo", ca: "Motor llarg", en: "Long engine" },
  upper_intervals: {
    es: "Fuerza superior e intervalos",
    ca: "Força superior i intervals",
    en: "Upper strength and intervals",
  },
  team: { es: "Por equipos", ca: "Per equips", en: "Team day" },
  skill_mobility: {
    es: "Técnica y movilidad",
    ca: "Tècnica i mobilitat",
    en: "Skill and mobility",
  },
  test: { es: "Test", ca: "Test", en: "Test" },
  benchmark: { es: "Benchmark", ca: "Benchmark", en: "Benchmark" },
  open_sim: { es: "Formato Open", ca: "Format Open", en: "Open format" },
  hyrox_stations: { es: "Carrera y estaciones", ca: "Cursa i estacions", en: "Run and stations" },
  hyrox_strength: { es: "Fuerza para HYROX", ca: "Força per a HYROX", en: "Strength for HYROX" },
  hyrox_sim: { es: "Simulacro", ca: "Simulacre", en: "Race simulation" },
  oly_technique: {
    es: "Técnica de halterofilia",
    ca: "Tècnica d'halterofília",
    en: "Lifting technique",
  },
  oly_strength: { es: "Halterofilia pesada", ca: "Halterofília pesada", en: "Heavy lifting" },
};

export const PLAN_BLOCK_NAMES: Record<PlanBlockKind, LocalizedText> = {
  test: { es: "Test", ca: "Test", en: "Test" },
  base: { es: "Base", ca: "Base", en: "Base" },
  build: { es: "Desarrollo", ca: "Desenvolupament", en: "Build" },
  peak: { es: "Realización", ca: "Realització", en: "Peak" },
  deload: { es: "Descarga", ca: "Descàrrega", en: "Deload" },
  maintenance: { es: "Mantenimiento", ca: "Manteniment", en: "Maintenance" },
};

/** Nombre de un bloque con su ordinal si hay varios del mismo tipo: "Desarrollo II". */
export function blockLabel(structure: PlanStructure, index: number, locale: Locale): string {
  const block = structure.blocks[index];
  if (!block) return "";
  const same = structure.blocks.filter((b) => b.kind === block.kind);
  const base = PLAN_BLOCK_NAMES[block.kind][locale];
  if (same.length < 2 || block.kind === "test" || block.kind === "deload") return base;
  const ordinal = same.indexOf(block) + 1;
  return `${base} ${["I", "II", "III", "IV", "V", "VI"][ordinal - 1] ?? ordinal}`;
}

/** Los niveles en orden, para recorrerlos en la web y en los borradores. */
export const LEVELS_IN_ORDER: readonly WorkoutLevel[] = WORKOUT_LEVELS;

/** Nombre de un movimiento del catálogo en un idioma, o el código si no existe. */
export function movementName(code: string, locale: Locale): string {
  return movementByCode(code)?.name[locale] ?? code;
}
