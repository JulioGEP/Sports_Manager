import { z } from "zod";
import type { Locale, LocalizedText } from "./locales.ts";
import { DateOnlySchema } from "./structure.ts";

/**
 * Retos por puntos (Fase 1, Bloque 13, ADR 0030): la generalización del "Repte d'estiu" del
 * prototipo (docs/dominio.md 1.6 y 4.5). Un reto es un periodo con un catálogo de pruebas y
 * un registro de actividad por jugador. La familia registra, el club valida. Nunca hay ranking
 * para las familias: cada una ve solo los puntos de los suyos (DESIGN.md 0.10 y 10).
 *
 * Ámbito (ADR 0032): un reto no es del club entero. Es de una sección (toda la sección) o de un
 * solo equipo de esa sección, de manera independiente. Un jugador participa en los retos activos
 * de las secciones y equipos donde está esta temporada; puede tener varios a la vez.
 */

export const CHALLENGE_STATUSES = ["draft", "active", "closed"] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];
export const ChallengeStatusSchema = z.enum(CHALLENGE_STATUSES);

/** Áreas de las pruebas: entrenamiento, técnica y hábitos (las E, T y H del prototipo). */
export const CHALLENGE_AREAS = ["training", "technique", "habits"] as const;
export type ChallengeArea = (typeof CHALLENGE_AREAS)[number];
export const ChallengeAreaSchema = z.enum(CHALLENGE_AREAS);

/** Sesiones (se cuentan veces) o valoración (se puntúa de 1 a 5). */
export const CHALLENGE_TASK_KINDS = ["sessions", "rating"] as const;
export type ChallengeTaskKind = (typeof CHALLENGE_TASK_KINDS)[number];
export const ChallengeTaskKindSchema = z.enum(CHALLENGE_TASK_KINDS);

export const CHALLENGE_TASK_STATUSES = ["active", "archived"] as const;
export type ChallengeTaskStatus = (typeof CHALLENGE_TASK_STATUSES)[number];

/** Un registro nace enviado por la familia y lo valida el club. Solo cuentan los aprobados. */
export const SUBMISSION_STATUSES = ["submitted", "approved", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const SubmissionStatusSchema = z.enum(SUBMISSION_STATUSES);

export const CHALLENGE_NAME_MAX = 80;
export const CHALLENGE_DESCRIPTION_MAX = 400;
export const CHALLENGE_TASK_NAME_MAX = 80;
export const CHALLENGE_NOTE_MAX = 280;
export const SUBMISSION_MAX_QUANTITY = 100;
export const RATING_MAX = 5;

const Points = z.number().int().min(0).max(100_000);

export const ChallengeCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(CHALLENGE_NAME_MAX),
    description: z.string().trim().max(CHALLENGE_DESCRIPTION_MAX).nullable().optional(),
    /** Sección del reto. Obligatoria: no hay retos de todo el club. */
    sectionId: z.string().uuid(),
    /** Un equipo concreto de esa sección. Nulo: el reto es de toda la sección. */
    teamId: z.string().uuid().nullable().optional(),
    seasonId: z.string().uuid().nullable().optional(),
    startsOn: DateOnlySchema.nullable().optional(),
    endsOn: DateOnlySchema.nullable().optional(),
    /** Puntos para "cumplir" y puntos a los que aspirar. */
    minPoints: Points,
    targetPoints: Points,
    /** Nace en borrador salvo que se pida activo. */
    status: z.enum(["draft", "active"]).optional(),
    /** Crea el catálogo de ejemplo del prototipo en el idioma del club. */
    withDefaultTasks: z.boolean().optional(),
  })
  .refine((v) => v.targetPoints >= v.minPoints, {
    message: "El objetivo no puede ser menor que el mínimo.",
    path: ["targetPoints"],
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, {
    message: "El reto tiene que acabar después de empezar.",
    path: ["endsOn"],
  });
export type ChallengeCreate = z.infer<typeof ChallengeCreateSchema>;

export const ChallengeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(CHALLENGE_NAME_MAX).optional(),
  description: z.string().trim().max(CHALLENGE_DESCRIPTION_MAX).nullable().optional(),
  /** El ámbito solo cambia mientras el reto es un borrador: después ya tiene participantes. */
  sectionId: z.string().uuid().optional(),
  teamId: z.string().uuid().nullable().optional(),
  seasonId: z.string().uuid().nullable().optional(),
  startsOn: DateOnlySchema.nullable().optional(),
  endsOn: DateOnlySchema.nullable().optional(),
  minPoints: Points.optional(),
  targetPoints: Points.optional(),
  /** Activar o cerrar. Un reto cerrado no admite registros ni validaciones. */
  status: ChallengeStatusSchema.optional(),
});
export type ChallengeUpdate = z.infer<typeof ChallengeUpdateSchema>;

export const ChallengeTaskCreateSchema = z.object({
  name: z.string().trim().min(1).max(CHALLENGE_TASK_NAME_MAX),
  area: ChallengeAreaSchema,
  kind: ChallengeTaskKindSchema,
  /** Puntos por sesión o por punto de valoración. */
  pointsPerUnit: z.number().int().min(1).max(1000),
  /** Tope de puntos de la prueba en todo el reto. Nulo: sin tope. */
  maxPoints: z.number().int().min(1).max(100_000).nullable().optional(),
});
export type ChallengeTaskCreate = z.infer<typeof ChallengeTaskCreateSchema>;

export const ChallengeTaskUpdateSchema = ChallengeTaskCreateSchema.partial().extend({
  status: z.enum(CHALLENGE_TASK_STATUSES).optional(),
});
export type ChallengeTaskUpdate = z.infer<typeof ChallengeTaskUpdateSchema>;

/** Lo que registra una familia: la prueba, cuántas veces (o qué valoración) y una nota o enlace. */
export const SubmissionCreateSchema = z.object({
  taskId: z.string().uuid(),
  quantity: z.number().int().min(1).max(SUBMISSION_MAX_QUANTITY),
  note: z.string().trim().max(CHALLENGE_NOTE_MAX).nullable().optional(),
  /** Por defecto, hoy. */
  happenedOn: DateOnlySchema.optional(),
});
export type SubmissionCreate = z.infer<typeof SubmissionCreateSchema>;

export const SubmissionReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(CHALLENGE_NOTE_MAX).nullable().optional(),
});
export type SubmissionReview = z.infer<typeof SubmissionReviewSchema>;

/**
 * Puntos de un registro: cantidad por puntos de la prueba, con el tope de la prueba como techo
 * (regla del prototipo). `alreadyEarned` son los puntos ya aprobados o pendientes de esa prueba
 * para ese jugador: el tope es por prueba y reto, no por registro.
 */
export function pointsFor(
  task: { kind: ChallengeTaskKind; pointsPerUnit: number; maxPoints: number | null },
  quantity: number,
  alreadyEarned = 0,
): number {
  const units = task.kind === "rating" ? Math.min(quantity, RATING_MAX) : quantity;
  const raw = units * task.pointsPerUnit;
  if (task.maxPoints === null) return raw;
  return Math.max(0, Math.min(raw, task.maxPoints - alreadyEarned));
}

/** Catálogo de ejemplo del prototipo (docs/dominio.md 1.6), para arrancar un reto sin picar datos. */
export const DEFAULT_CHALLENGE_TASKS: readonly (Omit<ChallengeTaskCreate, "name"> & {
  name: LocalizedText;
})[] = [
  {
    name: { es: "Entrenamiento completo", ca: "Entrenament complet", en: "Full training session" },
    area: "training",
    kind: "sessions",
    pointsPerUnit: 2,
    maxPoints: 20,
  },
  {
    name: { es: "Trabajo exterior extra", ca: "Treball exterior extra", en: "Extra outdoor work" },
    area: "training",
    kind: "sessions",
    pointsPerUnit: 1,
    maxPoints: 10,
  },
  {
    name: { es: "Reto de 50 toques", ca: "Repte de 50 tocs", en: "50-touch challenge" },
    area: "technique",
    kind: "sessions",
    pointsPerUnit: 2,
    maxPoints: 20,
  },
  {
    name: { es: "Reto de 100 toques", ca: "Repte de 100 tocs", en: "100-touch challenge" },
    area: "technique",
    kind: "sessions",
    pointsPerUnit: 4,
    maxPoints: 40,
  },
  {
    name: {
      es: "Árbol de gestos técnicos",
      ca: "Arbre de gestos tècnics",
      en: "Technical gestures tree",
    },
    area: "technique",
    kind: "rating",
    pointsPerUnit: 2,
    maxPoints: 10,
  },
  {
    name: { es: "Comer sano", ca: "Menjar sa", en: "Eat healthy" },
    area: "habits",
    kind: "rating",
    pointsPerUnit: 1,
    maxPoints: 5,
  },
  {
    name: { es: "Dormir bien", ca: "Dormir bé", en: "Sleep well" },
    area: "habits",
    kind: "rating",
    pointsPerUnit: 1,
    maxPoints: 5,
  },
  {
    name: { es: "Lectura", ca: "Lectura", en: "Reading" },
    area: "habits",
    kind: "rating",
    pointsPerUnit: 1,
    maxPoints: 5,
  },
  {
    name: {
      es: "Foto del club por el mundo",
      ca: "Foto del club pel món",
      en: "Club photo abroad",
    },
    area: "habits",
    kind: "sessions",
    pointsPerUnit: 5,
    maxPoints: 10,
  },
  {
    name: {
      es: "Ver un partido del club",
      ca: "Veure un partit del club",
      en: "Watch a club match",
    },
    area: "habits",
    kind: "sessions",
    pointsPerUnit: 1,
    maxPoints: 10,
  },
];

export function defaultChallengeTasks(locale: Locale): ChallengeTaskCreate[] {
  return DEFAULT_CHALLENGE_TASKS.map((task) => ({ ...task, name: task.name[locale] }));
}
