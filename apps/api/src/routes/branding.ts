import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { ApiErrorSchema, OrganizationBrandingSchema } from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import { logoVersion, type DataLayer } from "../data/index.ts";
import type { AppEnv } from "../http/context.ts";
import { notFound } from "../http/errors.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";
import { brandingDto } from "./org.ts";

/**
 * Lo único del club que se sirve sin sesión (Bloque 5): su marca y su logo. La web lo pide con
 * el Host de cada petición para pintar el club antes del login. La API sigue decidiendo qué
 * club es; la web nunca interpreta el host.
 */
export function createBrandingRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const publicChain = [
    resolveTenant(config, data, { prefetchSession: false }),
    requireOrganizationHost,
  ] as const;

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/branding",
      tags: ["Club"],
      summary: "Marca pública del club del host: nombre, colores, logo e idioma. Sin sesión",
      middleware: [...publicChain],
      responses: {
        200: {
          description: "Marca",
          content: { "application/json": { schema: OrganizationBrandingSchema } },
        },
        404: {
          description: "Host sin club",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
      },
    }),
    (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      return c.json(brandingDto(tenant.organization), 200);
    },
  );

  /** Logo del club del host. Cuerpo binario; fuera de la documentación OpenAPI por no ser JSON. */
  app.get("/api/org/logo", ...publicChain, async (c) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    const logo = await data.logos.read(tenant.scope);
    if (!logo) throw notFound("Este club no tiene logo.");
    const etag = `"${logoVersion(logo.key)}"`;
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.body(logo.body, 200, {
      "content-type": logo.contentType,
      "cache-control": "public, max-age=86400",
      etag,
    });
  });

  return app;
}
