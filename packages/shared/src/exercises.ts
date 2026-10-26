import { z } from "zod";
import { MOVEMENT_CODES } from "./fitness.ts";

/**
 * Biblioteca de ejercicios del box (ADR 0050). Lo que en un club deportivo es la biblioteca de
 * tareas con pizarra, en un box es el catálogo de ejercicios: cómo se hace, en qué fijarse, los
 * errores de siempre y cómo se escala, con su vídeo. Sin pizarra, sin jugadores ni espacio.
 */

/** Familias de ejercicio, como las ordena un coach. */
export const EXERCISE_CATEGORIES = [
  "weightlifting",
  "strength",
  "gymnastics",
  "monostructural",
  "kettlebell",
  "accessory",
  "mobility",
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export const ExerciseCategorySchema = z.enum(EXERCISE_CATEGORIES);

/** Material que pide el ejercicio. */
export const EXERCISE_EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "rings",
  "pullup_bar",
  "box",
  "rower",
  "bike",
  "ski",
  "wall_ball",
  "jump_rope",
  "sled",
  "sandbag",
  "med_ball",
  "ghd",
  "rope",
  "parallettes",
  "yoke",
  "bench",
  "bands",
  "bodyweight",
  "other",
] as const;
export type ExerciseEquipment = (typeof EXERCISE_EQUIPMENT)[number];
export const ExerciseEquipmentSchema = z.enum(EXERCISE_EQUIPMENT);

export const EXERCISE_STATUSES = ["active", "archived"] as const;
export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];
export const ExerciseStatusSchema = z.enum(EXERCISE_STATUSES);

const LongText = z.string().trim().max(2000);

/** Un vídeo es una URL http(s); vacío, sin vídeo. */
const VideoUrl = z
  .string()
  .trim()
  .max(500)
  .url("Pon una dirección completa, con https://.")
  .refine((v) => /^https?:\/\//i.test(v), "Pon una dirección completa, con https://.");

const ExerciseFields = z.object({
  name: z.string().trim().min(1).max(80),
  category: ExerciseCategorySchema,
  equipment: z.array(ExerciseEquipmentSchema).max(EXERCISE_EQUIPMENT.length),
  /** Movimiento del catálogo: con él, el WOD calcula los kilos de cada atleta y entran sus marcas. */
  movementCode: z
    .string()
    .refine((v) => MOVEMENT_CODES.includes(v), "Movimiento desconocido.")
    .nullable()
    .optional(),
  /** Cómo se hace. */
  description: LongText.nullable().optional(),
  /** En qué fijarse. */
  coachingPoints: LongText.nullable().optional(),
  /** Los errores de siempre. */
  commonFaults: LongText.nullable().optional(),
  /** Escalados y progresiones. */
  scaling: LongText.nullable().optional(),
  videoUrl: VideoUrl.nullable().optional(),
  /** Disciplina a la que pertenece; nula, de todo el box. */
  sectionId: z.string().uuid().nullable().optional(),
});

export const ExerciseCreateSchema = ExerciseFields.extend({
  equipment: ExerciseFields.shape.equipment.default([]),
});
export type ExerciseCreate = z.infer<typeof ExerciseCreateSchema>;

export const ExerciseUpdateSchema = ExerciseFields.partial()
  .extend({ status: ExerciseStatusSchema.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "No hay nada que cambiar.",
  });
export type ExerciseUpdate = z.infer<typeof ExerciseUpdateSchema>;

/** Para incrustar el vídeo: YouTube y Vimeo se ven dentro; el resto, como enlace. */
export function exerciseEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      parsed.searchParams.get("v") ??
      parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ??
      null;
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.match(/(\d{5,})/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}
