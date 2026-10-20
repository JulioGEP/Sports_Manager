import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { ApiErrorSchema, HealthResponseSchema } from "@sportsmanager/shared";
import type { DataLayer } from "../data/index.ts";
import type { AppEnv } from "../http/context.ts";

export function createHealthRoutes(data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/health",
      tags: ["Sistema"],
      summary: "Estado de la API y de la base de datos",
      responses: {
        200: {
          description: "La API responde. `db.ok` indica si la base de datos contesta.",
          content: { "application/json": { schema: HealthResponseSchema } },
        },
        500: {
          description: "Error inesperado",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
      },
    }),
    async (c) => {
      const db = await data.checkDatabase();
      return c.json(
        {
          status: "ok" as const,
          service: "api" as const,
          time: new Date().toISOString(),
          region: c.env?.context?.server?.region ?? null,
          db,
        },
        200,
      );
    },
  );

  return app;
}
