/**
 * Voz del club e idiomas. Ver DESIGN.md, secciones 11 y 12.
 *
 * Cada club elige su voz: cercana, profesional o vestuario.
 * - Momentos de relación (convocatorias, asistencia, calendario, bienvenida): usan la voz del club.
 * - Momentos sensibles (dinero, errores, datos personales, protección del menor, bajas):
 *   con lockSensitive (por defecto) usan siempre la voz profesional.
 *   Si se desactiva, usan la voz del club, salvo vestuario, que pasa a cercana. Nunca hay bromas con el dinero.
 *
 * Idiomas: es (base), ca, en, eu, gl. Si falta un texto, se usa el castellano.
 * Para plurales y género gramatical en producción, usad una librería ICU (por ejemplo, FormatJS).
 */

export type Voice = "cercana" | "profesional" | "vestuario";
export type Locale = "es" | "ca" | "en" | "eu" | "gl";

export interface CopyFile {
  _meta?: { locale: Locale; status: string; fallback?: Locale };
  ui?: Record<string, string>;
  relational?: Record<string, Partial<Record<Voice, string>>>;
  sensitive?: Record<string, Partial<Record<"cercana" | "profesional", string>>>;
}

export interface ResolveOptions {
  voice: Voice;
  /** Por defecto true: los momentos sensibles usan siempre la voz profesional. */
  lockSensitive?: boolean;
  vars?: Record<string, string | number>;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function lookup(file: CopyFile | undefined, key: string, opts: ResolveOptions): string | undefined {
  if (!file) return undefined;
  if (file.ui?.[key]) return file.ui[key];
  const rel = file.relational?.[key];
  if (rel) return rel[opts.voice] ?? rel.cercana;
  const sen = file.sensitive?.[key];
  if (sen) {
    const locked = opts.lockSensitive !== false;
    const v = locked ? "profesional" : opts.voice === "vestuario" ? "cercana" : opts.voice;
    return sen[v] ?? sen.profesional;
  }
  return undefined;
}

export function createCopy(catalogs: Partial<Record<Locale, CopyFile>>, fallback: Locale = "es") {
  return function t(locale: Locale, key: string, opts: ResolveOptions): string {
    const text = lookup(catalogs[locale], key, opts) ?? lookup(catalogs[fallback], key, opts);
    if (text === undefined) {
      if (typeof console !== "undefined")
        console.warn(`[copy] Falta el texto "${key}" (${locale}).`);
      return key;
    }
    return interpolate(text, opts.vars);
  };
}

/**
 * Dinero igual en toda la app y en todos los idiomas: punto de miles, coma decimal y siempre dos
 * decimales (`1.234,56 €`). Intl no sirve: en castellano no agrupa los miles de cuatro cifras.
 */
const money = {
  format(euros: number): string {
    const cents = Math.round(euros * 100);
    const abs = Math.abs(cents);
    const units = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${cents < 0 ? "-" : ""}${units},${String(abs % 100).padStart(2, "0")} €`;
  },
};

/** Formatos: fechas y horas con Intl en el idioma de cada cual; el dinero, con el de la app. */
export const formatters = (locale: Locale) => ({
  date: new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }),
  time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
  money,
});
