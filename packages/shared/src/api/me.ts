import { z } from "zod";
import { LocaleSchema } from "../locales.ts";
import { ORGANIZATION_STATUSES } from "../organizations.ts";
import { RoleCodeSchema } from "../roles.ts";

/** Usuario de la sesión actual. Datos propios: no pasa por la cadena de club. */
export const SessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  locale: LocaleSchema.nullable(),
});

export const MeResponseSchema = z.object({
  user: SessionUserSchema,
  platformAdmin: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Club visto desde el selector de clubes: lo justo para enlazar y pintar la marca. */
export const MembershipOrganizationSchema = z.object({
  slug: z.string(),
  name: z.string(),
  status: z.enum(ORGANIZATION_STATUSES),
  defaultLocale: LocaleSchema,
  brandPrimaryColor: z.string(),
  brandSecondaryColor: z.string(),
  logoUrl: z.string().nullable(),
  /** Dirección del espacio del club, calculada por la API: `https://<slug>.<dominio base>`. */
  url: z.string(),
});

export const MyMembershipsResponseSchema = z.object({
  memberships: z.array(
    z.object({
      organization: MembershipOrganizationSchema,
      roles: z.array(RoleCodeSchema),
    }),
  ),
});
export type MyMembershipsResponse = z.infer<typeof MyMembershipsResponseSchema>;
