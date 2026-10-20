import { z } from "zod";
import { EMAIL_STATUSES } from "../email.ts";
import { INVITATION_STATES } from "../invitations.ts";
import { LocaleSchema, LocalizedTextSchema } from "../locales.ts";
import { RoleCodeSchema } from "../roles.ts";
import { GuardianRelationshipSchema } from "../structure.ts";
import { PasswordSchema, UserNameSchema } from "../users.ts";

/** Invitación vista por quien administra el club. Nunca incluye el token. */
export const InvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  roleCode: RoleCodeSchema,
  locale: LocaleSchema,
  state: z.enum(INVITATION_STATES),
  expiresAt: z.string(),
  createdAt: z.string(),
  invitedByName: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  /** Invitación de familia hecha desde la ficha de un jugador (Bloque 11): a quién vincula. */
  player: z.object({ id: z.string(), name: z.string() }).nullable(),
  relationship: GuardianRelationshipSchema.nullable(),
});
export type Invitation = z.infer<typeof InvitationSchema>;

export const InvitationsResponseSchema = z.object({ invitations: z.array(InvitationSchema) });
export type InvitationsResponse = z.infer<typeof InvitationsResponseSchema>;

/**
 * Respuesta al crear o reenviar una invitación. `acceptUrl` solo viene con el transporte
 * `outbox` (sin Resend): permite probar el flujo copiando el enlace. Con Resend es nulo.
 */
export const InvitationSentResponseSchema = z.object({
  invitation: InvitationSchema,
  emailStatus: z.enum(EMAIL_STATUSES),
  acceptUrl: z.string().nullable(),
});
export type InvitationSentResponse = z.infer<typeof InvitationSentResponseSchema>;

/** Lo que ve quien abre el enlace, sin sesión: suficiente para decidir si acepta. */
export const PublicInvitationSchema = z.object({
  organization: z.object({
    slug: z.string(),
    name: z.string(),
    brandPrimaryColor: z.string(),
    brandSecondaryColor: z.string(),
  }),
  email: z.string(),
  roleCode: RoleCodeSchema,
  roleName: LocalizedTextSchema,
  locale: LocaleSchema,
  state: z.enum(INVITATION_STATES),
  expiresAt: z.string(),
  /** Si ya existe cuenta para ese email, se acepta con sesión; si no, creando la cuenta. */
  hasAccount: z.boolean(),
  /** Nombre del jugador al que vincula, si es una invitación de familia. */
  playerName: z.string().nullable(),
});
export type PublicInvitation = z.infer<typeof PublicInvitationSchema>;

/** Sin cuenta previa hacen falta nombre y contraseña. Con cuenta, el cuerpo va vacío. */
export const AcceptInvitationBodySchema = z.object({
  name: UserNameSchema.optional(),
  password: PasswordSchema.optional(),
});
export type AcceptInvitationBody = z.infer<typeof AcceptInvitationBodySchema>;

export const AcceptInvitationResponseSchema = z.object({
  organization: z.object({ slug: z.string(), name: z.string() }),
  roles: z.array(RoleCodeSchema),
  accountCreated: z.boolean(),
});
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponseSchema>;
