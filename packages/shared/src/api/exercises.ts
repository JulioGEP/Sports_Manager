import { z } from "zod";
import { EXERCISE_CATEGORIES, EXERCISE_EQUIPMENT, EXERCISE_STATUSES } from "../exercises.ts";

/** Contratos de la biblioteca de ejercicios del box (ADR 0050). */

const Ref = z.object({ id: z.string(), name: z.string() });

export const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(EXERCISE_CATEGORIES),
  equipment: z.array(z.enum(EXERCISE_EQUIPMENT)),
  movementCode: z.string().nullable(),
  description: z.string().nullable(),
  coachingPoints: z.string().nullable(),
  commonFaults: z.string().nullable(),
  scaling: z.string().nullable(),
  videoUrl: z.string().nullable(),
  section: Ref.nullable(),
  status: z.enum(EXERCISE_STATUSES),
  updatedAt: z.string(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const ExercisesResponseSchema = z.object({
  exercises: z.array(ExerciseSchema),
  /** Quien pregunta puede crear, editar y archivar. */
  canWrite: z.boolean(),
  /** Disciplinas del box, para el formulario. */
  sections: z.array(Ref),
});
export type ExercisesResponse = z.infer<typeof ExercisesResponseSchema>;

export const ExerciseResponseSchema = z.object({ exercise: ExerciseSchema });
export type ExerciseResponse = z.infer<typeof ExerciseResponseSchema>;
