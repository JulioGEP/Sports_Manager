import { z } from "zod";
import { RoleCodeSchema } from "./roles.ts";

export const INVITATION_STATUSES = ["pending", "accepted", "revoked"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Caducidad por defecto de una invitación. Configurable por variable de entorno en la API. */
export const DEFAULT_INVITATION_TTL_DAYS = 7;

/** Emails siempre en minúsculas y sin espacios; la base lo exige con una restricción. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const InvitationCreateSchema = z.object({
  email: EmailSchema,
  roleCode: RoleCodeSchema,
});
export type InvitationCreate = z.infer<typeof InvitationCreateSchema>;
