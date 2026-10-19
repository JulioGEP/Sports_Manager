import { z } from "zod";

/** Idiomas soportados por la plataforma. Castellano y catalán desde el día 1. */
export const LOCALES = ["es", "ca"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";
export const LocaleSchema = z.enum(LOCALES);

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
