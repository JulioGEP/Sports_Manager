import { z } from "zod";
import { LocalizedTextSchema } from "./locales.ts";

/**
 * El deporte es configuración en datos, no código (ADR 0028). Cada deporte del catálogo lleva
 * en `sports.config` las posiciones habituales y las categorías que el club puede crear de un
 * toque al abrir una sección (Bloque 14). Las edades son orientativas: cada federación las
 * llama y las corta a su manera, y el club las ajusta después.
 */
export const SportSuggestedCategorySchema = z.object({
  name: LocalizedTextSchema,
  /** Edad orientativa al empezar la temporada; sin ella, categoría abierta (sénior, adultos). */
  ageFrom: z.number().int().min(0).max(120).optional(),
  ageTo: z.number().int().min(0).max(120).optional(),
});
export type SportSuggestedCategory = z.infer<typeof SportSuggestedCategorySchema>;

export const SportConfigSchema = z.object({
  positions: z.array(LocalizedTextSchema).default([]),
  categories: z.array(SportSuggestedCategorySchema).default([]),
});
export type SportConfig = z.infer<typeof SportConfigSchema>;

/** Una sección de competición tiene equipos y plantillas; una de actividad, grupos e inscritos. */
export const SECTION_KINDS = ["competition", "activity"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
export const SectionKindSchema = z.enum(SECTION_KINDS);

/** Un deporte del catálogo con su configuración, para el club (`/api/org/sports`). */
export const SportCatalogEntrySchema = z.object({
  code: z.string(),
  name: LocalizedTextSchema,
  /** Tipo de sección que propone al crearla con este deporte. */
  defaultKind: SectionKindSchema,
  config: SportConfigSchema,
});
export type SportCatalogEntry = z.infer<typeof SportCatalogEntrySchema>;
export const SportCatalogResponseSchema = z.object({ sports: z.array(SportCatalogEntrySchema) });
export type SportCatalogResponse = z.infer<typeof SportCatalogResponseSchema>;

/** Deportes de actividad: sin competición, con grupos e inscritos. El resto compiten. */
export const ACTIVITY_SPORT_CODES = ["yoga", "crossfit", "fitness", "pilates"] as const;
export function defaultSectionKind(sportCode: string): SectionKind {
  return (ACTIVITY_SPORT_CODES as readonly string[]).includes(sportCode)
    ? "activity"
    : "competition";
}
