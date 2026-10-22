import { z } from "zod";
import { LocaleSchema, LocalizedTextSchema } from "../locales.ts";
import { ORGANIZATION_STATUSES } from "../organizations.ts";
import { PAYMENT_PROVIDERS } from "../fees.ts";
import { AccessAreaSchema, AccessScopeSummarySchema } from "../access.ts";
import { PERMISSIONS, ROLE_CODES, RoleCodeSchema, StaffPositionSchema } from "../roles.ts";
import { ClubVoiceSchema } from "../structure.ts";

/** Quién hace la petición dentro de un club, tal como lo resolvió la API. */
export const ActorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("member"),
    roles: z.array(RoleCodeSchema),
    /** Cargo del personal (Bloque 13), si tiene el rol `staff`. */
    position: StaffPositionSchema.nullable(),
    permissions: z.array(z.enum(PERMISSIONS)),
    /**
     * "Ver como" (Bloque 14): si la administración está mirando el club como otra persona, quién
     * es. Los roles, el cargo y los permisos de arriba son ya los de esa persona.
     */
    viewingAs: z
      .object({ userId: z.string(), name: z.string(), roles: z.array(RoleCodeSchema) })
      .nullable(),
    /** Quien de verdad tiene la sesión puede elegir a quién mirar. */
    canViewAs: z.boolean(),
    /** Qué parte del club ve (Bloque 19): todo, o sus secciones, equipos y deportistas. */
    scope: AccessScopeSummarySchema,
    /**
     * Su propia ficha de deportista, si su cuenta la tiene (ADR 0039): el adulto que entrena y
     * responde su bienestar y su RPE.
     */
    athletePlayerId: z.string().nullable().optional(),
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
  voice: ClubVoiceSchema,
  /** Zona horaria del club (Bloque 16): la agenda se pinta en ella. */
  timezone: z.string(),
  /** Cómo cobra el club (Bloque 18). */
  paymentsProvider: z.enum(PAYMENT_PROVIDERS),
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
    teams: z.number().int().nonnegative(),
    players: z.number().int().nonnegative(),
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
  /** Cargo del personal (Bloque 13), si tiene el rol `staff`. */
  position: StaffPositionSchema.nullable(),
  /** Equipos de la temporada actual en los que está como cuerpo técnico. */
  teams: z.array(z.object({ teamId: z.string(), teamName: z.string() })),
  /** Secciones a su cargo (Bloque 19): las que coordina o las que le asignó la administración. */
  sections: z.array(z.object({ sectionId: z.string(), sectionName: z.string() })),
  /** Excepciones de esta persona (ADR 0036): lo que ve de más y de menos respecto a su rol. */
  accessOverrides: z.object({
    allow: z.array(AccessAreaSchema),
    deny: z.array(AccessAreaSchema),
  }),
  memberSince: z.string(),
});
export const MembersResponseSchema = z.object({ members: z.array(MemberSchema) });
export type MembersResponse = z.infer<typeof MembersResponseSchema>;

export const AssignRoleBodySchema = z
  .object({
    roleCode: RoleCodeSchema,
    /** Con el rol `staff`: el cargo. Si ya tenía el rol, solo cambia el cargo. */
    position: StaffPositionSchema.nullable().optional(),
  })
  .refine((v) => !v.position || v.roleCode === "staff", {
    message: "El cargo solo va con el rol de personal del club.",
    path: ["position"],
  });
export const AssignRoleResponseSchema = z.object({
  userId: z.string(),
  roleCode: RoleCodeSchema,
  roles: z.array(RoleCodeSchema),
  position: StaffPositionSchema.nullable(),
});

/** Respuesta de `PATCH /api/org`: la vista completa del club ya actualizada. */
export const OrganizationUpdateResponseSchema = z.object({ organization: OrganizationFullSchema });
export type OrganizationUpdateResponse = z.infer<typeof OrganizationUpdateResponseSchema>;
