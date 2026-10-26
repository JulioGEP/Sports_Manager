import { z } from "zod";
import { LocaleSchema } from "./locales.ts";
import { RoleCodeSchema, StaffPositionSchema } from "./roles.ts";
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
export const InvitationCreateSchema = z
  .object({
    email: EmailSchema,
    roleCode: RoleCodeSchema,
    locale: LocaleSchema.optional(),
    /** Cargo del personal (Bloque 13): solo con el rol `staff`. */
    position: StaffPositionSchema.nullable().optional(),
    /** Equipo al que se une como cuerpo técnico al aceptar: entrenadores y personal. */
    teamId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !v.position || v.roleCode === "staff", {
    message: "El cargo solo va con el rol de personal del club.",
    path: ["position"],
  })
  .refine((v) => !v.teamId || v.roleCode === "staff" || v.roleCode === "coach", {
    message: "Solo el cuerpo técnico se une a un equipo.",
    path: ["teamId"],
  })
  // El deportista entra a su ficha (ADR 0045): se invita desde ella, no desde "Personal".
  .refine((v) => v.roleCode !== "athlete", {
    message: "Al deportista se le da acceso desde su ficha.",
    path: ["roleCode"],
  });
export type InvitationCreate = z.infer<typeof InvitationCreateSchema>;
