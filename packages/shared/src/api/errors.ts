import { z } from "zod";

export const API_ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "invitation_expired",
  "invitation_email_mismatch",
  "payload_too_large",
  "unsupported_media_type",
  /** Cuota semanal de propuestas con IA agotada (ADR 0043). */
  "quota_exceeded",
  /** La IA no está configurada o el club no la tiene. */
  "ai_unavailable",
  "internal",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
