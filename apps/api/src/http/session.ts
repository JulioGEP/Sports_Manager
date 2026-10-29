import type { Context, MiddlewareHandler } from "hono";
import { userLocale, type DataLayer } from "../data/index.ts";
import type { AppEnv, SessionUser } from "./context.ts";
import { unauthorized } from "./errors.ts";
import { shared } from "./memo.ts";

async function sessionUserOf(data: DataLayer, headers: Headers): Promise<SessionUser | null> {
  const result = await data.auth.api.getSession({ headers });
  if (!result) return null;
  return {
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
    locale: userLocale(result.user.locale),
  };
}

/**
 * La sesión de la petición, buscada una sola vez (ADR 0060): la primera llamada la pone en marcha
 * y las demás esperan la misma. Sin cookie no hay sesión que buscar. Dentro de un lote se comparte
 * entre todas sus peticiones, que llevan la misma cookie.
 */
export function sessionLookup(data: DataLayer, c: Context<AppEnv>): Promise<SessionUser | null> {
  const started = c.get("sessionLookup");
  if (started !== undefined) return started;
  const cookie = c.req.header("cookie");
  const lookup = cookie
    ? shared(c, "session", () => sessionUserOf(data, c.req.raw.headers))
    : Promise.resolve(null);
  // Se arranca antes de que nadie la espere: un fallo no puede quedar como rechazo suelto.
  lookup.catch(() => undefined);
  c.set("sessionLookup", lookup);
  return lookup;
}

/** Etapa 2 de la cadena: la cookie identifica al usuario. Sin sesión válida: 401. */
export function requireSession(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Varias cadenas pueden cubrir la misma ruta: la sesión se resuelve una vez.
    if (!c.get("sessionUser")) {
      const user = await sessionLookup(data, c);
      if (!user) throw unauthorized();
      c.set("sessionUser", user);
    }
    await next();
  };
}

/** Variante para rutas que funcionan con y sin sesión: deja la sesión, o null, en el contexto. */
export function optionalSession(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.get("optionalSessionUser") === undefined) {
      c.set("optionalSessionUser", await sessionLookup(data, c));
    }
    await next();
  };
}
