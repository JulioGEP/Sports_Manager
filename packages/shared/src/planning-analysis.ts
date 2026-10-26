import { CAPACITIES, type Capacity, type DayRole, type TimeDomain } from "./capacities.ts";
import type { WorkoutBlockKind, WorkoutLevel, ScoreType } from "./fitness.ts";
import {
  DAY_ROLE_INFO,
  levelRank,
  MACHINE_KINDS,
  planTestByCode,
  TIME_DOMAIN_RANGE,
  type BoxEquipmentKind,
  type Emphasis,
  type LevelCapacity,
  type Prescription,
} from "./planning.ts";
import { addDays, daysBetween, weekStartOf } from "./training-load.ts";

/**
 * Lo que la planificación mide y comprueba (ADR 0052): qué se puede esperar del plan, si las
 * combinaciones de días habituales del box tocan lo que toca, si una sesión cabe en la sala, cómo
 * fue la semana frente a lo previsto, la salud de la programación y el nivel que se sugiere a cada
 * atleta. Reglas puras y explicables: cada cifra dice de dónde sale.
 */

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
export { median as medianOf };

// --- Proyección ---

export const PROJECTION_BANDS = ["down", "maintain", "up_little", "up", "up_clear"] as const;
export type ProjectionBand = (typeof PROJECTION_BANDS)[number];

export interface ProjectionInput {
  emphasis: Emphasis;
  weeks: number;
  /** Días por semana de referencia: 2, 3 o 4 (o más). */
  frequency: number;
  /** Reparto de niveles del box (proporciones). Sin datos, uno intermedio. */
  levelMix?: Partial<Record<WorkoutLevel, number>>;
  /**
   * Calibración del box: resultado real del último retest entre lo previsto (1 si no hay). Se
   * limita entre 0,5 y 1,5 para que un ciclo raro no dispare la siguiente proyección.
   */
  calibration?: number;
  tests: readonly string[];
}

export interface ProjectedTest {
  code: string;
  /** "percent": mejora en porcentaje (en tiempos, cuánto baja); "reps": repeticiones más. */
  unit: "percent" | "reps";
  low: number;
  high: number;
}

export interface Projection {
  frequencyFactor: number;
  capacities: { capacity: Capacity; points: number; band: ProjectionBand; gain: number }[];
  tests: ProjectedTest[];
}

export function frequencyFactor(frequency: number): number {
  if (frequency <= 2) return 0.6;
  if (frequency === 3) return 1;
  return 1.25;
}

/** Quien empieza progresa más deprisa: el reparto de niveles del box mueve la proyección. */
function levelFactor(mix: ProjectionInput["levelMix"]): number {
  const total = Object.values(mix ?? {}).reduce((s, v) => s + (v ?? 0), 0);
  if (!mix || total <= 0) return 1;
  const share = (l: WorkoutLevel) => (mix[l] ?? 0) / total;
  return 1 + 0.4 * share("foundations") + 0.15 * share("scaled") - 0.15 * share("rx_plus");
}

/**
 * Qué se puede esperar del plan: una banda por capacidad y un rango por test. Reglas sencillas y
 * conservadoras (por punto de énfasis y por 16 semanas, ajustadas por frecuencia, nivel y la
 * calibración del box). Siempre un rango, nunca una cifra: es orientativo.
 */
export function projectPlan(input: ProjectionInput): Projection {
  const ff = frequencyFactor(input.frequency);
  const time = Math.min(1.25, Math.max(0.25, input.weeks / 16));
  const cal = Math.min(1.5, Math.max(0.5, input.calibration ?? 1));
  const k = ff * time * levelFactor(input.levelMix) * cal;
  const capacities = CAPACITIES.map((capacity) => {
    const p = input.emphasis[capacity];
    const e = p * ff * Math.min(1.2, input.weeks / 12);
    let band: ProjectionBand;
    if (p < 10) band = p === 0 ? "down" : "maintain";
    else if (e < 12) band = "maintain";
    else if (e < 22) band = "up_little";
    else if (e < 32) band = "up";
    else band = "up_clear";
    const gain = p < 10 ? -(10 - p) * 0.6 : p * 0.55 * ff;
    return { capacity, points: p, band, gain };
  });
  const tests: ProjectedTest[] = [];
  for (const code of input.tests) {
    const test = planTestByCode(code);
    if (!test) continue;
    const pts = Object.entries(test.weights).reduce(
      (s, [c, w]) => s + input.emphasis[c as Capacity] * (w ?? 0),
      0,
    );
    if (test.kind === "reps") {
      tests.push({ code, unit: "reps", low: pts * 0.06 * k, high: pts * 0.12 * k });
    } else if (test.kind === "movement") {
      tests.push({ code, unit: "percent", low: pts * 0.12 * k, high: pts * 0.24 * k });
    } else if (test.weights.engine === 1) {
      tests.push({ code, unit: "percent", low: pts * 0.12 * k, high: pts * 0.24 * k });
    } else {
      tests.push({ code, unit: "percent", low: pts * 0.4 * k, high: pts * 0.8 * k });
    }
  }
  return { frequencyFactor: ff, capacities, tests };
}

/** Aplica un rango de mejora a una marca de partida: kilos, segundos o repeticiones. */
export function projectedValue(
  code: string,
  baseline: number,
  range: ProjectedTest,
): { low: number; high: number } {
  const test = planTestByCode(code);
  if (range.unit === "reps")
    return { low: Math.floor(baseline + range.low), high: Math.ceil(baseline + range.high) };
  const lower = test?.lowerIsBetter ?? false;
  const lo = lower ? baseline * (1 - range.high / 100) : baseline * (1 + range.low / 100);
  const hi = lower ? baseline * (1 - range.low / 100) : baseline * (1 + range.high / 100);
  return { low: Math.min(lo, hi), high: Math.max(lo, hi) };
}

/**
 * Calibración de un ciclo terminado: mejora real media entre la mejora media prevista. Se usa en la
 * proyección del siguiente plan de la misma disciplina.
 */
export function calibrationOf(
  pairs: readonly { predictedPct: number; realPct: number }[],
): number | null {
  const useful = pairs.filter((p) => p.predictedPct > 0);
  if (useful.length === 0) return null;
  const real = useful.reduce((s, p) => s + p.realPct, 0) / useful.length;
  const predicted = useful.reduce((s, p) => s + p.predictedPct, 0) / useful.length;
  return predicted > 0 ? Math.min(1.5, Math.max(0.5, real / predicted)) : null;
}

/** Mejora de una marca en porcentaje (en tiempos, cuánto ha bajado). */
export function improvementPct(code: string, from: number, to: number): number {
  if (from <= 0) return 0;
  const lower = planTestByCode(code)?.lowerIsBetter ?? false;
  return lower ? ((from - to) / from) * 100 : ((to - from) / from) * 100;
}

// --- Cobertura por frecuencia ---

export interface DayCombo {
  /** Días de la semana (1 = lunes … 7 = domingo). */
  days: number[];
  /** Parte de los atletas que vienen ese número de días y lo hacen así (0 a 1). */
  share: number;
  /** Semanas-atleta observadas con esa combinación. */
  count: number;
}

/**
 * Las combinaciones de días más habituales del box en las últimas semanas: por atleta y semana,
 * qué días vino. Solo semanas de 2 y 3 días, que son las que pierden estímulos si el plan se
 * escribe para quien viene seis.
 */
export function frequentCombos(
  attendance: readonly { playerId: string; date: string }[],
  limit = 3,
): DayCombo[] {
  const byWeek = new Map<string, Set<number>>();
  for (const a of attendance) {
    const key = `${a.playerId}|${weekStartOf(a.date)}`;
    const set = byWeek.get(key) ?? new Set<number>();
    set.add(isoDay(a.date));
    byWeek.set(key, set);
  }
  const groups = new Map<number, Map<string, number>>();
  for (const set of byWeek.values()) {
    if (set.size < 2 || set.size > 3) continue;
    const key = [...set].sort((a, b) => a - b).join(",");
    const group = groups.get(set.size) ?? new Map<string, number>();
    group.set(key, (group.get(key) ?? 0) + 1);
    groups.set(set.size, group);
  }
  const out: DayCombo[] = [];
  for (const [, group] of [...groups.entries()].sort((a, b) => b[0] - a[0])) {
    const total = [...group.values()].reduce((s, v) => s + v, 0);
    for (const [key, count] of group) {
      out.push({ days: key.split(",").map(Number), share: count / total, count });
    }
  }
  return out
    .filter((c) => c.share >= 0.1 && c.count >= 2)
    .sort((a, b) => b.days.length - a.days.length || b.share - a.share)
    .reduce<DayCombo[]>((acc, c) => {
      if (acc.filter((x) => x.days.length === c.days.length).length < limit) acc.push(c);
      return acc;
    }, []);
}

/** Reparto de días por semana: cuántas semanas-atleta de 1, 2, 3, 4 o más días. */
export function frequencyDistribution(
  attendance: readonly { playerId: string; date: string }[],
): { days: number; share: number }[] {
  const byWeek = new Map<string, Set<string>>();
  for (const a of attendance) {
    const key = `${a.playerId}|${weekStartOf(a.date)}`;
    const set = byWeek.get(key) ?? new Set<string>();
    set.add(a.date);
    byWeek.set(key, set);
  }
  const counts = new Map<number, number>();
  for (const set of byWeek.values()) {
    const d = Math.min(4, set.size);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((s, v) => s + v, 0) || 1;
  return [1, 2, 3, 4].map((days) => ({ days, share: (counts.get(days) ?? 0) / total }));
}

/** Días por semana de media de quien viene. */
export function averageFrequency(
  attendance: readonly { playerId: string; date: string }[],
): number | null {
  const byWeek = new Map<string, Set<string>>();
  for (const a of attendance) {
    const key = `${a.playerId}|${weekStartOf(a.date)}`;
    const set = byWeek.get(key) ?? new Set<string>();
    set.add(a.date);
    byWeek.set(key, set);
  }
  if (byWeek.size === 0) return null;
  return [...byWeek.values()].reduce((s, v) => s + v.size, 0) / byWeek.size;
}

function isoDay(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Lo esencial de un bloque: las capacidades con 15 puntos o más (sin la movilidad). */
export function essentialCapacities(emphasis: Emphasis): Capacity[] {
  return CAPACITIES.filter((c) => c !== "mobility" && c !== "intensity" && emphasis[c] >= 15);
}

export interface ComboCoverage {
  days: number[];
  share: number;
  covered: Capacity[];
  /** Lo que falta y el día de la combinación donde se añade como complemento. */
  missing: { capacity: Capacity; addTo: number }[];
}

/**
 * Si cada combinación habitual toca lo esencial del bloque con los papeles de la semana (y los
 * complementos ya añadidos). Lo que falta se propone en el día más suave de la combinación.
 */
export function coverageOf(
  roles: readonly (DayRole | null)[],
  combos: readonly DayCombo[],
  required: readonly Capacity[],
  complements: readonly { weekday: number; capacity: Capacity }[] = [],
): ComboCoverage[] {
  return combos.map((combo) => {
    const touched = new Set<Capacity>();
    for (const d of combo.days) {
      const role = roles[d - 1];
      if (role) for (const c of DAY_ROLE_INFO[role].covers) touched.add(c);
      for (const x of complements) if (x.weekday === d) touched.add(x.capacity);
    }
    const playable = combo.days.filter((d) => roles[d - 1]);
    const softest = [...playable].sort((a, b) => {
      const ea = DAY_ROLE_INFO[roles[a - 1]!].effort;
      const eb = DAY_ROLE_INFO[roles[b - 1]!].effort;
      return ea - eb || a - b;
    })[0];
    const missing = required
      .filter((c) => !touched.has(c))
      .map((capacity) => ({ capacity, addTo: softest ?? combo.days[0]! }));
    return {
      days: combo.days,
      share: combo.share,
      covered: required.filter((c) => touched.has(c)),
      missing: softest ? missing : [],
    };
  });
}

// --- Patrones de movimiento ---

export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "press_vertical",
  "press_horizontal",
  "pull",
  "olympic",
  "gymnastics_bar",
  "run",
  "machine",
  "jump",
  "core",
  "carry",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

const MOVEMENT_PATTERN: Record<string, MovementPattern[]> = {
  back_squat: ["squat"],
  front_squat: ["squat"],
  overhead_squat: ["squat", "press_vertical"],
  deadlift: ["hinge"],
  sumo_deadlift: ["hinge"],
  bench_press: ["press_horizontal"],
  strict_press: ["press_vertical"],
  push_press: ["press_vertical"],
  push_jerk: ["press_vertical", "olympic"],
  split_jerk: ["press_vertical", "olympic"],
  clean: ["olympic", "squat"],
  power_clean: ["olympic", "hinge"],
  squat_clean: ["olympic", "squat"],
  clean_and_jerk: ["olympic", "squat", "press_vertical"],
  snatch: ["olympic", "squat", "press_vertical"],
  power_snatch: ["olympic", "press_vertical"],
  thruster: ["squat", "press_vertical"],
  hip_thrust: ["hinge"],
  weighted_pull_up: ["pull", "gymnastics_bar"],
  weighted_dip: ["press_horizontal"],
};

const KEYWORDS: [RegExp, MovementPattern[]][] = [
  [/squat|sentadilla|lunge|zancada|step-?up|wall ?ball|thruster/i, ["squat"]],
  [/deadlift|peso muerto|pes mort|rdl|swing|good ?morning|kettlebell swing/i, ["hinge"]],
  [/press|jerk|handstand|hspu|pino/i, ["press_vertical"]],
  [/push-?up|flexi|bench|dip|fons|fondo/i, ["press_horizontal"]],
  [/pull-?up|dominad|chest to bar|row(?!er)|remo con|ring row|rope|cuerda/i, ["pull"]],
  [/muscle-?up|toes to bar|t2b|pull-?up|dominad|chest to bar|kipping/i, ["gymnastics_bar"]],
  [/clean|snatch|arrancada|cargada|dos tiempos/i, ["olympic"]],
  [/\brun\b|carrera|correr|running|cursa/i, ["run"]],
  [/rower|remo\b|rem\b|bike|bici|ski/i, ["machine"]],
  [/jump|salto|burpee|double ?under|comba|box jump/i, ["jump"]],
  [/hollow|plank|plancha|sit-?up|v-?up|abdominal|core|l-?sit/i, ["core"]],
  [/carry|farmer|sled|trineo|yoke|yugo/i, ["carry"]],
];

/** Los patrones que trabaja un ejercicio: por su movimiento del catálogo, su material y su nombre. */
export function patternsOfExercise(ex: {
  name: string;
  category?: string | null;
  equipment?: readonly string[];
  movementCode?: string | null;
}): MovementPattern[] {
  const out = new Set<MovementPattern>();
  if (ex.movementCode) for (const p of MOVEMENT_PATTERN[ex.movementCode] ?? []) out.add(p);
  for (const [re, ps] of KEYWORDS) if (re.test(ex.name)) for (const p of ps) out.add(p);
  for (const k of ex.equipment ?? []) {
    if ((MACHINE_KINDS as readonly string[]).includes(k)) out.add("machine");
    if (k === "jump_rope" || k === "box") out.add("jump");
    if (k === "sled" || k === "yoke") out.add("carry");
    if (k === "pullup_bar" || k === "rings") out.add("pull");
  }
  if (ex.category === "weightlifting") out.add("olympic");
  return [...out];
}

// --- Validador de sesiones ---

export const VALIDATION_CHECKS = [
  "equipment",
  "logistics",
  "time",
  "exercises",
  "pattern",
  "levels",
  "progression",
] as const;
export type ValidationCheck = (typeof VALIDATION_CHECKS)[number];
export type ValidationStatus = "ok" | "warn" | "fail";

export interface ValidationResult {
  check: ValidationCheck;
  status: ValidationStatus;
  /** Datos para explicarlo: material que falta, minutos, oleadas, bloques… */
  params: Record<string, string | number>;
}

export interface ValidationBlock {
  label: string;
  kind: WorkoutBlockKind;
  track: "class" | "plus";
  scoreType: ScoreType;
  plannedMinutes: number | null;
  movementCode: string | null;
  percent: number | null;
  /** Material de los ejercicios enlazados. */
  equipment: readonly string[];
  /** Patrones de los ejercicios enlazados y del movimiento. */
  patterns: readonly MovementPattern[];
  exercises: number;
  hasLevels: { foundations: boolean; scaled: boolean; rx: boolean; rxPlus: boolean };
}

export type LogisticsMode = "ok" | "pool" | "partners" | "waves" | "short";

export interface BlockLogistics {
  label: string;
  /** Material que más limita. */
  kind: BoxEquipmentKind | "machines";
  available: number;
  needed: number;
  mode: LogisticsMode;
  waves: number;
}

/** Cómo cabe un bloque en la sala: una oleada, por parejas, en oleadas o no cabe. */
export function logisticsOf(
  block: Pick<ValidationBlock, "label" | "equipment">,
  inventory: ReadonlyMap<BoxEquipmentKind, number>,
  classSize: number,
): BlockLogistics | null {
  if (classSize <= 0 || inventory.size === 0) return null;
  const kinds = [...new Set(block.equipment)].filter(
    (k): k is BoxEquipmentKind =>
      k !== "bodyweight" && k !== "other" && inventory.has(k as BoxEquipmentKind),
  );
  const machines = kinds.filter((k) => (MACHINE_KINDS as readonly string[]).includes(k));
  const pooled = machines.length >= 2;
  const candidates: { kind: BoxEquipmentKind | "machines"; available: number }[] = [];
  if (pooled)
    candidates.push({
      kind: "machines",
      available: MACHINE_KINDS.reduce((s, k) => s + (inventory.get(k) ?? 0), 0),
    });
  for (const k of kinds) {
    if (pooled && (MACHINE_KINDS as readonly string[]).includes(k)) continue;
    // Barras de dominadas y cajones se comparten sin problema hasta el doble.
    candidates.push({ kind: k, available: inventory.get(k) ?? 0 });
  }
  if (candidates.length === 0) return null;
  const worst = candidates.sort((a, b) => a.available - b.available)[0]!;
  let mode: LogisticsMode;
  let waves = 1;
  if (worst.available >= classSize) mode = pooled && worst.kind === "machines" ? "pool" : "ok";
  else if (worst.available === 0) {
    mode = "short";
    waves = 0;
  } else if (worst.available * 2 >= classSize) mode = "partners";
  else {
    waves = Math.ceil(classSize / worst.available);
    mode = waves <= 3 ? "waves" : "short";
  }
  // Con máquinas en bolsa y uno o dos que sobran, el que sobra corre.
  if (
    pooled &&
    worst.kind === "machines" &&
    classSize - worst.available <= 2 &&
    worst.available > 0
  )
    mode = "pool";
  return {
    label: block.label,
    kind: worst.kind,
    available: worst.available,
    needed: classSize,
    mode,
    waves,
  };
}

export interface ValidateInput {
  blocks: readonly ValidationBlock[];
  inventory: ReadonlyMap<BoxEquipmentKind, number>;
  /** Plazas de la clase más grande de ese día. */
  classSize: number;
  classMinutes: number;
  /** Patrones dominantes del día anterior con barra pesada. */
  previousHeavy: readonly MovementPattern[];
  prescriptions: readonly Prescription[];
}

const SCORED: readonly WorkoutBlockKind[] = ["wod", "accessory"];

/**
 * Las comprobaciones de una sesión antes de que llegue al coach: material, logística, tiempo,
 * ejercicios de la biblioteca, patrón repetido, niveles y progresión del plan.
 */
export function validateSession(input: ValidateInput): ValidationResult[] {
  const out: ValidationResult[] = [];
  const cls = input.blocks.filter((b) => b.track === "class");

  if (input.inventory.size === 0)
    out.push({ check: "equipment", status: "warn", params: { reason: "no_inventory" } });
  else {
    const missing = [
      ...new Set(
        cls
          .flatMap((b) => b.equipment)
          .filter(
            (k) =>
              k !== "bodyweight" &&
              k !== "other" &&
              (input.inventory.get(k as BoxEquipmentKind) ?? 0) === 0,
          ),
      ),
    ];
    out.push(
      missing.length > 0
        ? { check: "equipment", status: "fail", params: { kinds: missing.join(",") } }
        : { check: "equipment", status: "ok", params: {} },
    );
  }

  const logistics = cls
    .map((b) => logisticsOf(b, input.inventory, input.classSize))
    .filter((l): l is BlockLogistics => l !== null);
  const short = logistics.find((l) => l.mode === "short");
  const waves = logistics.find((l) => l.mode === "waves");
  if (short)
    out.push({
      check: "logistics",
      status: "fail",
      params: {
        block: short.label,
        kind: short.kind,
        available: short.available,
        needed: short.needed,
      },
    });
  else if (waves)
    out.push({
      check: "logistics",
      status: "warn",
      params: { block: waves.label, kind: waves.kind, waves: waves.waves },
    });
  else out.push({ check: "logistics", status: "ok", params: {} });

  const unknown = cls.filter((b) => b.plannedMinutes === null).length;
  const minutes =
    cls.reduce((s, b) => s + (b.plannedMinutes ?? 0), 0) + Math.max(0, cls.length - 1) * 2;
  if (unknown > 0 && minutes === 0)
    out.push({ check: "time", status: "warn", params: { reason: "unknown" } });
  else if (minutes > input.classMinutes)
    out.push({
      check: "time",
      status: "fail",
      params: { minutes, classMinutes: input.classMinutes },
    });
  else
    out.push({
      check: "time",
      status: unknown > 0 ? "warn" : "ok",
      params: { minutes, classMinutes: input.classMinutes },
    });

  const noExercises = cls.filter(
    (b) => b.kind !== "warmup" && b.kind !== "cooldown" && b.exercises === 0 && !b.movementCode,
  );
  out.push(
    noExercises.length > 0
      ? {
          check: "exercises",
          status: "warn",
          params: { blocks: noExercises.map((b) => b.label).join(", ") },
        }
      : { check: "exercises", status: "ok", params: {} },
  );

  const heavyToday = cls
    .filter((b) => b.kind === "strength" && (b.percent ?? 0) >= 75)
    .flatMap((b) => b.patterns);
  const repeated = heavyToday.filter((p) => input.previousHeavy.includes(p) && p !== "core");
  out.push(
    repeated.length > 0
      ? { check: "pattern", status: "warn", params: { patterns: [...new Set(repeated)].join(",") } }
      : { check: "pattern", status: "ok", params: {} },
  );

  const missingLevels = cls.filter(
    (b) =>
      SCORED.includes(b.kind) &&
      (!b.hasLevels.scaled || !b.hasLevels.rx || !b.hasLevels.foundations),
  );
  out.push(
    missingLevels.length > 0
      ? {
          check: "levels",
          status: "warn",
          params: { blocks: missingLevels.map((b) => b.label).join(", ") },
        }
      : { check: "levels", status: "ok", params: {} },
  );

  const off = input.prescriptions.filter((p) => {
    const block = cls.find((b) => b.kind === "strength" && b.movementCode === p.movementCode);
    return block && !p.rmReps && block.percent !== null && Math.abs(block.percent - p.percent) > 2;
  });
  out.push(
    off.length > 0
      ? {
          check: "progression",
          status: "warn",
          params: { movement: off[0]!.movementCode, percent: off[0]!.percent },
        }
      : { check: "progression", status: "ok", params: {} },
  );
  return out;
}

/** El peor estado de una lista de comprobaciones. */
export function worstStatus(results: readonly ValidationResult[]): ValidationStatus {
  if (results.some((r) => r.status === "fail")) return "fail";
  if (results.some((r) => r.status === "warn")) return "warn";
  return "ok";
}

// --- Límites de la semana ---

export interface WeekLimit {
  code: "overhead_days" | "heavy_streak" | "run_days" | "jump_days";
  value: number;
  max: number;
}

/**
 * Límites que vigila el validador en una semana: días con hombro por encima de la cabeza, días
 * seguidos de barra pesada, días con carrera y días con saltos.
 */
export function weekLimits(
  days: readonly { weekday: number; patterns: readonly MovementPattern[]; heavy: boolean }[],
): WeekLimit[] {
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday);
  const count = (p: MovementPattern) => sorted.filter((d) => d.patterns.includes(p)).length;
  let streak = 0;
  let best = 0;
  let prev = -1;
  for (const d of sorted) {
    if (d.heavy) {
      streak = prev === d.weekday - 1 && streak > 0 ? streak + 1 : 1;
      best = Math.max(best, streak);
    } else streak = 0;
    prev = d.weekday;
  }
  return [
    { code: "overhead_days", value: count("press_vertical"), max: 3 },
    { code: "heavy_streak", value: best, max: 2 },
    { code: "run_days", value: count("run"), max: 4 },
    { code: "jump_days", value: count("jump"), max: 4 },
  ];
}

// --- Revisión del domingo ---

export type Modality = "run" | "row" | "other";

export interface ReviewBlockInput {
  id: string;
  kind: WorkoutBlockKind;
  scoreType: ScoreType;
  timeCapSeconds: number | null;
  plannedMinutes: number | null;
  movementCode: string | null;
  percent: number | null;
  modality: Modality;
  results: readonly { timeSeconds: number | null; completed: boolean; effort: number | null }[];
}

export interface ReviewDayInput {
  workoutId: string;
  date: string;
  role: DayRole | null;
  domain: TimeDomain | null;
  effort: number | null;
  attendees: number;
  blocks: readonly ReviewBlockInput[];
}

export type ReviewVerdict = "as_planned" | "longer" | "shorter" | "harder" | "easier" | "no_data";

export interface ReviewRow {
  workoutId: string;
  date: string;
  role: DayRole | null;
  metric: "minutes" | "effort" | "completion";
  /** Banda prevista y valor real (mediana o media). */
  low: number;
  high: number;
  value: number | null;
  scaleMax: number;
  verdict: ReviewVerdict;
  samples: number;
  modality: Modality;
  movementCode: string | null;
  percent: number | null;
}

export interface ReviewNextBlock {
  id: string;
  kind: WorkoutBlockKind;
  timeCapSeconds: number | null;
  plannedMinutes: number | null;
  movementCode: string | null;
  percent: number | null;
  modality: Modality;
}

export interface ReviewNextDay {
  workoutId: string;
  date: string;
  role: DayRole | null;
  feel: string | null;
  blocks: readonly ReviewNextBlock[];
}

export const ADJUSTMENT_KINDS = ["cap", "pace", "percent", "coverage"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export interface Adjustment {
  /** Estable entre lecturas: decide si ya se aceptó o descartó. */
  key: string;
  kind: AdjustmentKind;
  workoutId: string;
  date: string;
  blockId: string | null;
  /** Lo de antes y lo de después, en datos: la web lo escribe en su idioma. */
  params: Record<string, string | number>;
}

export interface ReviewLearned {
  code: "time_run" | "time_row" | "time_other" | "effort_long_engine" | "attendance_saturday";
  value: number;
  samples: number;
}

export interface WeekReview {
  rows: ReviewRow[];
  kpis: {
    fulfilled: number;
    attendees: number;
    usualAttendees: number | null;
    effort: number | null;
    plannedEffort: number | null;
    logged: number;
  };
  adjustments: Adjustment[];
  learned: ReviewLearned[];
}

export interface ReviewInput {
  days: readonly ReviewDayInput[];
  /** Asistencia media de las cuatro semanas anteriores. */
  usualAttendees: number | null;
  /** Resultados apuntados entre asistencias a clases con WOD (0 a 1). */
  logged: number;
  next: readonly ReviewNextDay[];
  /** Huecos de cobertura de la semana siguiente. */
  gaps: readonly { weekday: number; capacity: Capacity; days: number[] }[];
  /** Asistencia media por día de la semana de las últimas semanas (1 = lunes). */
  attendanceByWeekday?: Readonly<Record<number, number>>;
}

const midpoint = (lo: number, hi: number) => (lo + hi) / 2;

/**
 * La revisión de una semana: por día, lo previsto frente a lo que pasó (minutos del WOD, esfuerzo o
 * series completas), qué ha aprendido el box y los ajustes para la semana siguiente.
 */
export function reviewWeek(input: ReviewInput): WeekReview {
  const rows: ReviewRow[] = [];
  const ratios: Record<Modality, number[]> = { run: [], row: [], other: [] };
  const longEngineDelta: number[] = [];

  for (const day of input.days) {
    const timed = day.blocks.find((b) => b.kind === "wod" && b.scoreType === "time");
    const strength = day.blocks.find((b) => b.kind === "strength" && b.percent !== null);
    if (timed && day.domain) {
      const [lo, hi] = TIME_DOMAIN_RANGE[day.domain];
      const times = timed.results
        .filter((r) => r.completed && r.timeSeconds)
        .map((r) => r.timeSeconds! / 60);
      const value = median(times);
      let verdict: ReviewVerdict = "no_data";
      if (value !== null) {
        verdict = value > hi * 1.05 ? "longer" : value < lo * 0.9 ? "shorter" : "as_planned";
        ratios[timed.modality].push(value / midpoint(lo, hi));
      }
      rows.push({
        workoutId: day.workoutId,
        date: day.date,
        role: day.role,
        metric: "minutes",
        low: lo,
        high: hi,
        value,
        scaleMax: Math.max(hi * 1.6, (value ?? 0) * 1.15),
        verdict,
        samples: times.length,
        modality: timed.modality,
        movementCode: null,
        percent: null,
      });
      continue;
    }
    if (strength && day.role && DAY_ROLE_INFO[day.role].lift) {
      const res = strength.results;
      const value =
        res.length > 0 ? (res.filter((r) => r.completed).length / res.length) * 100 : null;
      rows.push({
        workoutId: day.workoutId,
        date: day.date,
        role: day.role,
        metric: "completion",
        low: 80,
        high: 100,
        value,
        scaleMax: 100,
        verdict: value === null ? "no_data" : value >= 75 ? "as_planned" : "harder",
        samples: res.length,
        modality: "other",
        movementCode: strength.movementCode,
        percent: strength.percent,
      });
      continue;
    }
    const target = day.effort;
    if (target !== null) {
      const efforts = day.blocks
        .flatMap((b) => b.results.map((r) => r.effort))
        .filter((e): e is number => e !== null);
      const value = efforts.length > 0 ? efforts.reduce((s, e) => s + e, 0) / efforts.length : null;
      let verdict: ReviewVerdict = "no_data";
      if (value !== null)
        verdict =
          value > target + 0.75 ? "harder" : value < target - 0.75 ? "easier" : "as_planned";
      if (value !== null && day.role === "long_engine") longEngineDelta.push(value - target);
      rows.push({
        workoutId: day.workoutId,
        date: day.date,
        role: day.role,
        metric: "effort",
        low: Math.max(1, target - 0.5),
        high: Math.min(5, target + 0.5),
        value,
        scaleMax: 5,
        verdict,
        samples: efforts.length,
        modality: "other",
        movementCode: null,
        percent: null,
      });
    }
  }

  const learned: ReviewLearned[] = [];
  for (const [m, list] of Object.entries(ratios) as [Modality, number[]][]) {
    if (list.length === 0) continue;
    const code = m === "run" ? "time_run" : m === "row" ? "time_row" : "time_other";
    learned.push({ code, value: (median(list)! - 1) * 100, samples: list.length });
  }
  if (longEngineDelta.length > 0)
    learned.push({
      code: "effort_long_engine",
      value: longEngineDelta.reduce((s, v) => s + v, 0) / longEngineDelta.length,
      samples: longEngineDelta.length,
    });
  const byWeekday = input.attendanceByWeekday;
  if (byWeekday && byWeekday[6] !== undefined) {
    const others = Object.entries(byWeekday)
      .filter(([d]) => Number(d) !== 6)
      .map(([, v]) => v);
    const avg = others.length ? others.reduce((s, v) => s + v, 0) / others.length : 0;
    if (avg > 0)
      learned.push({
        code: "attendance_saturday",
        value: ((byWeekday[6] - avg) / avg) * 100,
        samples: others.length + 1,
      });
  }

  // Ajustes para la semana siguiente.
  const adjustments: Adjustment[] = [];
  for (const row of rows) {
    if (row.metric === "minutes" && row.verdict === "longer" && row.value !== null) {
      const ratio = row.value / midpoint(row.low, row.high);
      const target = input.next.find(
        (d) =>
          d.role === row.role &&
          d.blocks.some((b) => b.kind === "wod" && (b.timeCapSeconds || b.plannedMinutes)),
      );
      const block = target?.blocks.find(
        (b) => b.kind === "wod" && (b.timeCapSeconds || b.plannedMinutes),
      );
      if (target && block) {
        const before = Math.round((block.timeCapSeconds ?? block.plannedMinutes! * 60) / 60);
        const after = Math.max(3, Math.round(before / Math.min(1.5, ratio)));
        if (after < before)
          adjustments.push({
            key: `cap:${target.workoutId}:${block.id}`,
            kind: "cap",
            workoutId: target.workoutId,
            date: target.date,
            blockId: block.id,
            params: {
              before,
              after,
              real: Math.round(row.value * 60),
              low: row.low,
              high: row.high,
              pct: Math.round((ratio - 1) * 100),
            },
          });
      }
    }
    if (row.metric === "effort" && row.verdict === "harder" && row.value !== null) {
      const target = input.next.find((d) => d.role === row.role);
      if (target)
        adjustments.push({
          key: `pace:${target.workoutId}`,
          kind: "pace",
          workoutId: target.workoutId,
          date: target.date,
          blockId: null,
          params: { real: Math.round(row.value * 10) / 10, target: midpoint(row.low, row.high) },
        });
    }
    if (
      row.metric === "completion" &&
      row.verdict === "harder" &&
      row.movementCode &&
      row.percent !== null
    ) {
      const target = input.next.find((d) =>
        d.blocks.some(
          (b) => b.kind === "strength" && b.movementCode === row.movementCode && b.percent !== null,
        ),
      );
      const block = target?.blocks.find(
        (b) => b.kind === "strength" && b.movementCode === row.movementCode,
      );
      if (target && block && block.percent !== null && block.percent > row.percent)
        adjustments.push({
          key: `percent:${target.workoutId}:${block.id}`,
          kind: "percent",
          workoutId: target.workoutId,
          date: target.date,
          blockId: block.id,
          params: {
            movement: row.movementCode,
            before: block.percent,
            after: row.percent,
            completion: Math.round(row.value ?? 0),
          },
        });
    }
  }
  for (const gap of input.gaps) {
    const target = input.next.find((d) => isoDay(d.date) === gap.weekday);
    if (!target) continue;
    adjustments.push({
      key: `coverage:${target.workoutId}:${gap.capacity}`,
      kind: "coverage",
      workoutId: target.workoutId,
      date: target.date,
      blockId: target.blocks.find((b) => b.kind === "warmup")?.id ?? null,
      params: { capacity: gap.capacity, days: gap.days.join(",") },
    });
  }

  const attendees = input.days.reduce((s, d) => s + d.attendees, 0);
  const asPlanned = rows.filter((r) => r.verdict === "as_planned").length;
  const measured = rows.filter((r) => r.verdict !== "no_data").length;
  const efforts = input.days.flatMap((d) =>
    d.blocks.flatMap((b) => b.results.map((r) => r.effort)).filter((e): e is number => e !== null),
  );
  const planned = input.days.map((d) => d.effort).filter((e): e is number => e !== null);
  return {
    rows,
    kpis: {
      fulfilled: measured > 0 ? Math.round((asPlanned / measured) * 100) : 0,
      attendees,
      usualAttendees: input.usualAttendees,
      effort: efforts.length
        ? Math.round((efforts.reduce((s, e) => s + e, 0) / efforts.length) * 10) / 10
        : null,
      plannedEffort: planned.length
        ? Math.round((planned.reduce((s, e) => s + e, 0) / planned.length) * 10) / 10
        : null,
      logged: Math.round(input.logged * 100),
    },
    adjustments,
    learned,
  };
}

/** Por qué modalidad se mide un WOD: carrera, remo u otra. */
export function modalityOf(
  patterns: readonly MovementPattern[],
  equipment: readonly string[],
): Modality {
  if (patterns.includes("run")) return "run";
  if (equipment.includes("rower")) return "row";
  return "other";
}

// --- Nivel sugerido ---

export type LevelReason = "new" | "completed" | "frequent" | "default";

export interface LevelSuggestion {
  capacity: LevelCapacity;
  level: WorkoutLevel;
  reason: LevelReason;
}

/**
 * El nivel que se sugiere a un atleta en cada capacidad. Iniciación en sus primeros tres meses si
 * no ha hecho nada más exigente; si no, el más alto que ha completado al menos dos veces en los
 * últimos 60 días; si no, el que más usa; y Scaled por defecto.
 */
export function suggestLevels(
  results: readonly {
    capacity: LevelCapacity;
    level: WorkoutLevel;
    completed: boolean;
    date: string;
  }[],
  joinedOn: string | null,
  today: string,
  capacities: readonly LevelCapacity[] = ["strength", "weightlifting", "gymnastics", "engine"],
): LevelSuggestion[] {
  const since = addDays(today, -60);
  const isNew = joinedOn !== null && daysBetween(joinedOn, today) < 90;
  return capacities.map((capacity) => {
    const recent = results.filter((r) => r.capacity === capacity && r.date >= since);
    const done = new Map<WorkoutLevel, number>();
    for (const r of recent) if (r.completed) done.set(r.level, (done.get(r.level) ?? 0) + 1);
    const completed = [...done.entries()]
      .filter(([, n]) => n >= 2)
      .map(([l]) => l)
      .sort((a, b) => levelRank(b) - levelRank(a))[0];
    if (isNew && (!completed || levelRank(completed) <= levelRank("foundations")))
      return { capacity, level: "foundations", reason: "new" };
    if (completed) return { capacity, level: completed, reason: "completed" };
    const freq = new Map<WorkoutLevel, number>();
    for (const r of recent) freq.set(r.level, (freq.get(r.level) ?? 0) + 1);
    const most = [...freq.entries()].sort(
      (a, b) => b[1] - a[1] || levelRank(b[0]) - levelRank(a[0]),
    )[0];
    if (most) return { capacity, level: most[0], reason: "frequent" };
    return { capacity, level: isNew ? "foundations" : "scaled", reason: isNew ? "new" : "default" };
  });
}
