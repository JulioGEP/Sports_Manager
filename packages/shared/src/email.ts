/** Plantillas de email de la plataforma. Cada una tiene sus textos en `i18n` (es, ca, en). */
export const EMAIL_TEMPLATES = ["invitation", "password_reset"] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

/**
 * Transporte de envío (ADR 0018). `outbox` guarda el email en la base sin enviarlo: es el
 * modo hasta que haya dominio propio verificado en Resend. `resend` envía por su API.
 */
export const EMAIL_TRANSPORTS = ["outbox", "resend"] as const;
export type EmailTransport = (typeof EMAIL_TRANSPORTS)[number];

/** Estado de un email en `email_outbox`: en cola (sin enviar), enviado o fallido. */
export const EMAIL_STATUSES = ["queued", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Caducidad del enlace de restablecer contraseña, en minutos. Es el valor por defecto de Better Auth (1 hora). */
export const PASSWORD_RESET_TTL_MINUTES = 60;
