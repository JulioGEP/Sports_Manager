import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { loadConfig, type ApiConfig } from "./config.ts";
import { createDataLayer, type DataLayer } from "./data/index.ts";
import type { AppEnv } from "./http/context.ts";
import { ApiError, badRequest, notFound } from "./http/errors.ts";
import { createHealthRoutes } from "./routes/health.ts";
import { createMeRoutes } from "./routes/me.ts";
import { createOrgRoutes } from "./routes/org.ts";
import { createPlatformRoutes } from "./routes/platform.ts";

export type { NetlifyContext, NetlifyEnv } from "./http/context.ts";

export interface AppOptions {
  config?: ApiConfig;
  data?: DataLayer;
}

export const API_VERSION = "0.2.0";

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? loadConfig();
  const data = options.data ?? createDataLayer({ config });

  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(badRequest("Petición no válida.", result.error.issues).toBody(), 400);
      }
      return undefined;
    },
  });

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json(error.toBody(), error.status);
    console.error("[api] unhandled error", error);
    return c.json(new ApiError(500, "internal", "Error inesperado.").toBody(), 500);
  });
  app.notFound((c) => c.json(notFound(`No existe ${c.req.method} ${c.req.path}.`).toBody(), 404));

  // Better Auth: login, logout, recuperación de contraseña (Bloque 4) y sesión.
  app.on(["GET", "POST"], "/api/auth/*", (c) => data.auth.handler(c.req.raw));

  app.route("/", createHealthRoutes(data));
  app.route("/", createMeRoutes(data));
  app.route("/", createOrgRoutes(config, data));
  app.route("/", createPlatformRoutes(config, data));

  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: "sm.session_token",
    description:
      "Cookie de sesión emitida por /api/auth. Cada club se resuelve por el subdominio de la petición.",
  });
  app.doc("/api/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Sports Manager API",
      version: API_VERSION,
      description:
        "API de la plataforma. Toda petición a /api/org/* se resuelve por el subdominio del club, la sesión identifica al usuario y la pertenencia fija los permisos.",
    },
  });
  app.get("/api/docs", Scalar({ url: "/api/openapi.json" }));

  return app;
}

export type App = ReturnType<typeof createApp>;
