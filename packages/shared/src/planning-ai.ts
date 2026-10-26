import { z } from "zod";
import {
  CAPACITIES,
  DAY_ROLES,
  TIME_DOMAINS,
  WORKOUT_TRACKS,
  type Capacity,
  type DayRole,
  type TimeDomain,
} from "./capacities.ts";
import {
  MOVEMENT_CODES,
  REP_MAXES,
  SCORE_TYPES,
  WORKOUT_BLOCK_KINDS,
  WorkoutBlockInputSchema,
  type ScoreType,
  type WorkoutBlockInput,
  type WorkoutBlockKind,
} from "./fitness.ts";
import type { Locale } from "./locales.ts";
import {
  normalizeEmphasis,
  PLAN_BLOCK_KINDS,
  PLAN_TEMPLATE_CODES,
  PLAN_TEST_CODES,
  type Emphasis,
  type PlanBlockKind,
  type PlanTemplateCode,
  type Prescription,
} from "./planning.ts";

/**
 * La IA de la planificación del box (ADR 0053), con el mismo registro, trabajo en segundo plano y
 * modelo que la propuesta de WOD (ADR 0049). Tres papeles:
 *
 * - **Arquitecto**: de una frase del coach ("base de fuerza hasta Semana Santa") a un plan: plantilla,
 *   semanas, énfasis, bloques y tests. El motor (`buildPlanStructure`) construye las semanas.
 * - **Programador**: escribe las sesiones de una semana del plan con sus cuatro niveles, su intención,
 *   sus minutos y su porqué. Las progresiones de fuerza no las decide: se las da el plan.
 * - **Copiloto**: una petición en lenguaje normal ("el sábado 12 hacemos una competición interna") y
 *   los cambios que propone, cada uno con su porqué, que el coach acepta o descarta.
 *
 * Sin datos personales: el modelo ve el box en agregados (cuántos atletas de cada nivel, cómo vienen,
 * cuánto material hay), nunca a un atleta.
 */

export const AI_PLAN_KINDS = ["plan_architect", "plan_week", "plan_copilot"] as const;
export type AiPlanKind = (typeof AI_PLAN_KINDS)[number];
/**
 * Llamadas de planificación por club y semana: el plan, cada semana escrita y cada petición al
 * copiloto. Va aparte de la cuota de propuestas de WOD y de sesión (ADR 0044) para que planificar no
 * deje al coach sin propuestas sueltas.
 */
export const AI_PLAN_WEEKLY_LIMIT = 30;
export const AI_PLAN_PROFILE_CODE = "plan";
export const AI_PLAN_PROFILE_VERSION = 1;
/** Bloques por sesión que puede escribir el programador (clase y Clase+). */
export const AI_PLAN_MAX_BLOCKS = 8;

const LANGUAGE: Record<Locale, string> = { es: "castellano", ca: "catalán", en: "inglés" };
const lines = (items: readonly string[]) => items.map((i) => `- ${i}`).join("\n");

// --- El box, en agregados ---

export interface AiBoxContext {
  locale: Locale;
  sport: string;
  section: string;
  /** Días con clase (lunes = 1) y minutos de la clase. */
  classWeekdays: number[];
  classMinutes: number;
  /** Plazas de la clase más grande. */
  classSize: number;
  athletes: number;
  /** Atletas por nivel según sus resultados. */
  levels: { foundations: number; scaled: number; rx: number; rx_plus: number };
  /** Nombres que usa el box para cada nivel. */
  levelNames: { foundations: string; scaled: string; rx: string; rx_plus: string };
  /** Días por semana de media y combinaciones habituales ("L·X·V: 38 % de los de 3 días"). */
  frequency: number | null;
  combos: string[];
  /** Material con unidades usables. */
  equipment: { kind: string; name: string; available: number; weights: string | null }[];
  /** Ejercicios de la biblioteca: el nombre, el material y cómo se escala. */
  exercises: { name: string; equipment: string[]; scaling: string | null }[];
  movements: { code: string; name: string }[];
}

function boxLines(box: AiBoxContext): string {
  return [
    `## El box\n${lines([
      `Disciplina: ${box.section} (${box.sport}).`,
      `Clases de ${box.classMinutes} minutos, hasta ${box.classSize} atletas por clase, días con clase: ${box.classWeekdays.join(", ")} (1 = lunes).`,
      `${box.athletes} atletas: ${box.levels.foundations} en ${box.levelNames.foundations}, ${box.levels.scaled} en ${box.levelNames.scaled}, ${box.levels.rx} en ${box.levelNames.rx} y ${box.levels.rx_plus} en ${box.levelNames.rx_plus}.`,
      box.frequency !== null
        ? `Vienen ${box.frequency.toFixed(1)} días por semana de media. Combinaciones habituales: ${box.combos.join("; ") || "sin datos"}.`
        : "Sin datos de frecuencia todavía.",
    ])}`,
    `## Material (unidades usables)\n${
      box.equipment.length > 0
        ? lines(
            box.equipment.map(
              (e) => `${e.name} [${e.kind}]: ${e.available}${e.weights ? ` (${e.weights})` : ""}`,
            ),
          )
        : "Sin inventario: material de un box estándar."
    }`,
    `## Biblioteca de ejercicios (úsalos con este nombre exacto)\n${lines(
      box.exercises.map(
        (e) =>
          `${e.name} [${e.equipment.join(", ") || "sin material"}]${e.scaling ? ` · se escala: ${e.scaling.replace(/\n/g, "; ")}` : ""}`,
      ),
    )}`,
    `## Catálogo de movimientos con máxima (código: nombre)\n${lines(box.movements.map((m) => `${m.code}: ${m.name}`))}`,
  ].join("\n\n");
}

// --- Arquitecto ---

export const AiPlanArchitectRequestSchema = z.object({
  sectionId: z.string().uuid(),
  goal: z.string().trim().min(5).max(500),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type AiPlanArchitectRequest = z.infer<typeof AiPlanArchitectRequestSchema>;

export interface AiPlanArchitectContext {
  box: AiBoxContext;
  goal: string;
  startsOn: string;
  templates: { code: string; weeks: string; emphasis: string; tests: string }[];
}

export function aiArchitectSystemPrompt(locale: Locale): string {
  return [
    "Eres head coach y planificador de un box. Diseñas la estrategia de un ciclo de entrenamiento para clases de grupo con niveles mezclados.",
    "Del objetivo que escribe el coach sacas el plan: cuántas semanas, cómo se reparten 100 puntos entre seis capacidades, qué bloques (mesociclos) y en qué orden, y qué tests se hacen al empezar y al acabar.",
    `## Cómo planificas\n${lines([
      "Bloques: test (semana de test), base (acumulación), build (desarrollo), peak (realización), deload (descarga), maintenance (semanas cortas o festivas).",
      "Una descarga cada 4 o 5 semanas de carga. Un plan con fecha (una competición) termina en peak y un test.",
      "Programas para quien viene 2 o 3 días: el plan tiene que tocar lo esencial cada semana.",
      "El énfasis suma 100, de 5 en 5. Menos de 10 puntos en una capacidad la mantiene, no la mejora.",
      "Usa una plantilla de las que hay como punto de partida si encaja; si no, 'custom'.",
    ])}`,
    `## Formato\n${lines([
      `"templateCode": uno de ${PLAN_TEMPLATE_CODES.join(", ")}.`,
      '"weeks": semanas del plan (de 3 a 24). La suma de las semanas de "phases" tiene que ser igual.',
      `"emphasis": puntos de ${CAPACITIES.join(", ")}.`,
      `"phases": bloques en orden, cada uno con "kind" (${PLAN_BLOCK_KINDS.join(", ")}), "weeks" y "focus" (el objetivo del bloque en una frase).`,
      `"tests": códigos de ${PLAN_TEST_CODES.join(", ")}.`,
      '"name": nombre corto del plan. "rationale": por qué este plan, en tres frases para el coach.',
      `Escribe los textos en ${LANGUAGE[locale]}.`,
    ])}`,
  ].join("\n\n");
}

export function aiArchitectUserPrompt(context: AiPlanArchitectContext): string {
  return [
    boxLines(context.box),
    `## Plantillas\n${lines(context.templates.map((t) => `${t.code}: ${t.weeks}; énfasis ${t.emphasis}; tests ${t.tests}`))}`,
    `## Lo que pide el coach\nEmpieza el ${context.startsOn}. Objetivo: ${context.goal}`,
  ].join("\n\n");
}

const STRING = { type: "string" };
const INT = { type: "integer" };
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

export const AI_ARCHITECT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["templateCode", "name", "weeks", "emphasis", "phases", "tests", "rationale"],
  properties: {
    templateCode: { type: "string", enum: [...PLAN_TEMPLATE_CODES] },
    name: STRING,
    weeks: INT,
    emphasis: {
      type: "object",
      additionalProperties: false,
      required: [...CAPACITIES],
      properties: Object.fromEntries(CAPACITIES.map((c) => [c, INT])),
    },
    phases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "weeks", "focus"],
        properties: {
          kind: { type: "string", enum: [...PLAN_BLOCK_KINDS] },
          weeks: INT,
          focus: nullable(STRING),
        },
      },
    },
    tests: { type: "array", items: { type: "string", enum: [...PLAN_TEST_CODES] } },
    rationale: STRING,
  },
} as const;

export const AiArchitectOutputSchema = z.object({
  templateCode: z.string(),
  name: z.string(),
  weeks: z.number(),
  emphasis: z.record(z.string(), z.number()),
  phases: z.array(z.object({ kind: z.string(), weeks: z.number(), focus: z.string().nullable() })),
  tests: z.array(z.string()),
  rationale: z.string(),
});
export type AiArchitectOutput = z.infer<typeof AiArchitectOutputSchema>;

export interface AiArchitectProposal {
  templateCode: PlanTemplateCode;
  name: string;
  weeks: number;
  emphasis: Emphasis;
  phases: { kind: PlanBlockKind; weeks: number; focus: string | null }[];
  tests: string[];
  rationale: string;
}

const cut = (text: string | null | undefined, max: number): string | null => {
  const t = text?.trim();
  return t ? t.slice(0, max).trim() : null;
};

/** Lee la propuesta del arquitecto: énfasis a 100, semanas cuadradas con los bloques, tests del catálogo. */
export function resolveArchitect(output: AiArchitectOutput): AiArchitectProposal | null {
  const templateCode = (PLAN_TEMPLATE_CODES as readonly string[]).includes(output.templateCode)
    ? (output.templateCode as PlanTemplateCode)
    : "custom";
  const phases = output.phases
    .filter((p) => (PLAN_BLOCK_KINDS as readonly string[]).includes(p.kind))
    .map((p) => ({
      kind: p.kind as PlanBlockKind,
      weeks: Math.max(1, Math.min(12, Math.round(p.weeks))),
      focus: cut(p.focus, 200),
    }));
  const weeks = phases.reduce((s, p) => s + p.weeks, 0);
  if (phases.length === 0 || weeks < 3 || weeks > 24) return null;
  const raw = Object.fromEntries(
    CAPACITIES.map((c) => [c, Math.max(0, Number(output.emphasis[c] ?? 0))]),
  ) as Record<Capacity, number>;
  if (CAPACITIES.every((c) => raw[c] === 0)) return null;
  const name = cut(output.name, 80);
  if (!name) return null;
  return {
    templateCode,
    name,
    weeks,
    emphasis: normalizeEmphasis(raw),
    phases,
    tests: [...new Set(output.tests.filter((x) => PLAN_TEST_CODES.includes(x)))].slice(0, 6),
    rationale: cut(output.rationale, 800) ?? "",
  };
}

// --- Programador ---

export const AiPlanWeekRequestSchema = z.object({
  /** Notas del coach para esta semana. */
  focus: z.string().trim().max(500).nullable().optional(),
  /** Escribir también Clase+ (el trabajo extra del Open Box). */
  plus: z.boolean().optional(),
});
export type AiPlanWeekRequest = z.infer<typeof AiPlanWeekRequestSchema>;

export interface AiPlanDay {
  date: string;
  weekday: number;
  role: DayRole;
  roleName: string;
  domain: TimeDomain | null;
  effort: number;
  /** El levantamiento del día tal como lo manda el plan: el modelo no lo cambia. */
  prescription: (Prescription & { movementName: string }) | null;
  engineMinutes: number | null;
  /** Complementos de cobertura que tiene que meter en el calentamiento. */
  complements: string[];
  /** Ya escrito por el coach: no se toca. */
  taken: boolean;
}

export interface AiPlanWeekContext {
  box: AiBoxContext;
  plan: {
    name: string;
    goal: string | null;
    week: number;
    weeks: number;
    block: string;
    blockKind: PlanBlockKind;
    blockFocus: string | null;
    volume: number;
    intensity: number;
    emphasis: Emphasis;
  };
  days: AiPlanDay[];
  recent: { date: string; title: string | null; blocks: string[] }[];
  /** Lo que el box ha aprendido: "los WODs con carrera salen un 18 % más largos". */
  learned: string[];
  focus: string | null;
  plus: boolean;
}

export function aiWeekSystemPrompt(locale: Locale): string {
  return [
    "Eres head coach de un box. Escribes las sesiones de una semana de un plan de entrenamiento para clases de grupo: cada sesión es la pizarra del día con sus cuatro niveles.",
    "Cada día ya tiene su papel en la semana, su intención y, si lleva levantamiento, la prescripción exacta del plan. Tú escribes el resto con criterio de programador: estímulo claro, variedad, nada repetido de la semana anterior y todo dentro del material y del aforo del box.",
    `## Cómo escribes\n${lines([
      "Respeta el papel del día, el dominio de tiempo y el esfuerzo objetivo.",
      "El levantamiento del día va tal cual: mismo movimiento, series, repeticiones y porcentaje. Si es semana de test, se busca la 1RM (rmReps 1, scoreType load).",
      "Los minutos de cada bloque de la clase suman, con transiciones de 2 minutos, como mucho la duración de la clase.",
      "Cuatro niveles reales en los bloques puntuados: foundations (primeros meses: menos volumen, variantes simples), scaled, rx y rxPlus. Cambian volumen, variante y carga, no solo los kilos.",
      'Usa solo ejercicios de la biblioteca (por su nombre exacto en "exercises") y del catálogo de movimientos. Nada con material que no hay.',
      "Piensa en el aforo: si un bloque usa máquinas, que haya puestos para todos (bolsa de máquinas o quien sobra corre) o por parejas.",
      "Mete los complementos de cobertura en el calentamiento.",
      'Cada día lleva "why": dos o tres razones cortas de por qué es así (progresión, equilibrio con la semana, cobertura).',
      '"intentFeel": cómo se tiene que sentir, en una frase para la pizarra ("sin parar más de 5 segundos").',
    ])}`,
    `## Formato de cada bloque\n${lines([
      `"kind": ${WORKOUT_BLOCK_KINDS.join(", ")}. "track": class (la clase) o plus (Clase+, el extra del Open Box).`,
      `"capacity": ${CAPACITIES.join(", ")}.`,
      `"scoreType": ${SCORE_TYPES.join(", ")}. Calentamiento y vuelta a la calma: none.`,
      '"plannedMinutes": minutos del bloque. "timeCapSeconds": time cap de un WOD por tiempo o nulo.',
      '"description": la pizarra tal como la lee el atleta, con saltos de línea.',
      '"movementCode", "percent", "rmReps": solo en el levantamiento del plan.',
      '"exercises": nombres exactos de la biblioteca que usa el bloque.',
      `Escribe todos los textos en ${LANGUAGE[locale]}. Títulos de menos de 60 caracteres.`,
    ])}`,
  ].join("\n\n");
}

export function aiWeekUserPrompt(context: AiPlanWeekContext): string {
  const p = context.plan;
  const days = context.days
    .filter((d) => !d.taken)
    .map((d) =>
      [
        `${d.date} (día ${d.weekday}): ${d.roleName} [${d.role}]`,
        d.domain ? `WOD ${d.domain}` : "sin WOD puntuado",
        `esfuerzo ${d.effort} de 5`,
        d.prescription
          ? d.prescription.rmReps
            ? `levantamiento: ${d.prescription.movementName} (${d.prescription.movementCode}) buscar 1RM`
            : `levantamiento: ${d.prescription.movementName} (${d.prescription.movementCode}) ${d.prescription.sets}×${d.prescription.reps} al ${d.prescription.percent} %`
          : null,
        d.engineMinutes ? `motor: ${d.engineMinutes} minutos` : null,
        d.complements.length ? `complementos: ${d.complements.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  return [
    boxLines(context.box),
    `## El plan\n${lines([
      `${p.name}${p.goal ? `: ${p.goal}` : ""}.`,
      `Semana ${p.week} de ${p.weeks}. Bloque ${p.block} (${p.blockKind})${p.blockFocus ? `: ${p.blockFocus}` : ""}.`,
      `Volumen ${p.volume} y intensidad ${p.intensity} sobre 100.`,
      `Énfasis del bloque: ${CAPACITIES.map((c) => `${c} ${p.emphasis[c]}`).join(", ")}.`,
    ])}`,
    `## Los días que escribes\n${lines(days)}`,
    context.recent.length > 0
      ? `## Programado las dos semanas anteriores (para no repetir)\n${lines(context.recent.map((r) => `${r.date} ${r.title ?? ""}: ${r.blocks.join("; ")}`))}`
      : "## Programado antes\nNada todavía.",
    context.learned.length > 0 ? `## Lo que sabemos de este box\n${lines(context.learned)}` : "",
    context.plus
      ? "## Clase+\nAñade a cada día uno o dos bloques con track plus (20 a 40 minutos en el Open Box) que profundicen en el foco del bloque, coherentes con la clase."
      : "",
    context.focus ? `## Lo que pide el coach\n${context.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const SESSION_BLOCK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "track",
    "capacity",
    "title",
    "description",
    "scoreType",
    "timeCapSeconds",
    "plannedMinutes",
    "movementCode",
    "percent",
    "rmReps",
    "exercises",
    "foundations",
    "scaled",
    "rx",
    "rxPlus",
  ],
  properties: {
    kind: { type: "string", enum: [...WORKOUT_BLOCK_KINDS] },
    track: { type: "string", enum: [...WORKOUT_TRACKS] },
    capacity: { type: "string", enum: [...CAPACITIES] },
    title: STRING,
    description: nullable(STRING),
    scoreType: { type: "string", enum: [...SCORE_TYPES] },
    timeCapSeconds: nullable(INT),
    plannedMinutes: nullable(INT),
    movementCode: nullable({ type: "string", enum: [...MOVEMENT_CODES] }),
    percent: nullable(INT),
    rmReps: nullable(INT),
    exercises: { type: "array", items: STRING },
    foundations: nullable(STRING),
    scaled: nullable(STRING),
    rx: nullable(STRING),
    rxPlus: nullable(STRING),
  },
} as const;

const SESSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date", "title", "intentFeel", "why", "blocks"],
  properties: {
    date: STRING,
    title: STRING,
    intentFeel: STRING,
    why: { type: "array", items: STRING },
    blocks: { type: "array", items: SESSION_BLOCK_SCHEMA },
  },
} as const;

export const AI_WEEK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["days"],
  properties: { days: { type: "array", items: SESSION_SCHEMA } },
} as const;

const RawBlock = z.object({
  kind: z.string(),
  track: z.string(),
  capacity: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  scoreType: z.string(),
  timeCapSeconds: z.number().nullable(),
  plannedMinutes: z.number().nullable(),
  movementCode: z.string().nullable(),
  percent: z.number().nullable(),
  rmReps: z.number().nullable(),
  exercises: z.array(z.string()),
  foundations: z.string().nullable(),
  scaled: z.string().nullable(),
  rx: z.string().nullable(),
  rxPlus: z.string().nullable(),
});
const RawSession = z.object({
  date: z.string(),
  title: z.string(),
  intentFeel: z.string(),
  why: z.array(z.string()),
  blocks: z.array(RawBlock),
});
export const AiWeekOutputSchema = z.object({ days: z.array(RawSession) });
export type AiWeekOutput = z.infer<typeof AiWeekOutputSchema>;
type RawSessionT = z.infer<typeof RawSession>;

/** Una sesión ya validada, lista para guardarse como borrador del WOD de su día. */
export interface AiPlanSession {
  date: string;
  title: string;
  intentFeel: string | null;
  why: string[];
  blocks: WorkoutBlockInput[];
}

const isKind = (v: string): v is WorkoutBlockKind =>
  (WORKOUT_BLOCK_KINDS as readonly string[]).includes(v);
const isScore = (v: string): v is ScoreType => (SCORE_TYPES as readonly string[]).includes(v);

/**
 * Valida una sesión del modelo contra el formato del WOD: ejercicios por su nombre en la
 * biblioteca, el levantamiento del plan impuesto tal cual, textos recortados y cada bloque
 * comprobado con el esquema del editor. Nula si no queda nada que valga.
 */
export function resolveSession(
  raw: RawSessionT,
  options: {
    exerciseIdByName: ReadonlyMap<string, string>;
    prescription: Prescription | null;
  },
): AiPlanSession | null {
  const blocks: WorkoutBlockInput[] = [];
  let strengthPlaced = false;
  for (const b of raw.blocks.slice(0, AI_PLAN_MAX_BLOCKS)) {
    if (!isKind(b.kind) || !isScore(b.scoreType)) continue;
    const title = cut(b.title, 80);
    if (!title) continue;
    let movementCode =
      b.movementCode && MOVEMENT_CODES.includes(b.movementCode) ? b.movementCode : null;
    let percent =
      movementCode && b.percent !== null && Number.isInteger(b.percent) ? b.percent : null;
    let rmReps =
      movementCode &&
      b.scoreType === "load" &&
      (REP_MAXES as readonly number[]).includes(b.rmReps ?? -1)
        ? (b.rmReps as WorkoutBlockInput["rmReps"])
        : null;
    let scoreType = b.scoreType;
    const p = options.prescription;
    if (p && b.kind === "strength" && !strengthPlaced) {
      movementCode = p.movementCode;
      percent = p.rmReps ? null : p.percent;
      rmReps = p.rmReps;
      scoreType = "load";
      strengthPlaced = true;
    }
    const exerciseIds = [
      ...new Set(
        b.exercises
          .map((n) => options.exerciseIdByName.get(n.trim().toLowerCase()))
          .filter((id): id is string => !!id),
      ),
    ].slice(0, 12);
    const cap =
      b.timeCapSeconds !== null && Number.isInteger(b.timeCapSeconds) ? b.timeCapSeconds : null;
    const minutes =
      b.plannedMinutes !== null && Number.isInteger(b.plannedMinutes) ? b.plannedMinutes : null;
    const candidate = {
      kind: b.kind,
      title,
      description: cut(b.description, 2000),
      scoreType,
      timeCapSeconds: cap !== null && cap >= 30 && cap <= 4 * 3600 ? cap : null,
      movementCode,
      percent: percent !== null && percent >= 1 && percent <= 150 ? percent : null,
      rmReps,
      foundations: cut(b.foundations, 400),
      scaled: cut(b.scaled, 400),
      rx: cut(b.rx, 400),
      rxPlus: cut(b.rxPlus, 400),
      capacity: (CAPACITIES as readonly string[]).includes(b.capacity)
        ? (b.capacity as Capacity)
        : null,
      plannedMinutes: minutes !== null && minutes >= 1 && minutes <= 120 ? minutes : null,
      exerciseIds,
      track: b.track === "plus" ? ("plus" as const) : ("class" as const),
    };
    const parsed = WorkoutBlockInputSchema.safeParse(candidate);
    if (parsed.success) blocks.push(parsed.data);
  }
  if (!blocks.some((b) => b.track !== "plus")) return null;
  return {
    date: raw.date,
    title: cut(raw.title, 80) ?? "",
    intentFeel: cut(raw.intentFeel, 300),
    why: raw.why
      .map((w) => cut(w, 200))
      .filter((w): w is string => !!w)
      .slice(0, 4),
    blocks,
  };
}

/** La semana del programador: una sesión válida por día pedido, sin días repetidos ni ajenos. */
export function resolveWeek(
  output: AiWeekOutput,
  context: Pick<AiPlanWeekContext, "days">,
  exerciseIdByName: ReadonlyMap<string, string>,
): AiPlanSession[] {
  const wanted = new Map(context.days.filter((d) => !d.taken).map((d) => [d.date, d]));
  const out: AiPlanSession[] = [];
  for (const raw of output.days) {
    const day = wanted.get(raw.date);
    if (!day) continue;
    const session = resolveSession(raw, { exerciseIdByName, prescription: day.prescription });
    if (session) {
      out.push(session);
      wanted.delete(raw.date);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// --- Copiloto ---

export const AiPlanCopilotRequestSchema = z.object({
  message: z.string().trim().min(3).max(600),
  /** Semana desde la que mirar (por defecto, la actual). */
  week: z.number().int().min(1).max(60).optional(),
});
export type AiPlanCopilotRequest = z.infer<typeof AiPlanCopilotRequestSchema>;

export const COPILOT_OPS = ["update", "move", "clear", "note"] as const;
export type CopilotOp = (typeof COPILOT_OPS)[number];

export interface AiPlanCopilotContext {
  box: AiBoxContext;
  plan: AiPlanWeekContext["plan"] & { startsOn: string; endsOn: string };
  today: string;
  /** Semanas que mira: la pedida y la siguiente, con su papel por día y lo ya programado. */
  days: {
    date: string;
    weekday: number;
    week: number;
    role: DayRole | null;
    roleName: string | null;
    blockKind: PlanBlockKind;
    workout: { title: string | null; blocks: string[] } | null;
    prescription: (Prescription & { movementName: string }) | null;
  }[];
  message: string;
}

export function aiCopilotSystemPrompt(locale: Locale): string {
  return [
    "Eres el copiloto de programación de un box: el coach te pide un cambio en lenguaje normal y tú propones los cambios concretos en el plan, día a día, con su porqué.",
    `## Cómo trabajas\n${lines([
      "Cambia lo mínimo que resuelve la petición y mantiene el sentido del plan (progresiones, descargas, equilibrio de la semana).",
      "Operaciones: update (reescribe la sesión de un día), move (pasa el WOD de un día a otro), clear (deja un día sin WOD, por ejemplo si el box cierra) y note (un aviso sin cambio).",
      "Una sesión de update sigue las mismas reglas que una sesión del plan: cuatro niveles, material del box, minutos de la clase, ejercicios de la biblioteca.",
      "Si un día tiene levantamiento del plan y lo cambias de día, conserva la prescripción.",
      "No cambies días pasados (antes de hoy).",
      `"reply": una o dos frases para el coach. "before" y "after": el cambio en pocas palabras. Escribe en ${LANGUAGE[locale]}.`,
    ])}`,
  ].join("\n\n");
}

export function aiCopilotUserPrompt(context: AiPlanCopilotContext): string {
  return [
    boxLines(context.box),
    `## El plan\n${lines([
      `${context.plan.name} (del ${context.plan.startsOn} al ${context.plan.endsOn}). Hoy es ${context.today}.`,
      `Semana ${context.plan.week} de ${context.plan.weeks}, bloque ${context.plan.block} (${context.plan.blockKind}).`,
    ])}`,
    `## Los días\n${lines(
      context.days.map((d) =>
        [
          `${d.date} (semana ${d.week}, día ${d.weekday}, ${d.blockKind}): ${d.roleName ?? "sin clase"}`,
          d.prescription
            ? `plan: ${d.prescription.movementName} ${d.prescription.rmReps ? "1RM" : `${d.prescription.sets}×${d.prescription.reps} al ${d.prescription.percent} %`}`
            : null,
          d.workout
            ? `programado: ${d.workout.title ?? ""} — ${d.workout.blocks.join("; ")}`
            : "sin WOD",
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    )}`,
    `## Lo que pide el coach\n${context.message}`,
  ].join("\n\n");
}

export const AI_COPILOT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "changes"],
  properties: {
    reply: STRING,
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "date", "toDate", "before", "after", "why", "session"],
        properties: {
          op: { type: "string", enum: [...COPILOT_OPS] },
          date: STRING,
          toDate: nullable(STRING),
          before: STRING,
          after: STRING,
          why: STRING,
          session: nullable(SESSION_SCHEMA),
        },
      },
    },
  },
} as const;

export const AiCopilotOutputSchema = z.object({
  reply: z.string(),
  changes: z.array(
    z.object({
      op: z.string(),
      date: z.string(),
      toDate: z.string().nullable(),
      before: z.string(),
      after: z.string(),
      why: z.string(),
      session: RawSession.nullable(),
    }),
  ),
});
export type AiCopilotOutput = z.infer<typeof AiCopilotOutputSchema>;

export interface AiCopilotChange {
  op: CopilotOp;
  date: string;
  toDate: string | null;
  before: string;
  after: string;
  why: string;
  session: AiPlanSession | null;
}

export interface AiCopilotProposal {
  reply: string;
  changes: AiCopilotChange[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Los cambios del copiloto que se pueden aplicar: fechas del plan, desde hoy y bien formados. */
export function resolveCopilot(
  output: AiCopilotOutput,
  context: Pick<AiPlanCopilotContext, "days" | "today" | "plan">,
  exerciseIdByName: ReadonlyMap<string, string>,
): AiCopilotProposal | null {
  const reply = cut(output.reply, 600);
  if (!reply) return null;
  const inPlan = (d: string | null) =>
    !!d &&
    DATE.test(d) &&
    d >= context.plan.startsOn &&
    d <= context.plan.endsOn &&
    d >= context.today;
  const byDate = new Map(context.days.map((d) => [d.date, d]));
  const changes: AiCopilotChange[] = [];
  for (const c of output.changes.slice(0, 8)) {
    if (!(COPILOT_OPS as readonly string[]).includes(c.op)) continue;
    const op = c.op as CopilotOp;
    if (op !== "note" && !inPlan(c.date)) continue;
    if (op === "move" && !inPlan(c.toDate)) continue;
    let session: AiPlanSession | null = null;
    if (op === "update") {
      if (!c.session) continue;
      session = resolveSession(
        { ...c.session, date: c.date },
        { exerciseIdByName, prescription: byDate.get(c.date)?.prescription ?? null },
      );
      if (!session) continue;
    }
    changes.push({
      op,
      date: c.date,
      toDate: op === "move" ? c.toDate : null,
      before: cut(c.before, 200) ?? "",
      after: cut(c.after, 200) ?? "",
      why: cut(c.why, 300) ?? "",
      session,
    });
  }
  return { reply, changes };
}

/** Los textos de las variables que no dependen del idioma y que ve el modelo. */
export const AI_TIME_DOMAINS: readonly TimeDomain[] = TIME_DOMAINS;
export const AI_DAY_ROLES: readonly DayRole[] = DAY_ROLES;
