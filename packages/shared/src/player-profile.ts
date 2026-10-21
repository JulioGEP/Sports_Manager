import { z } from "zod";
import { LOGO_CONTENT_TYPES } from "./organizations.ts";
import { DateOnlySchema } from "./structure.ts";

/**
 * Ficha ampliada del jugador (Fase 1, Bloque 12, ADR 0029): foto, indicadores, objetivo
 * individual, plan de desarrollo individual (PDI) y registros del timeline. Los catálogos son
 * listas en código que la base convierte en restricciones CHECK (docs/modelo-datos.md).
 */

// --- Foto ---

/** Mismos formatos que el logo del club (ADR 0024): PNG, JPEG o WebP. Nunca SVG. */
export const PLAYER_PHOTO_CONTENT_TYPES = LOGO_CONTENT_TYPES;
export type PlayerPhotoContentType = (typeof PLAYER_PHOTO_CONTENT_TYPES)[number];
/** La web reduce la foto antes de subirla (lado mayor de 640 px); el límite solo frena abusos. */
export const PLAYER_PHOTO_MAX_BYTES = 2_000_000;
export const PLAYER_PHOTO_MAX_SIDE_PX = 640;

// --- Indicadores ---

/**
 * Cuatro lecturas rápidas del jugador, de 0 a 100, con una nota corta que las explica.
 * Las pone el personal del club; las familias no las ven comparadas con nadie (DESIGN.md 10).
 */
export const PLAYER_INDICATOR_DIMENSIONS = ["sport", "body", "wellbeing", "commitment"] as const;
export type PlayerIndicatorDimension = (typeof PLAYER_INDICATOR_DIMENSIONS)[number];
export const PlayerIndicatorDimensionSchema = z.enum(PLAYER_INDICATOR_DIMENSIONS);

export const PLAYER_INDICATOR_NOTE_MAX = 80;
export const PlayerIndicatorScoreSchema = z.number().int().min(0).max(100);
const IndicatorInput = z.object({
  score: PlayerIndicatorScoreSchema,
  note: z.string().trim().max(PLAYER_INDICATOR_NOTE_MAX).nullable().optional(),
});
export type PlayerIndicatorInput = z.infer<typeof IndicatorInput>;

/** Cambia una o varias dimensiones; las que no vienen se quedan como estaban. */
export const PlayerIndicatorsUpdateSchema = z
  .object({
    sport: IndicatorInput.optional(),
    body: IndicatorInput.optional(),
    wellbeing: IndicatorInput.optional(),
    commitment: IndicatorInput.optional(),
  })
  .refine((v) => PLAYER_INDICATOR_DIMENSIONS.some((d) => v[d] !== undefined), {
    message: "Indica al menos una dimensión.",
  });
export type PlayerIndicatorsUpdate = z.infer<typeof PlayerIndicatorsUpdateSchema>;

// --- Objetivo individual ---

export const PLAYER_OBJECTIVE_TITLE_MAX = 160;
export const PlayerObjectiveUpdateSchema = z.object({
  title: z.string().trim().min(1).max(PLAYER_OBJECTIVE_TITLE_MAX),
  /** Progreso registrado, de 0 a 100. */
  progress: z.number().int().min(0).max(100),
  /** Responsable: un miembro del club (entrenador o administración). */
  ownerUserId: z.string().uuid().nullable().optional(),
  reviewOn: DateOnlySchema.nullable().optional(),
});
export type PlayerObjectiveUpdate = z.infer<typeof PlayerObjectiveUpdateSchema>;

// --- Plan de desarrollo individual (PDI) ---

/** Las seis áreas del PDI. Son la estructura del producto, no un catálogo por club. */
export const DEVELOPMENT_AREAS = [
  "technical",
  "tactical",
  "physical",
  "emotional",
  "habits",
  "person",
] as const;
export type DevelopmentArea = (typeof DEVELOPMENT_AREAS)[number];

/** Borrador (estructura inicial), en marcha, o compartido con la familia. */
export const DEVELOPMENT_PLAN_STATUSES = ["draft", "active", "shared"] as const;
export type DevelopmentPlanStatus = (typeof DEVELOPMENT_PLAN_STATUSES)[number];
export const DevelopmentPlanStatusSchema = z.enum(DEVELOPMENT_PLAN_STATUSES);

export const DEVELOPMENT_GOAL_MAX = 200;
const Goal = z.string().trim().max(DEVELOPMENT_GOAL_MAX).nullable().optional();
export const DevelopmentPlanUpdateSchema = z.object({
  technical: Goal,
  tactical: Goal,
  physical: Goal,
  emotional: Goal,
  habits: Goal,
  person: Goal,
  coordinatorUserId: z.string().uuid().nullable().optional(),
  nextReviewOn: DateOnlySchema.nullable().optional(),
  status: DevelopmentPlanStatusSchema.optional(),
});
export type DevelopmentPlanUpdate = z.infer<typeof DevelopmentPlanUpdateSchema>;

// --- Timeline ---

/**
 * Registros del jugador. Los genera la API al pasar algo (plantilla, estado, objetivo, PDI,
 * foto, cierre de un reto) y el personal puede añadir anotaciones. `joined` no se guarda: sale
 * de la fecha de alta (`joined_on`, o la creación de la ficha si no se indicó).
 */
export const PLAYER_EVENT_KINDS = [
  "joined",
  "roster_added",
  "roster_removed",
  "status_changed",
  "objective_updated",
  "indicators_updated",
  "plan_updated",
  "photo_updated",
  "note",
  /** Reto cerrado con los puntos aprobados del jugador (Bloque 13). */
  "challenge_closed",
] as const;
export type PlayerEventKind = (typeof PLAYER_EVENT_KINDS)[number];

export const PLAYER_NOTE_MAX = 280;
export const PlayerNoteCreateSchema = z.object({
  text: z.string().trim().min(1).max(PLAYER_NOTE_MAX),
  /** Por defecto, hoy. */
  happenedOn: DateOnlySchema.optional(),
});
export type PlayerNoteCreate = z.infer<typeof PlayerNoteCreateSchema>;

/** Años cumplidos en el club desde la fecha de alta, o 0 si lleva menos de un año. */
export function yearsSince(isoDate: string, on: Date = new Date()): number {
  const since = new Date(isoDate);
  if (Number.isNaN(since.getTime())) return 0;
  let years = on.getUTCFullYear() - since.getUTCFullYear();
  const before =
    on.getUTCMonth() < since.getUTCMonth() ||
    (on.getUTCMonth() === since.getUTCMonth() && on.getUTCDate() < since.getUTCDate());
  if (before) years -= 1;
  return Math.max(0, years);
}
