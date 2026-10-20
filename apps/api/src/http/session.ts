import type { MiddlewareHandler } from "hono";
import { userLocale, type DataLayer } from "../data/index.ts";
import type { AppEnv } from "./context.ts";
import { unauthorized } from "./errors.ts";

/** Etapa 2 de la cadena: la cookie identifica al usuario. Sin sesión válida: 401. */
export function requireSession(data: DataLayer): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const result = await data.auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) throw unauthorized();
    c.set("sessionUser", {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      locale: userLocale(result.user.locale),
    });
    await next();
  };
}
