import { z } from "zod";

export const DatabaseStatusSchema = z.object({
  ok: z.boolean(),
  /** Región AWS del servidor de base de datos, deducida del host de conexión. */
  region: z.string().nullable(),
  latencyMs: z.number().nullable(),
});

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  time: z.string(),
  /** Región de Netlify donde se ejecuta la función (código de aeropuerto). */
  region: z.string().nullable(),
  db: DatabaseStatusSchema,
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type DatabaseStatus = z.infer<typeof DatabaseStatusSchema>;
