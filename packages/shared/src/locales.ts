import { z } from "zod";

/** Idiomas soportados por la plataforma: castellano, catalán e inglés. */
export const LOCALES = ["es", "ca", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";
export const LocaleSchema = z.enum(LOCALES);

/** Texto traducido a todos los idiomas, por ejemplo el nombre de un deporte o de un rol. */
export const LocalizedTextSchema = z.object({
  es: z.string().min(1),
  ca: z.string().min(1),
  en: z.string().min(1),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Resuelve el idioma a partir de una lista de candidatos por orden de prioridad
 * (usuario, organización, cabecera...). Devuelve el primero válido o el idioma por defecto.
 */
export function resolveLocale(candidates: ReadonlyArray<string | null | undefined>): Locale {
  for (const candidate of candidates) {
    if (isLocale(candidate)) return candidate;
  }
  return DEFAULT_LOCALE;
}
