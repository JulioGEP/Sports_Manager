import type { MiddlewareHandler } from "hono";
import { userLocale, type DataLayer } from "../data/index.ts";
import type { AppEnv, SessionUser } from "./context.ts";
import { unauthorized } from "./errors.ts";

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

/** Etapa 2 de la cadena: la cookie identifica al usuario. Sin sesión válida: 401. */
export function requireSession(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await sessionUserOf(data, c.req.raw.headers);
    if (!user) throw unauthorized();
    c.set("sessionUser", user);
    await next();
  };
}

/** Variante para rutas que funcionan con y sin sesión: deja la sesión, o null, en el contexto. */
export function optionalSession(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.req.header("cookie") ? await sessionUserOf(data, c.req.raw.headers) : null;
    c.set("optionalSessionUser", user);
    await next();
  };
}
