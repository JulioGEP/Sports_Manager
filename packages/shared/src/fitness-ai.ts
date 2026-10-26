import { z } from "zod";
import {
  BENCHMARKS,
  MOVEMENT_CODES,
  MOVEMENTS,
  REP_MAXES,
  SCORE_TYPES,
  WORKOUT_BLOCK_KINDS,
  WorkoutBlockInputSchema,
  type ScoreType,
  type WorkoutBlockInput,
  type WorkoutBlockKind,
} from "./fitness.ts";
import type { Locale } from "./locales.ts";

/**
 * Propuesta de WOD con IA (ADR 0049): el coach de un box pide el WOD de un día de una disciplina
 * y la IA lo escribe en el formato del editor. Reutiliza el registro, la cuota semanal y el trabajo
 * en segundo plano de la propuesta de sesiones (ADR 0044). Sin datos personales: el modelo ve la
 * disciplina, lo programado alrededor, el material y lo que pide el coach.
 */

/** Qué se pidió a la IA: las sesiones de un equipo o el WOD de un día. */
export const AI_GENERATION_KINDS = ["training", "wod"] as const;
export type AiGenerationKind = (typeof AI_GENERATION_KINDS)[number];

/** Perfil fijo del WOD: no depende del deporte de la sección como el de las sesiones. */
export const AI_WOD_PROFILE_CODE = "wod";
export const AI_WOD_PROFILE_VERSION = 1;
/** Bloques que puede tener la propuesta (el editor admite hasta 10). */
export const AI_WOD_MAX_BLOCKS = 6;
/** Minutos de la clase si el coach no lo dice. */
export const AI_WOD_DEFAULT_MINUTES = 60;

/** Un WOD ya programado cerca del día pedido, para no repetir y equilibrar la semana. */
export interface AiWodContextWorkout {
  date: string;
  weekday: string;
  title: string | null;
  classType: string | null;
  blocks: {
    kind: WorkoutBlockKind;
    title: string;
    scoreType: ScoreType;
    movement: string | null;
    timeCapSeconds: number | null;
  }[];
}

/** El contexto exacto que verá el modelo. Se guarda con la propuesta. */
export interface AiWodContext {
  locale: Locale;
  sport: string;
  section: string;
  classType: string | null;
  date: string;
  weekday: string;
  minutes: number;
  /** Lo que busca el coach ese día, sin nombres de atletas. */
  focus: string | null;
  recent: AiWodContextWorkout[];
  upcoming: AiWodContextWorkout[];
  equipment: { name: string; quantity: number | null }[];
  movements: { code: string; name: string }[];
  benchmarks: { code: string; name: string; scoreType: ScoreType; description: string }[];
}

/** Catálogos que el modelo puede citar: movimientos con máxima y benchmarks. */
export function aiWodCatalogs(locale: Locale): Pick<AiWodContext, "movements" | "benchmarks"> {
  return {
    movements: MOVEMENTS.map((m) => ({ code: m.code, name: m.name[locale] })),
    benchmarks: BENCHMARKS.map((b) => ({
      code: b.code,
      name: b.name,
      scoreType: b.scoreType,
      description: b.description[locale],
    })),
  };
}

const LANGUAGE: Record<Locale, string> = { es: "castellano", ca: "catalán", en: "inglés" };
const KIND_LABEL: Record<WorkoutBlockKind, string> = {
  warmup: "calentamiento",
  strength: "fuerza",
  skill: "técnica",
  wod: "WOD",
  accessory: "accesorios",
  cooldown: "vuelta a la calma",
};
const SCORE_LABEL: Record<ScoreType, string> = {
  time: "por tiempo (menos es mejor; quien no acaba en el time cap, por repeticiones)",
  rounds_reps: "rondas y repeticiones (AMRAP)",
  load: "kilos",
  reps: "repeticiones",
  distance: "metros",
  calories: "calorías",
  none: "sin marcador",
};

const lines = (items: readonly string[]) => items.map((i) => `- ${i}`).join("\n");

/** Instrucciones fijas: quién es, cómo programa y las reglas del formato. */
export function aiWodSystemPrompt(context: Pick<AiWodContext, "locale" | "sport">): string {
  return [
    `Eres head coach de un box de ${context.sport} con años programando para grupos mixtos: gente que empieza, atletas medios y competidores. Programas el WOD del día que el box escribe en su pizarra.`,
    "Tu trabajo es proponer el borrador del WOD de un día. Es un borrador: el coach lo revisa, lo cambia y lo publica.",
    `## Cómo programas
${lines([
  "Cada día tiene un estímulo claro y se puede explicar en una frase: lo dices en las notas.",
  "Equilibras la semana con lo ya programado: no repites el mismo patrón dominante, ni el mismo estímulo metabólico, ni el mismo movimiento con barra dos días seguidos.",
  "Estructura habitual: calentamiento específico, una parte de fuerza o técnica y un WOD; accesorios o vuelta a la calma si cabe en el tiempo.",
  "Los tiempos de cada bloque suman, como mucho, la duración de la clase, contando explicaciones y transiciones.",
  "Escala siempre: Scaled para quien empieza o vuelve, RX el estándar, RX+ para quien compite.",
  "Usa pesos estándar (por ejemplo 43/30 kg) y escribe repeticiones, distancias y calorías concretas.",
])}`,
    `## Lo que nunca haces
${lines([
  "Programar con material que el box no tiene.",
  "Proponer volúmenes temerarios de movimientos de alto riesgo (por ejemplo, muchas repeticiones de snatch pesado con fatiga).",
  "Citar movimientos o benchmarks fuera del catálogo con su código: si usas otro movimiento, escríbelo en la descripción y deja el código nulo.",
])}`,
    `## Formato de cada bloque
${lines([
  `"kind": uno de ${WORKOUT_BLOCK_KINDS.map((k) => `${k} (${KIND_LABEL[k]})`).join(", ")}.`,
  `"scoreType": uno de ${SCORE_TYPES.map((s) => `${s} (${SCORE_LABEL[s]})`).join(", ")}. El calentamiento y la vuelta a la calma van sin marcador ("none").`,
  `"description": la pizarra del bloque tal como la leería un atleta, con saltos de línea. Por ejemplo "AMRAP 12'\\n10 wall balls 9/6 kg\\n10 box jumps\\n200 m run".`,
  `"timeCapSeconds": el time cap en segundos para un WOD por tiempo; nulo si no hace falta.`,
  `"movementCode": el código del movimiento del catálogo si el bloque es de fuerza con uno de ellos; nulo si no.`,
  `"percent": el porcentaje del 1RM para la carga de trabajo de ese movimiento (la app calcula los kilos de cada atleta); nulo si no.`,
  `"rmReps": ${REP_MAXES.join(", ")} si el bloque busca una máxima de ese movimiento (y entonces "scoreType" es "load"); nulo si no.`,
  `"scaled", "rx", "rxPlus": cómo se hace en cada nivel (pesos, alturas, variantes). Nulos si el bloque no se escala.`,
])}`,
    `## Reglas del borrador
${lines([
  `Escribe todos los textos en ${LANGUAGE[context.locale]}.`,
  `Entre 2 y ${AI_WOD_MAX_BLOCKS} bloques, en el orden de la clase.`,
  "Títulos cortos (menos de 60 caracteres). Descripciones de menos de 600 caracteres; niveles de menos de 200.",
  '"title" es el nombre del WOD del día (puede ser el de un benchmark si lo usas tal cual).',
  '"notes" explica el estímulo del día y cómo encaja con la semana, en dos o tres frases para los coaches.',
])}`,
  ].join("\n\n");
}

const workoutLine = (w: AiWodContextWorkout) =>
  `- ${w.weekday} ${w.date}${w.classType ? ` (${w.classType})` : ""}${w.title ? ` · ${w.title}` : ""}: ${
    w.blocks
      .map(
        (b) =>
          `${KIND_LABEL[b.kind]} «${b.title}»${b.movement ? ` [${b.movement}]` : ""}${b.scoreType !== "none" ? ` ${b.scoreType}` : ""}`,
      )
      .join("; ") || "sin bloques"
  }`;

/** Lo que cambia en cada petición: el día, lo programado alrededor, el material y el foco. */
export function aiWodUserPrompt(context: AiWodContext): string {
  const parts: string[] = [];
  parts.push(
    `## El día\n${lines([
      `Disciplina: ${context.section} (${context.sport}).${context.classType ? ` Tipo de clase: ${context.classType}.` : " Para todas las clases de la disciplina."}`,
      `Fecha: ${context.weekday} ${context.date}.`,
      `Duración de la clase: ${context.minutes} minutos.`,
    ])}`,
  );
  parts.push(
    context.recent.length > 0
      ? `## Programado los días anteriores (para no repetir)\n${context.recent.map(workoutLine).join("\n")}`
      : "## Programado los días anteriores\nNada todavía.",
  );
  if (context.upcoming.length > 0)
    parts.push(
      `## Ya programado los días siguientes (para equilibrar)\n${context.upcoming.map(workoutLine).join("\n")}`,
    );
  parts.push(
    `## Material del box\n${
      context.equipment.length > 0
        ? lines(context.equipment.map((e) => (e.quantity ? `${e.name} (${e.quantity})` : e.name)))
        : "Sin inventario: usa el material de un box estándar (barras, discos, kettlebells, cajones, comba, remo, assault bike, balón medicinal, barras de dominadas) y dilo en las notas si pides algo especial."
    }`,
  );
  parts.push(
    `## Catálogo de movimientos (código: nombre)\n${context.movements.map((m) => `- ${m.code}: ${m.name}`).join("\n")}`,
  );
  parts.push(
    `## Benchmarks del box\n${context.benchmarks.map((b) => `- ${b.name} (${b.scoreType}): ${b.description}`).join("\n")}`,
  );
  parts.push(
    `## Lo que pide el coach\n${
      context.focus
        ? `Foco del día: ${context.focus}`
        : "Sin foco concreto: elige tú el estímulo que mejor equilibra la semana."
    }`,
  );
  return parts.join("\n\n");
}

// --- La salida del modelo ---

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const STRING = { type: "string" };

/**
 * Esquema JSON de la salida estructurada. Solo lo que la API del modelo admite (sin mínimos ni
 * máximos): los límites los pone `resolveWodProposal` al leerla.
 */
export const AI_WOD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "notes", "blocks"],
  properties: {
    title: STRING,
    notes: STRING,
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "title",
          "description",
          "scoreType",
          "timeCapSeconds",
          "movementCode",
          "percent",
          "rmReps",
          "scaled",
          "rx",
          "rxPlus",
        ],
        properties: {
          kind: { type: "string", enum: [...WORKOUT_BLOCK_KINDS] },
          title: STRING,
          description: nullable(STRING),
          scoreType: { type: "string", enum: [...SCORE_TYPES] },
          timeCapSeconds: nullable({ type: "integer" }),
          movementCode: nullable({ type: "string", enum: [...MOVEMENT_CODES] }),
          percent: nullable({ type: "integer" }),
          rmReps: nullable({ type: "integer" }),
          scaled: nullable(STRING),
          rx: nullable(STRING),
          rxPlus: nullable(STRING),
        },
      },
    },
  },
} as const;

/** Lo que devuelve el modelo, leído sin límites (los pone `resolveWodProposal`). */
export const AiWodOutputSchema = z.object({
  title: z.string().nullable(),
  notes: z.string().nullable(),
  blocks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      scoreType: z.string(),
      timeCapSeconds: z.number().nullable(),
      movementCode: z.string().nullable(),
      percent: z.number().nullable(),
      rmReps: z.number().nullable(),
      scaled: z.string().nullable(),
      rx: z.string().nullable(),
      rxPlus: z.string().nullable(),
    }),
  ),
});
export type AiWodOutput = z.infer<typeof AiWodOutputSchema>;

/** La propuesta lista para el editor: título, notas y bloques que pasan la validación del WOD. */
export interface AiWodProposal {
  title: string | null;
  notes: string | null;
  blocks: WorkoutBlockInput[];
}

const cut = (text: string | null | undefined, max: number): string | null => {
  const t = text?.trim();
  return t ? t.slice(0, max).trim() : null;
};
const isKind = (v: string): v is WorkoutBlockKind =>
  (WORKOUT_BLOCK_KINDS as readonly string[]).includes(v);
const isScore = (v: string): v is ScoreType => (SCORE_TYPES as readonly string[]).includes(v);

/**
 * Valida la salida contra el formato del WOD: recorta textos a sus límites, quita lo que no encaja
 * (un movimiento fuera del catálogo, un porcentaje sin movimiento, una máxima que no se puntúa en
 * kilos) y comprueba cada bloque con el esquema del editor. Sin bloques válidos o con un tipo o un
 * marcador desconocidos, la propuesta no vale (nulo).
 */
export function resolveWodProposal(output: AiWodOutput): AiWodProposal | null {
  const blocks: WorkoutBlockInput[] = [];
  for (const raw of output.blocks.slice(0, AI_WOD_MAX_BLOCKS)) {
    if (!isKind(raw.kind) || !isScore(raw.scoreType)) return null;
    const title = cut(raw.title, 80);
    if (!title) continue;
    const movementCode =
      raw.movementCode && MOVEMENT_CODES.includes(raw.movementCode) ? raw.movementCode : null;
    const cap =
      raw.timeCapSeconds !== null && Number.isInteger(raw.timeCapSeconds)
        ? raw.timeCapSeconds
        : null;
    const percent =
      movementCode && raw.percent !== null && Number.isInteger(raw.percent) ? raw.percent : null;
    const rmReps =
      movementCode &&
      raw.scoreType === "load" &&
      (REP_MAXES as readonly number[]).includes(raw.rmReps ?? -1)
        ? (raw.rmReps as WorkoutBlockInput["rmReps"])
        : null;
    const candidate = {
      kind: raw.kind,
      title,
      description: cut(raw.description, 2000),
      scoreType: raw.scoreType,
      timeCapSeconds: cap !== null && cap >= 30 && cap <= 4 * 3600 ? cap : null,
      movementCode,
      percent: percent !== null && percent >= 1 && percent <= 150 ? percent : null,
      rmReps,
      scaled: cut(raw.scaled, 400),
      rx: cut(raw.rx, 400),
      rxPlus: cut(raw.rxPlus, 400),
    };
    const parsed = WorkoutBlockInputSchema.safeParse(candidate);
    if (!parsed.success) return null;
    blocks.push(parsed.data);
  }
  if (blocks.length === 0) return null;
  return { title: cut(output.title, 80), notes: cut(output.notes, 1000), blocks };
}
