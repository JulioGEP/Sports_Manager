import { z } from "zod";
import { LocaleSchema } from "./locales.ts";
import { RoleCodeSchema } from "./roles.ts";
import { EmailSchema } from "./users.ts";

export { EmailSchema };

/** Estados guardados en base. "Caducada" no se guarda: se deduce de `expires_at`. */
export const INVITATION_STATUSES = ["pending", "accepted", "revoked"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Estado tal como lo devuelve la API: los guardados más `expired`. */
export const INVITATION_STATES = [...INVITATION_STATUSES, "expired"] as const;
export type InvitationState = (typeof INVITATION_STATES)[number];

/** Caducidad por defecto de una invitación. Configurable por variable de entorno en la API. */
export const DEFAULT_INVITATION_TTL_DAYS = 7;

/** Datos para invitar a alguien a un club. El idioma es el del email; por defecto, el del club. */
export const InvitationCreateSchema = z.object({
  email: EmailSchema,
  roleCode: RoleCodeSchema,
  locale: LocaleSchema.optional(),
});
export type InvitationCreate = z.infer<typeof InvitationCreateSchema>;
