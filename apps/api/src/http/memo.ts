import type { Context } from "hono";
import type { AppEnv } from "./context.ts";

/**
 * Memo compartido entre las peticiones de un mismo lote (`POST /api/batch`, ADR 0060). Las GET de
 * un lote llevan la misma cookie, así que el club, la sesión, el actor y su ámbito se resuelven una
 * sola vez para todas. Fuera de un lote no hay memo y cada cálculo se hace tal cual.
 *
 * La clave tiene que llevar todo lo que cambia el resultado (el club, la persona, "ver como"):
 * dentro de un lote cada petición puede apuntar a otro club o mirar con otros ojos.
 */
export type BatchMemo = Map<string, Promise<unknown>>;

export function shared<T>(c: Context<AppEnv>, key: string, compute: () => Promise<T>): Promise<T> {
  const store = c.env?.memo;
  if (!store) return compute();
  let pending = store.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = compute();
    store.set(key, pending);
    // Si ninguna petición llega a esperarlo (otra falló antes), que no quede un rechazo suelto.
    pending.catch(() => undefined);
  }
  return pending;
}
