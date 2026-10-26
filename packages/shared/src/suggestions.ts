import { z } from "zod";

/**
 * Mejoras de la plataforma (ADR 0046). La administración de un club sugiere mejoras a la
 * plataforma, sigue el estado de las suyas, vota las que la plataforma ha publicado y ve la hoja de
 * ruta: qué se está haciendo, qué viene, en qué orden y, aproximadamente, cuándo.
 *
 * Es lo único que cruza clubes, y por eso cruza poco: un club solo ve lo que ha enviado él y lo que
 * la plataforma ha publicado, nunca qué club pidió qué.
 */

/**
 * Ciclo de una sugerencia:
 * - `submitted`: recibida. Solo la ven el club que la envió y la plataforma.
 * - `open`: en estudio. Publicada para que los clubes la voten; sin fecha.
 * - `planned`: planificada, con su orden y, si se sabe, una fecha aproximada.
 * - `in_progress`: en desarrollo.
 * - `released`: disponible.
 * - `declined`: descartada, con el motivo para el club que la pidió.
 * - `merged`: unida a otra que pide lo mismo; sus votos pasan a esa.
 */
export const SUGGESTION_STATUSES = [
  "submitted",
  "open",
  "planned",
  "in_progress",
  "released",
  "declined",
  "merged",
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
export const SuggestionStatusSchema = z.enum(SUGGESTION_STATUSES);

/** Lo que forma la hoja de ruta: lo que ven todos los clubes. */
export const SUGGESTION_PUBLIC_STATUSES = [
  "open",
  "planned",
  "in_progress",
  "released",
] as const satisfies readonly SuggestionStatus[];
/** Lo que aún se puede votar: lo disponible ya no necesita votos. */
export const SUGGESTION_VOTABLE_STATUSES = [
  "open",
  "planned",
  "in_progress",
] as const satisfies readonly SuggestionStatus[];
/** Lo que lleva un orden explícito en la hoja de ruta: lo que viene. */
export const SUGGESTION_ORDERED_STATUSES = [
  "in_progress",
  "planned",
] as const satisfies readonly SuggestionStatus[];

export const isPublicSuggestion = (status: SuggestionStatus) =>
  (SUGGESTION_PUBLIC_STATUSES as readonly SuggestionStatus[]).includes(status);
export const isVotableSuggestion = (status: SuggestionStatus) =>
  (SUGGESTION_VOTABLE_STATUSES as readonly SuggestionStatus[]).includes(status);
export const isOrderedSuggestion = (status: SuggestionStatus) =>
  (SUGGESTION_ORDERED_STATUSES as readonly SuggestionStatus[]).includes(status);

/** Parte de la aplicación a la que toca una mejora: ordena la bandeja de la plataforma. */
export const SUGGESTION_AREAS = [
  "structure",
  "people",
  "agenda",
  "training",
  "matches",
  "fees",
  "store",
  "family",
  "communication",
  "settings",
  "other",
] as const;
export type SuggestionArea = (typeof SUGGESTION_AREAS)[number];
export const SuggestionAreaSchema = z.enum(SUGGESTION_AREAS);

export const SUGGESTION_TITLE_MAX = 120;
export const SUGGESTION_BODY_MAX = 4000;
export const SUGGESTION_RESPONSE_MAX = 2000;
/** Sugerencias que un club puede enviar en 24 horas: frena el ruido sin frenar a nadie de verdad. */
export const SUGGESTION_DAILY_LIMIT = 10;
/** Mejoras disponibles que enseña la hoja de ruta: las más recientes. */
export const ROADMAP_RELEASED_LIMIT = 20;

/**
 * Fecha aproximada: un mes (`2027-03`) o un trimestre (`2027-Q1`). Nunca un día: la hoja de ruta
 * promete un plazo, no una fecha de entrega.
 */
export const SUGGESTION_ETA_PATTERN = /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/;
export const SuggestionEtaSchema = z
  .string()
  .regex(SUGGESTION_ETA_PATTERN, "Usa un mes (AAAA-MM) o un trimestre (AAAA-Q1 a AAAA-Q4).");

export type SuggestionEta =
  | { kind: "month"; year: number; month: number }
  | { kind: "quarter"; year: number; quarter: number };

export function parseSuggestionEta(eta: string | null | undefined): SuggestionEta | null {
  if (!eta || !SUGGESTION_ETA_PATTERN.test(eta)) return null;
  const year = Number(eta.slice(0, 4));
  const rest = eta.slice(5);
  return rest.startsWith("Q")
    ? { kind: "quarter", year, quarter: Number(rest.slice(1)) }
    : { kind: "month", year, month: Number(rest) };
}

/**
 * Clave para ordenar fechas aproximadas: por el mes en que empiezan y, a igual inicio, el mes
 * (más preciso) antes que el trimestre. Sin fecha, al final.
 */
export function suggestionEtaSortKey(eta: string | null | undefined): string {
  const parsed = parseSuggestionEta(eta);
  if (!parsed) return "9999-99-9";
  const month = parsed.kind === "month" ? parsed.month : (parsed.quarter - 1) * 3 + 1;
  return `${parsed.year}-${String(month).padStart(2, "0")}-${parsed.kind === "month" ? 0 : 1}`;
}

/**
 * Fechas aproximadas que se pueden elegir desde `today` (AAAA-MM-DD): los próximos trimestres,
 * empezando por el actual, y los próximos meses, empezando por el actual.
 */
export function suggestionEtaOptions(
  today: string,
  counts: { quarters?: number; months?: number } = {},
): { quarters: string[]; months: string[] } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const quarters: string[] = [];
  let q = Math.ceil(month / 3);
  let qy = year;
  for (let i = 0; i < (counts.quarters ?? 8); i++) {
    quarters.push(`${qy}-Q${q}`);
    q += 1;
    if (q > 4) {
      q = 1;
      qy += 1;
    }
  }
  const months: string[] = [];
  let m = month;
  let my = year;
  for (let i = 0; i < (counts.months ?? 12); i++) {
    months.push(`${my}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      my += 1;
    }
  }
  return { quarters, months };
}

export interface RoadmapSortable {
  status: SuggestionStatus;
  position: number | null;
  eta: string | null;
  votes: number;
  /** ISO 8601: se comparan como texto. */
  publishedAt: string | null;
  releasedAt: string | null;
}

/**
 * Orden de la hoja de ruta: lo que está en desarrollo, lo planificado (las dos por el orden que
 * fija la plataforma; sin orden, por fecha aproximada), lo que está en estudio (lo más votado
 * primero) y lo último que ha salido. Lo que viene lleva su puesto: 1 es lo siguiente.
 * Lo que no es público no entra.
 */
export function orderRoadmap<T extends RoadmapSortable>(
  items: readonly T[],
  releasedLimit = ROADMAP_RELEASED_LIMIT,
): (T & { rank: number | null })[] {
  const of = (status: SuggestionStatus) => items.filter((i) => i.status === status);
  const byOrder = (a: T, b: T) =>
    (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
    suggestionEtaSortKey(a.eta).localeCompare(suggestionEtaSortKey(b.eta)) ||
    b.votes - a.votes ||
    (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "");
  const coming = [...of("in_progress").sort(byOrder), ...of("planned").sort(byOrder)];
  const open = of("open").sort(
    (a, b) => b.votes - a.votes || (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""),
  );
  const released = of("released")
    .sort((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""))
    .slice(0, releasedLimit);
  return [
    ...coming.map((item, i) => ({ ...item, rank: i + 1 })),
    ...[...open, ...released].map((item) => ({ ...item, rank: null })),
  ];
}

/** Palabras que no dicen nada de una mejora: no cuentan al buscar parecidas. */
const STOPWORDS = new Set([
  "para",
  "como",
  "poder",
  "pueda",
  "puedan",
  "quiero",
  "queremos",
  "seria",
  "estaria",
  "bien",
  "tener",
  "cada",
  "desde",
  "sobre",
  "entre",
  "todos",
  "todas",
  "nuestro",
  "nuestra",
  "club",
  "clubs",
  "clubes",
  "perque",
  "volem",
  "with",
  "that",
  "this",
  "from",
  "have",
  "would",
  "should",
  "could",
  "want",
  "able",
  "about",
]);

/** Palabras con significado de un texto: sin acentos ni mayúsculas, de cuatro letras o más. */
export function suggestionWords(text: string): string[] {
  const words = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/**
 * Dos palabras dicen lo mismo si son iguales, si una es la otra con una terminación corta
 * ("socio", "socios") o si comparten la raíz ("sincronizar", "sincronizada", "sincronización").
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.startsWith(short) && long.length - short.length <= 2) return true;
  let common = 0;
  while (common < short.length && short[common] === long[common]) common += 1;
  return common >= Math.max(6, short.length - 3);
}

/**
 * Mejoras publicadas que se parecen a lo que alguien va a sugerir, para que la vote en vez de
 * pedirla otra vez. Cuenta las palabras con significado que comparten; con más de dos palabras
 * en la búsqueda, exige dos. Primero las que más comparten y, a igualdad, las más votadas.
 */
export function similarSuggestions<T extends { title: string; body: string | null; votes: number }>(
  query: string,
  items: readonly T[],
  limit = 3,
): T[] {
  const words = suggestionWords(query);
  if (words.length === 0) return [];
  const needed = words.length > 2 ? 2 : 1;
  return items
    .map((item) => {
      const own = suggestionWords(`${item.title} ${item.body ?? ""}`);
      return { item, score: words.filter((w) => own.some((o) => sameWord(w, o))).length };
    })
    .filter((x) => x.score >= needed)
    .sort((a, b) => b.score - a.score || b.item.votes - a.item.votes)
    .slice(0, limit)
    .map((x) => x.item);
}
