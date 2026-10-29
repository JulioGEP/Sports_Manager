import type { MiddlewareHandler } from "hono";
import type { ApiConfig } from "../config.ts";
import type { DataLayer } from "../data/index.ts";
import { classifyRequest, CLUB_HEADER, CLUB_QUERY } from "../tenancy.ts";
import type { AppEnv } from "./context.ts";
import { forbidden, notFound } from "./errors.ts";
import { shared } from "./memo.ts";
import { sessionLookup } from "./session.ts";

export { classifyHost, type HostClass } from "../tenancy.ts";

export interface ResolveTenantOptions {
  /**
   * Buscar la sesión a la vez que el club (ADR 0060). Por defecto sí: casi todas las cadenas la
   * piden justo después. Solo la marca pública, que nunca la usa, lo apaga.
   */
  prefetchSession?: boolean;
}

/**
 * Resuelve el club de la petición y lo deja en el contexto. Señales: subdominio, cabecera
 * `x-sm-club` o query `club` (ADR 0027). Sin club ni plataforma: 404.
 */
export function resolveTenant(
  config: ApiConfig,
  data: DataLayer,
  options: ResolveTenantOptions = {},
): MiddlewareHandler<AppEnv> {
  const prefetchSession = options.prefetchSession ?? true;
  return async (c, next) => {
    // Varias cadenas pueden cubrir la misma ruta (`/api/org/*` y la del módulo): una vez basta.
    if (c.get("tenant")) return next();
    const klass = classifyRequest(
      { host: c.req.header("host"), club: c.req.header(CLUB_HEADER) ?? c.req.query(CLUB_QUERY) },
      config,
      c.env?.context?.deploy?.context,
    );
    if (klass.kind === "platform") {
      c.set("tenant", { kind: "platform" });
      return next();
    }
    if (klass.kind !== "organization") throw notFound("Este host no corresponde a ningún club.");
    // El club y la sesión no dependen uno de otro: las dos consultas salen a la vez.
    if (prefetchSession) void sessionLookup(data, c);
    const resolved = await shared(c, `organization:${klass.slug}`, () =>
      data.organizations.findBySlug(klass.slug),
    );
    if (!resolved) throw notFound("Este host no corresponde a ningún club.");
    if (resolved.organization.status !== "active") throw forbidden("Este club no está activo.");
    c.set("tenant", {
      kind: "organization",
      organization: resolved.organization,
      scope: resolved.scope,
    });
    await next();
  };
}

export const requireOrganizationHost: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("tenant")?.kind !== "organization")
    throw notFound("Este host no corresponde a ningún club.");
  await next();
};

export const requirePlatformHost: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("tenant")?.kind !== "platform") throw notFound();
  await next();
};
