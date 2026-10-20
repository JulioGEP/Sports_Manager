import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorSchema } from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { DataLayer } from "../data/index.ts";
import { requirePlatformAdmin } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { requireSession } from "../http/session.ts";
import { requirePlatformHost, resolveTenant } from "../http/tenant.ts";

/** Rutas de la plataforma, solo en el host `admin`: sesión → administrador de plataforma. */
export function createPlatformRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  app.use(
    "/api/platform/*",
    resolveTenant(config, data),
    requirePlatformHost,
    requireSession(data),
    requirePlatformAdmin(data),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/platform/me",
      tags: ["Plataforma"],
      summary: "Comprueba que la sesión es de un administrador de plataforma",
      security: [{ sessionCookie: [] }],
      responses: {
        200: {
          description: "Administrador",
          content: { "application/json": { schema: z.object({ userId: z.string() }) } },
        },
        401: {
          description: "Sin sesión",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
        403: {
          description: "No es administrador de plataforma",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
        404: {
          description: "No es el host de la plataforma",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
      },
    }),
    (c) => c.json({ userId: c.get("sessionUser").id }, 200),
  );

  return app;
}
