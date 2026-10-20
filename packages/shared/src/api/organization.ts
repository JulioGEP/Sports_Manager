import { z } from "zod";
import { LocaleSchema, LocalizedTextSchema } from "../locales.ts";
import { ORGANIZATION_STATUSES } from "../organizations.ts";
import { PERMISSIONS, ROLE_CODES, RoleCodeSchema } from "../roles.ts";

/** Quién hace la petición dentro de un club, tal como lo resolvió la API. */
export const ActorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("member"),
    roles: z.array(RoleCodeSchema),
    permissions: z.array(z.enum(PERMISSIONS)),
  }),
  z.object({
    kind: z.literal("platform_support"),
    hasGrant: z.boolean(),
    permissions: z.array(z.enum(PERMISSIONS)),
  }),
]);
export type Actor = z.infer<typeof ActorSchema>;

/** Vista completa del club, para quien tiene `org.settings.read`. */
export const OrganizationFullSchema = z.object({
  view: z.literal("full"),
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(ORGANIZATION_STATUSES),
  defaultLocale: LocaleSchema,
  sport: z.object({ code: z.string(), name: LocalizedTextSchema }),
  brandPrimaryColor: z.string(),
  brandSecondaryColor: z.string(),
  logoUrl: z.string().nullable(),
  createdAt: z.string(),
});

/** Vista de soporte (ADR 0017): estado y agregados, ningún dato personal ni detalle de configuración. */
export const OrganizationSupportViewSchema = z.object({
  view: z.literal("support"),
  slug: z.string(),
  name: z.string(),
  status: z.enum(ORGANIZATION_STATUSES),
  defaultLocale: LocaleSchema,
  counts: z.object({
    membersByRole: z.record(z.enum(ROLE_CODES), z.number().int().nonnegative()),
    pendingInvitations: z.number().int().nonnegative(),
  }),
});

export const OrganizationResponseSchema = z.object({
  organization: z.discriminatedUnion("view", [
    OrganizationFullSchema,
    OrganizationSupportViewSchema,
  ]),
  actor: ActorSchema,
});
export type OrganizationResponse = z.infer<typeof OrganizationResponseSchema>;

export const MemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  roles: z.array(RoleCodeSchema),
  memberSince: z.string(),
});
export const MembersResponseSchema = z.object({ members: z.array(MemberSchema) });
export type MembersResponse = z.infer<typeof MembersResponseSchema>;

export const AssignRoleBodySchema = z.object({ roleCode: RoleCodeSchema });
export const AssignRoleResponseSchema = z.object({
  userId: z.string(),
  roleCode: RoleCodeSchema,
  roles: z.array(RoleCodeSchema),
});

/** Respuesta de `PATCH /api/org`: la vista completa del club ya actualizada. */
export const OrganizationUpdateResponseSchema = z.object({ organization: OrganizationFullSchema });
export type OrganizationUpdateResponse = z.infer<typeof OrganizationUpdateResponseSchema>;
