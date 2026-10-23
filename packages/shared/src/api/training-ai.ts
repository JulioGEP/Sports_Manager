import { z } from "zod";
import { LocalizedTextSchema } from "../locales.ts";
import {
  AI_FAILURES,
  AI_GENERATION_STATUSES,
  AI_INTENSITIES,
  AI_PROFILE_CODES,
  AiProposalResolvedSchema,
  AiWeeklyQuotaSchema,
} from "../training-ai.ts";
import { SESSION_BLOCKS, SESSION_STATUSES, TRAINING_CONTENT_KINDS } from "../training.ts";
import { SectionEquipmentSchema } from "./training.ts";

/** Contratos de la propuesta de sesión con IA (ADR 0043). */

const Ref = z.object({ id: z.string(), name: z.string() });

export const AiQuotaSchema = z.object({
  limit: z.number().int(),
  used: z.number().int(),
  remaining: z.number().int(),
  /** Lunes en que vuelve a empezar la cuenta. */
  resetsOn: z.string(),
});
export type AiQuota = z.infer<typeof AiQuotaSchema>;

/** Una propuesta en la lista del equipo, sin el detalle. */
export const AiGenerationSummarySchema = z.object({
  id: z.string(),
  status: z.enum(AI_GENERATION_STATUSES),
  failure: z.enum(AI_FAILURES).nullable(),
  createdAt: z.string(),
  appliedAt: z.string().nullable(),
  requestedBy: z.string().nullable(),
  dates: z.array(z.string()),
});
export type AiGenerationSummary = z.infer<typeof AiGenerationSummarySchema>;

/** Lo que necesita el formulario: el perfil de la sección, la cuota, el material y los entrenamientos. */
export const AiDraftConfigResponseSchema = z.object({
  /** Hay clave del modelo y el club tiene cuota. */
  available: z.boolean(),
  configured: z.boolean(),
  profile: z.object({
    code: z.enum(AI_PROFILE_CODES),
    name: LocalizedTextSchema,
    axes: z.array(z.object({ code: z.string(), label: LocalizedTextSchema })),
    defaultEmphasis: z.record(z.string(), z.number().int()),
    blocks: z.array(z.object({ block: z.enum(SESSION_BLOCKS), label: LocalizedTextSchema })),
  }),
  quota: AiQuotaSchema,
  equipment: z.array(SectionEquipmentSchema),
  /** Entrenamientos de la semana pedida, con su sesión si la tienen. */
  week: z.object({
    from: z.string(),
    events: z.array(
      z.object({
        id: z.string(),
        date: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        facility: Ref.nullable(),
        sessionId: z.string().nullable(),
        status: z.enum(SESSION_STATUSES).nullable(),
        itemsCount: z.number().int(),
      }),
    ),
  }),
  recent: z.array(AiGenerationSummarySchema),
  access: z.object({ request: z.boolean() }),
});
export type AiDraftConfigResponse = z.infer<typeof AiDraftConfigResponseSchema>;

/** Una propuesta con su petición, su estado y, si está lista, el borrador con ids del club. */
export const AiGenerationResponseSchema = z.object({
  generation: AiGenerationSummarySchema.extend({
    team: Ref,
    request: z.object({
      eventIds: z.array(z.string()),
      objective: z.string().nullable(),
      emphasis: z.record(z.string(), z.number().int()),
      intensity: z.enum(AI_INTENSITIES),
      context: z.string().nullable(),
      libraryOnly: z.boolean(),
      includeVariants: z.boolean(),
    }),
    profile: z.object({ code: z.enum(AI_PROFILE_CODES), name: LocalizedTextSchema }),
    blockLabels: z.array(z.object({ block: z.enum(SESSION_BLOCKS), label: LocalizedTextSchema })),
    proposal: AiProposalResolvedSchema.nullable(),
    finishedAt: z.string().nullable(),
    /** Las sesiones que ya tienen tareas en algún bloque de la propuesta: aplicar las sustituye. */
    planned: z.array(z.object({ eventId: z.string(), sessionId: z.string() })),
  }),
  /** Para pintar la propuesta: nombres de jugadores, contenidos y tareas por id. */
  lookups: z.object({
    players: z.array(Ref),
    contents: z.array(Ref.extend({ kind: z.enum(TRAINING_CONTENT_KINDS) })),
    drills: z.array(Ref),
  }),
  access: z.object({ apply: z.boolean() }),
});
export type AiGenerationResponse = z.infer<typeof AiGenerationResponseSchema>;

/** Aplicar: qué sesiones de la propuesta y si las tareas nuevas van a la biblioteca del equipo. */
export const AiApplySchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(7).optional(),
  saveNewDrills: z.boolean().optional(),
});
export type AiApply = z.infer<typeof AiApplySchema>;

export const AiApplyResponseSchema = z.object({
  sessions: z.array(z.object({ eventId: z.string(), sessionId: z.string() })),
  drillsCreated: z.number().int(),
});
export type AiApplyResponse = z.infer<typeof AiApplyResponseSchema>;

// --- Plataforma ---

export const PlatformAiResponseSchema = z.object({
  configured: z.boolean(),
  model: z.string(),
  weeklyQuota: z.number().int(),
  week: z.object({ from: z.string(), used: z.number().int() }),
  /** Últimos 30 días: llamadas, fallos, coste y aceptación. */
  last30: z.object({
    requests: z.number().int(),
    failed: z.number().int(),
    applied: z.number().int(),
    costUsd: z.number(),
    /** Tareas propuestas que siguen en la sesión al cerrarla, sobre las aplicadas. Nula sin datos. */
    keptShare: z.number().nullable(),
  }),
});
export type PlatformAiResponse = z.infer<typeof PlatformAiResponseSchema>;

export const PlatformAiUpdateSchema = z.object({ weeklyQuota: AiWeeklyQuotaSchema });
export type PlatformAiUpdate = z.infer<typeof PlatformAiUpdateSchema>;
