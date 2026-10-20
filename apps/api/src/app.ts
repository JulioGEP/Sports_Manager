import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { ApiErrorSchema, HealthResponseSchema, type ApiError } from "@sportsmanager/shared";
import { createDataLayer, type DataLayer } from "./data/index.ts";

/** Contexto que Netlify pasa a la función. Solo usamos la región; en tests puede no existir. */
export interface NetlifyContext {
  server?: { region?: string };
}

/** Bindings de Hono: el handler de la función coloca el contexto de Netlify en `env.context`. */
export interface NetlifyEnv {
  context?: NetlifyContext;
}

export interface AppOptions {
  data?: DataLayer;
}

export const API_VERSION = "0.1.0";

function apiError(code: ApiError["error"]["code"], message: string, details?: unknown): ApiError {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function createApp(options: AppOptions = {}) {
  const data = options.data ?? createDataLayer();

  const app = new OpenAPIHono<{ Bindings: NetlifyEnv }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(apiError("bad_request", "Petición no válida.", result.error.issues), 400);
      }
      return undefined;
    },
  });

  app.onError((error, c) => {
    console.error("[api] unhandled error", error);
    return c.json(apiError("internal", "Error inesperado."), 500);
  });

  app.notFound((c) =>
    c.json(apiError("not_found", `No existe ${c.req.method} ${c.req.path}.`), 404),
  );

  const healthRoute = createRoute({
    method: "get",
    path: "/api/health",
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
  });

  app.openapi(healthRoute, async (c) => {
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
  });

  app.doc("/api/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Sports Manager API",
      version: API_VERSION,
      description: "API de la plataforma. Toda petición se resuelve por el subdominio del club.",
    },
  });

  app.get("/api/docs", Scalar({ url: "/api/openapi.json" }));

  return app;
}

export type App = ReturnType<typeof createApp>;
