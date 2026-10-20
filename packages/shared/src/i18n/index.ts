import type { Locale } from "../locales.ts";
import ca from "./ca.ts";
import es from "./es.ts";

/** Diccionarios de la API y de los emails. La interfaz web tiene los suyos en apps/web/messages. */
export const messages = { es, ca } as const satisfies Record<Locale, unknown>;

type Messages = typeof es;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Clave de mensaje con notación de puntos, por ejemplo `errors.not_found`. */
export type MessageKey = Leaves<Messages>;

function lookup(tree: unknown, path: string): string | undefined {
  let current: unknown = tree;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Traduce una clave. Sustituye `{nombre}` por el valor de `params.nombre`.
 * Si la clave no existe en el idioma pedido, cae al castellano; si tampoco, devuelve la clave.
 */
export function t(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const text = lookup(messages[locale], key) ?? lookup(messages.es, key) ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
