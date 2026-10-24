import { z } from "zod";
import { ClubMottoSchema, ClubStyleSchema } from "./club-style.ts";
import { LocaleSchema } from "./locales.ts";
import { ClubVoiceSchema } from "./structure.ts";
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
  /** Voz del club (DESIGN.md 11): tiñe los textos de relación de la web. */
  voice: ClubVoiceSchema,
  /** Identidad visual (ADR 0043): tipografía, botones, iconos, fondo, portada, navegación y esquinas. */
  style: ClubStyleSchema,
  /** Lema del club, o nulo si no tiene. */
  motto: z.string().nullable(),
});
export type OrganizationBranding = z.infer<typeof OrganizationBrandingSchema>;

/** Cambios de marca y ajustes que puede hacer quien tiene `org.settings.write` (Bloque 5). */
export const OrganizationUpdateSchema = z.object({
  name: OrganizationNameSchema.optional(),
  defaultLocale: LocaleSchema.optional(),
  brandPrimaryColor: BrandColorSchema.optional(),
  brandSecondaryColor: BrandColorSchema.optional(),
  voice: ClubVoiceSchema.optional(),
  /** Identidad visual (ADR 0043): solo cambia lo que se manda. */
  style: ClubStyleSchema.partial().optional(),
  motto: ClubMottoSchema.optional(),
  /** Zona horaria IANA del club (Bloque 16), por ejemplo `Europe/Madrid`. */
  timezone: z
    .string()
    .trim()
    .regex(/^[A-Za-z_]+\/[A-Za-z_/+-]+$/, "Zona horaria inválida.")
    .optional(),
});
export type OrganizationUpdate = z.infer<typeof OrganizationUpdateSchema>;

/**
 * Logos de club (ADR 0024): PNG, JPEG o WebP hasta 1 MB. Sin SVG, que puede llevar código.
 * El límite es una decisión de producto del Bloque 5; cambiarlo es cambiar esta constante.
 */
export const LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];
export const LOGO_MAX_BYTES = 1_000_000;
