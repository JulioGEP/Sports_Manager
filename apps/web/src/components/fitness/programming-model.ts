import {
  movementByCode,
  type BenchmarkEntry,
  type Capacity,
  type DayRole,
  type Locale,
  type RepMax,
  type ScoreType,
  type WorkoutBlockInput,
  type WorkoutBlockKind,
  type WorkoutBlockView,
  type WorkoutTrack,
  type WorkoutView,
} from "@sportsmanager/shared";

/**
 * El editor del WOD (ADR 0050) no pide "marcador" ni "time cap": pide el **formato** del bloque,
 * que es como lo piensa un coach (por tiempo, AMRAP, EMOM, series al %, buscar una máxima) y que
 * decide el marcador, los minutos y el movimiento. Aquí se traduce en los dos sentidos.
 */
export const FORMATS = [
  "for_time",
  "amrap",
  "emom",
  "reps",
  "distance",
  "calories",
  "percent",
  "max",
  "none",
] as const;
export type Format = (typeof FORMATS)[number];

/** Los formatos de cada tipo de bloque, en el orden en que se ofrecen. */
export const FORMATS_BY_KIND: Record<WorkoutBlockKind, readonly Format[]> = {
  wod: ["for_time", "amrap", "emom", "reps", "distance", "calories", "none"],
  accessory: ["none", "for_time", "amrap", "emom", "reps", "distance", "calories"],
  strength: ["percent", "max", "none"],
  warmup: ["none", "for_time", "amrap", "emom", "reps"],
  skill: ["none", "for_time", "amrap", "emom", "reps"],
  cooldown: ["none", "for_time", "amrap", "emom", "reps"],
};

/** Formato con el que nace cada tipo de bloque. */
export const DEFAULT_FORMAT: Record<WorkoutBlockKind, Format> = {
  warmup: "none",
  strength: "percent",
  skill: "none",
  wod: "for_time",
  accessory: "none",
  cooldown: "none",
};

/** Los tipos que nacen sin marcador: el marcador se añade solo si hace falta. */
export const QUIET_KINDS: readonly WorkoutBlockKind[] = ["warmup", "skill", "cooldown"];

/** Formatos con minutos: el cap (opcional) o la duración (AMRAP y EMOM, obligatoria). */
export const MINUTES_REQUIRED: readonly Format[] = ["amrap", "emom"];
export const MINUTES_OPTIONAL: readonly Format[] = ["for_time", "reps", "distance", "calories"];

/** El marcador que guarda cada formato. */
const SCORE_OF: Record<Format, ScoreType> = {
  for_time: "time",
  amrap: "rounds_reps",
  emom: "none",
  reps: "reps",
  distance: "distance",
  calories: "calories",
  percent: "load",
  max: "load",
  none: "none",
};

/** Un bloque mientras se escribe: los números van como texto hasta guardar. */
export interface BlockDraft {
  key: string;
  kind: WorkoutBlockKind;
  title: string;
  description: string;
  format: Format;
  minutes: string;
  movementCode: string;
  percent: string;
  rmReps: string;
  foundations: string;
  scaled: string;
  rx: string;
  rxPlus: string;
  /** Planificación (ADR 0053): capacidad, minutos previstos, pista y ejercicios enlazados. */
  capacity: Capacity | "";
  plannedMinutes: string;
  track: WorkoutTrack;
  exerciseIds: string[];
}

/** La capacidad con la que nace cada tipo de bloque (se cambia en el bloque). */
export const DEFAULT_CAPACITY: Record<WorkoutBlockKind, Capacity | ""> = {
  warmup: "mobility",
  strength: "strength",
  skill: "gymnastics",
  wod: "",
  accessory: "",
  cooldown: "mobility",
};

let keySeq = 0;
export const newKey = () => `b${++keySeq}`;

/** Letra de un bloque por su posición: A, B, C… */
export const letterOf = (index: number) => String.fromCharCode(65 + index);

/** Formato de un bloque guardado. */
export function formatOf(b: {
  scoreType: ScoreType;
  timeCapSeconds: number | null;
  rmReps: number | null;
}): Format {
  switch (b.scoreType) {
    case "time":
      return "for_time";
    case "rounds_reps":
      return "amrap";
    case "load":
      return b.rmReps ? "max" : "percent";
    case "none":
      return b.timeCapSeconds ? "emom" : "none";
    default:
      return b.scoreType;
  }
}

const minutesText = (seconds: number | null) =>
  seconds ? String(Math.round((seconds / 60) * 10) / 10).replace(".", ",") : "";

export function draftOf(b: WorkoutBlockInput): BlockDraft {
  return {
    key: newKey(),
    kind: b.kind,
    title: b.title,
    description: b.description ?? "",
    format: formatOf({
      scoreType: b.scoreType,
      timeCapSeconds: b.timeCapSeconds ?? null,
      rmReps: b.rmReps ?? null,
    }),
    minutes: minutesText(b.timeCapSeconds ?? null),
    movementCode: b.movementCode ?? "",
    percent: b.percent ? String(b.percent) : "",
    rmReps: b.rmReps ? String(b.rmReps) : "1",
    foundations: b.foundations ?? "",
    scaled: b.scaled ?? "",
    rx: b.rx ?? "",
    rxPlus: b.rxPlus ?? "",
    capacity: b.capacity ?? "",
    plannedMinutes: b.plannedMinutes ? String(b.plannedMinutes) : "",
    track: b.track ?? "class",
    exerciseIds: b.exerciseIds ?? [],
  };
}

export function emptyBlock(kind: WorkoutBlockKind): BlockDraft {
  return {
    key: newKey(),
    kind,
    title: "",
    description: "",
    format: DEFAULT_FORMAT[kind],
    minutes: "",
    movementCode: "",
    percent: "",
    rmReps: "1",
    foundations: "",
    scaled: "",
    rx: "",
    rxPlus: "",
    capacity: DEFAULT_CAPACITY[kind],
    plannedMinutes: "",
    track: "class",
    exerciseIds: [],
  };
}

/** Cambiar el tipo de un bloque: si su formato no encaja con el nuevo tipo, el de por defecto. */
export function withKind(b: BlockDraft, kind: WorkoutBlockKind): BlockDraft {
  return {
    ...b,
    kind,
    format: FORMATS_BY_KIND[kind].includes(b.format) ? b.format : DEFAULT_FORMAT[kind],
  };
}

/** Minutos escritos ("12", "12,5") a segundos; nulo si no hay o no son un número. */
export function minutesToSeconds(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 60);
}

const orNull = (text: string) => (text.trim() ? text.trim() : null);

/**
 * El bloque como lo pide la API. Un bloque sin título se llama como su tipo ("Calentamiento"):
 * no hace falta inventarse un nombre para el calentamiento de cada día.
 */
export function inputOf(b: BlockDraft, kindLabel: string): WorkoutBlockInput {
  const strength = b.format === "percent" || b.format === "max";
  const withMinutes = MINUTES_REQUIRED.includes(b.format) || MINUTES_OPTIONAL.includes(b.format);
  const scoreType: ScoreType = SCORE_OF[b.format];
  return {
    kind: b.kind,
    title: b.title.trim() || kindLabel,
    description: orNull(b.description),
    scoreType,
    timeCapSeconds: withMinutes ? minutesToSeconds(b.minutes) : null,
    movementCode: strength ? orNull(b.movementCode) : null,
    percent: b.format === "percent" && b.percent.trim() ? Number(b.percent) : null,
    rmReps: b.format === "max" ? (Number(b.rmReps || "1") as RepMax) : null,
    foundations: orNull(b.foundations),
    scaled: orNull(b.scaled),
    rx: orNull(b.rx),
    rxPlus: orNull(b.rxPlus),
    capacity: b.capacity || null,
    plannedMinutes: plannedOf(b.plannedMinutes),
    track: b.track,
    exerciseIds: b.exerciseIds,
  };
}

/** Minutos previstos escritos a número entero (1 a 120); nulo si no hay o no valen. */
export function plannedOf(text: string): number | null {
  const v = Number(text.trim());
  return text.trim() && Number.isInteger(v) && v >= 1 && v <= 120 ? v : null;
}

/** Los formatos que se pueden sacar de un benchmark del catálogo. */
export function benchmarkBlock(b: BenchmarkEntry, locale: Locale): Partial<BlockDraft> {
  return {
    kind: "wod",
    title: b.name,
    description: b.description[locale],
    format: formatOf({ scoreType: b.scoreType, timeCapSeconds: null, rmReps: null }),
    minutes: b.minutes ? String(b.minutes) : "",
  };
}

/**
 * Una línea legible por bloque para la semana: "Back squat 5x5 · al 75 % de back squat",
 * "Fran · por tiempo, cap 10 min". `t` es el diccionario `fitness.staff.programming.line`.
 */
export function detailOf(
  b: Pick<WorkoutBlockView, "scoreType" | "timeCapSeconds" | "rmReps" | "percent"> & {
    movementCode: string | null;
  },
  t: (key: string, values?: Record<string, string | number>) => string,
  movementName: (code: string | null | undefined) => string,
): string | null {
  const format = formatOf(b);
  const minutes = b.timeCapSeconds ? Math.round(b.timeCapSeconds / 6) / 10 : null;
  const movement = b.movementCode ? movementName(b.movementCode) : null;
  switch (format) {
    case "for_time":
      return minutes ? t("forTimeCap", { minutes }) : t("forTime");
    case "amrap":
      return t("amrap", { minutes: minutes ?? 0 });
    case "emom":
      return t("emom", { minutes: minutes ?? 0 });
    case "reps":
    case "distance":
    case "calories":
      return t(format);
    case "percent":
      return b.percent && movement
        ? t("percent", { percent: b.percent, movement })
        : movement
          ? t("load", { movement })
          : t("loadOnly");
    case "max":
      return t("max", { rm: b.rmReps ?? 1, movement: movement ?? "" });
    default:
      return null;
  }
}

/** El WOD tal como lo verá el atleta, a partir del borrador: para la vista previa. */
export function previewOf(input: {
  id: string;
  onDate: string;
  section: { id: string; name: string };
  title: string;
  notes: string;
  blocks: BlockDraft[];
  kindLabel: (kind: WorkoutBlockKind) => string;
  locale: Locale;
  /** El papel y la intención del día, si sirve a un plan. */
  dayRole?: DayRole | null;
  intent?: WorkoutView["intent"];
  why?: string[];
  exerciseName?: (id: string) => string | null;
}): WorkoutView {
  return {
    id: input.id,
    onDate: input.onDate,
    section: input.section,
    team: null,
    title: input.title.trim() || null,
    notes: input.notes.trim() || null,
    status: "draft",
    publishAt: null,
    visible: false,
    createdBy: null,
    updatedAt: new Date(0).toISOString(),
    plan: null,
    dayRole: input.dayRole ?? null,
    intent: input.intent ?? null,
    why: input.why ?? [],
    plusHidden: 0,
    blocks: input.blocks.map((b, i) => {
      const value = inputOf(b, input.kindLabel(b.kind));
      const movement = movementByCode(value.movementCode);
      return {
        id: b.key,
        label: letterOf(i),
        kind: value.kind,
        title: value.title,
        description: value.description ?? null,
        scoreType: value.scoreType,
        timeCapSeconds: value.timeCapSeconds ?? null,
        movement: movement ? { code: movement.code, name: movement.name[input.locale] } : null,
        percent: value.percent ?? null,
        rmReps: value.rmReps ?? null,
        foundations: value.foundations ?? null,
        scaled: value.scaled ?? null,
        rx: value.rx ?? null,
        rxPlus: value.rxPlus ?? null,
        capacity: value.capacity ?? null,
        plannedMinutes: value.plannedMinutes ?? null,
        track: value.track ?? "class",
        exercises: (value.exerciseIds ?? []).flatMap((id) => {
          const name = input.exerciseName?.(id);
          return name ? [{ id, name }] : [];
        }),
        mine: null,
        results: 0,
      };
    }),
  };
}
