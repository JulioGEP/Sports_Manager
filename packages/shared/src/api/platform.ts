import { z } from "zod";
import { AUDIT_ACTIONS } from "../audit.ts";
import { LocaleSchema, LocalizedTextSchema } from "../locales.ts";
import {
  ClubModelSchema,
  ORGANIZATION_STATUSES,
  OrganizationUpdateSchema,
} from "../organizations.ts";
import { RoleCodeSchema } from "../roles.ts";
import { EmailSchema, PasswordSchema } from "../users.ts";
import { InvitationSchema } from "./invitations.ts";

/** Contratos del admin interno (Bloque 6, ADR 0022). Solo administradores de plataforma. */

export const SportSchema = z.object({ code: z.string(), name: LocalizedTextSchema });
export const SportsResponseSchema = z.object({ sports: z.array(SportSchema) });
export type SportsResponse = z.infer<typeof SportsResponseSchema>;

export const PlatformOrganizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(ORGANIZATION_STATUSES),
  defaultLocale: LocaleSchema,
  sport: SportSchema,
  /** Club deportivo o de fitness (ADR 0049). */
  clubModel: ClubModelSchema,
  brandPrimaryColor: z.string(),
  brandSecondaryColor: z.string(),
  /** Absoluta, en el host del club. */
  logoUrl: z.string().nullable(),
  /** Dirección del espacio del club, calculada por la API. */
  url: z.string(),
  createdAt: z.string(),
  counts: z.object({
    members: z.number().int().nonnegative(),
    pendingInvitations: z.number().int().nonnegative(),
  }),
});
export type PlatformOrganization = z.infer<typeof PlatformOrganizationSchema>;

export const PlatformOrganizationsResponseSchema = z.object({
  organizations: z.array(PlatformOrganizationSchema),
});
export type PlatformOrganizationsResponse = z.infer<typeof PlatformOrganizationsResponseSchema>;

export const PlatformOrganizationResponseSchema = z.object({
  organization: PlatformOrganizationSchema,
});
export type PlatformOrganizationResponse = z.infer<typeof PlatformOrganizationResponseSchema>;

/** Detalle para el admin: el club y las invitaciones que este administrador ha hecho en él. */
export const PlatformOrganizationDetailSchema = z.object({
  organization: PlatformOrganizationSchema,
  myInvitations: z.array(InvitationSchema),
});
export type PlatformOrganizationDetail = z.infer<typeof PlatformOrganizationDetailSchema>;

export const PlatformOrganizationUpdateSchema = OrganizationUpdateSchema.extend({
  status: z.enum(ORGANIZATION_STATUSES).optional(),
  /** Solo la plataforma cambia el modelo del club (ADR 0049). */
  clubModel: ClubModelSchema.optional(),
});
export type PlatformOrganizationUpdate = z.infer<typeof PlatformOrganizationUpdateSchema>;

/** Invitación desde el admin: por defecto, el primer administrador del club. */
export const PlatformInvitationCreateSchema = z.object({
  email: EmailSchema,
  roleCode: RoleCodeSchema.default("org_admin"),
  locale: LocaleSchema.optional(),
});
export type PlatformInvitationCreate = z.infer<typeof PlatformInvitationCreateSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  action: z.enum(AUDIT_ACTIONS),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  organizationSlug: z.string().nullable(),
  organizationName: z.string().nullable(),
  target: z.string().nullable(),
  details: z.unknown().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export const AuditResponseSchema = z.object({ entries: z.array(AuditEntrySchema) });
export type AuditResponse = z.infer<typeof AuditResponseSchema>;

/** Administradores de un club, para el negocio: son los contactos del club, no datos de menores ni familias. */
export const PlatformAdminSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  memberSince: z.string(),
});
export const PlatformAdminsResponseSchema = z.object({ admins: z.array(PlatformAdminSchema) });
export type PlatformAdminsResponse = z.infer<typeof PlatformAdminsResponseSchema>;

/**
 * Alta del primer administrador de plataforma (ADR 0026): solo para los emails fijados en
 * PLATFORM_ADMIN_EMAILS y solo si la cuenta no existe todavía. No pasa por ningún club.
 */
export const PlatformSetupBodySchema = z.object({
  email: EmailSchema,
  name: z.string().trim().min(1).max(120),
  password: PasswordSchema,
});
export type PlatformSetupBody = z.infer<typeof PlatformSetupBodySchema>;
export const PlatformSetupResponseSchema = z.object({ created: z.literal(true) });
