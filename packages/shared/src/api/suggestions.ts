import { z } from "zod";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_PUBLIC_STATUSES,
  SUGGESTION_RESPONSE_MAX,
  SUGGESTION_STATUSES,
  SUGGESTION_TITLE_MAX,
  SuggestionAreaSchema,
  SuggestionEtaSchema,
} from "../suggestions.ts";

/** Contratos de las mejoras de la plataforma (ADR 0046). */

const Title = z.string().trim().min(3).max(SUGGESTION_TITLE_MAX);

// --- El club: solo la administración (`org.suggestions`) ---

/**
 * Una mejora de la hoja de ruta, tal como la ve cualquier club: la versión pública, sus votos y
 * si este club la pidió o la ha votado. Nunca qué otros clubes la pidieron o la votaron.
 */
export const RoadmapItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  area: SuggestionAreaSchema,
  status: z.enum(SUGGESTION_PUBLIC_STATUSES),
  eta: z.string().nullable(),
  /** Puesto en lo que viene (en desarrollo y planificadas): 1 es lo siguiente. */
  rank: z.number().int().positive().nullable(),
  votes: z.number().int().nonnegative(),
  votedByClub: z.boolean(),
  /** Este club la pidió, él o con otra petición que se unió a esta. */
  requestedByClub: z.boolean(),
  publishedAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
});
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
/** En el orden de la hoja de ruta: en desarrollo, planificadas, en estudio y disponibles. */
export const RoadmapResponseSchema = z.object({ items: z.array(RoadmapItemSchema) });
export type RoadmapResponse = z.infer<typeof RoadmapResponseSchema>;
export const RoadmapItemResponseSchema = z.object({ item: RoadmapItemSchema });
export type RoadmapItemResponse = z.infer<typeof RoadmapItemResponseSchema>;

/** Una sugerencia del propio club: lo que escribió, en qué está y lo que le ha contestado la plataforma. */
export const ClubSuggestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  area: SuggestionAreaSchema,
  status: z.enum(SUGGESTION_STATUSES),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  /** Respuesta de la plataforma, solo para este club. */
  response: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** Con qué título salió en la hoja de ruta, si se publicó. */
  publicTitle: z.string().nullable(),
  eta: z.string().nullable(),
  votes: z.number().int().nonnegative().nullable(),
  /** La mejora publicada a la que se unió. Nula si no se ha unido o si esa aún no es pública. */
  mergedInto: z
    .object({
      id: z.string(),
      title: z.string(),
      status: z.enum(SUGGESTION_PUBLIC_STATUSES),
      eta: z.string().nullable(),
    })
    .nullable(),
});
export type ClubSuggestion = z.infer<typeof ClubSuggestionSchema>;
export const ClubSuggestionsResponseSchema = z.object({
  suggestions: z.array(ClubSuggestionSchema),
});
export type ClubSuggestionsResponse = z.infer<typeof ClubSuggestionsResponseSchema>;
export const ClubSuggestionResponseSchema = z.object({ suggestion: ClubSuggestionSchema });
export type ClubSuggestionResponse = z.infer<typeof ClubSuggestionResponseSchema>;

export const SuggestionCreateSchema = z.object({
  title: Title,
  body: z.string().trim().min(10).max(SUGGESTION_BODY_MAX),
  area: SuggestionAreaSchema,
});
export type SuggestionCreate = z.infer<typeof SuggestionCreateSchema>;

// --- La plataforma: administradores de plataforma ---

export const PlatformSuggestionSchema = z.object({
  id: z.string(),
  /** Lo que escribió el club, tal cual. En las que crea la plataforma, igual que la versión pública. */
  title: z.string(),
  body: z.string(),
  area: SuggestionAreaSchema,
  status: z.enum(SUGGESTION_STATUSES),
  /** Club que la pidió. Nula: la añadió la plataforma. */
  organization: z.object({ slug: z.string(), name: z.string() }).nullable(),
  createdBy: z.object({ name: z.string(), email: z.string() }).nullable(),
  createdAt: z.string(),
  publicTitle: z.string().nullable(),
  publicBody: z.string().nullable(),
  response: z.string().nullable(),
  eta: z.string().nullable(),
  position: z.number().int().nullable(),
  votes: z.number().int().nonnegative(),
  mergedInto: z.object({ id: z.string(), title: z.string() }).nullable(),
  /** Peticiones de otros clubes que se han unido a esta. */
  mergedCount: z.number().int().nonnegative(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
});
export type PlatformSuggestion = z.infer<typeof PlatformSuggestionSchema>;
export const PlatformSuggestionsResponseSchema = z.object({
  suggestions: z.array(PlatformSuggestionSchema),
});
export type PlatformSuggestionsResponse = z.infer<typeof PlatformSuggestionsResponseSchema>;
export const PlatformSuggestionResponseSchema = z.object({ suggestion: PlatformSuggestionSchema });
export type PlatformSuggestionResponse = z.infer<typeof PlatformSuggestionResponseSchema>;

/** Una mejora que la plataforma pone en la hoja de ruta sin que la haya pedido un club. */
export const PlatformSuggestionCreateSchema = z.object({
  title: Title,
  body: z.string().trim().max(SUGGESTION_BODY_MAX).default(""),
  area: SuggestionAreaSchema,
  status: z.enum(SUGGESTION_PUBLIC_STATUSES).default("open"),
  eta: SuggestionEtaSchema.nullable().default(null),
});
export type PlatformSuggestionCreate = z.infer<typeof PlatformSuggestionCreateSchema>;

/**
 * Revisar una sugerencia: aceptarla (publicarla en estudio, planificarla…), descartarla o unirla
 * a otra, reescribir su versión pública, darle fecha aproximada y contestar al club.
 */
export const PlatformSuggestionUpdateSchema = z.object({
  status: z.enum(SUGGESTION_STATUSES).optional(),
  publicTitle: Title.optional(),
  publicBody: z.string().trim().max(SUGGESTION_BODY_MAX).nullable().optional(),
  area: SuggestionAreaSchema.optional(),
  eta: SuggestionEtaSchema.nullable().optional(),
  response: z.string().trim().max(SUGGESTION_RESPONSE_MAX).nullable().optional(),
  /** Obligatorio al unirla a otra (`merged`). */
  mergedIntoId: z.string().uuid().nullable().optional(),
});
export type PlatformSuggestionUpdate = z.infer<typeof PlatformSuggestionUpdateSchema>;

/** Orden de lo que viene: los ids de las mejoras en desarrollo y planificadas, la primera la siguiente. */
export const PlatformSuggestionOrderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type PlatformSuggestionOrder = z.infer<typeof PlatformSuggestionOrderSchema>;
