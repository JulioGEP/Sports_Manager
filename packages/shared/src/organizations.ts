import { z } from "zod";
import { LocaleSchema } from "./locales.ts";
import { OrganizationSlugSchema } from "./tenancy.ts";

export const ORGANIZATION_STATUSES = ["active", "suspended", "archived"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/** Color de marca en formato #rrggbb. Se normaliza a minúsculas; la base solo acepta minúsculas. */
export const BRAND_COLOR_PATTERN = /^#[0-9a-f]{6}$/;
export const BrandColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(BRAND_COLOR_PATTERN, "Color inválido: usa el formato #rrggbb.");

export const OrganizationNameSchema = z.string().trim().min(1).max(120);

/** Datos para crear una organización desde el panel interno (Bloque 6). */
export const OrganizationCreateSchema = z.object({
  name: OrganizationNameSchema,
  slug: OrganizationSlugSchema,
  defaultLocale: LocaleSchema,
  defaultSportCode: z.string().trim().min(1),
  brandPrimaryColor: BrandColorSchema,
  brandSecondaryColor: BrandColorSchema,
});
export type OrganizationCreate = z.infer<typeof OrganizationCreateSchema>;

/** Marca que la web necesita para pintar un club. Es lo único que se expone sin sesión. */
export const OrganizationBrandingSchema = z.object({
  slug: z.string(),
  name: z.string(),
  defaultLocale: LocaleSchema,
  brandPrimaryColor: z.string(),
  brandSecondaryColor: z.string(),
  logoUrl: z.string().nullable(),
});
export type OrganizationBranding = z.infer<typeof OrganizationBrandingSchema>;
