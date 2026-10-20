import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { loadConfig, type ApiConfig } from "./config.ts";
import { createDataLayer, type DataLayer } from "./data/index.ts";
import type { AppEnv } from "./http/context.ts";
import { ApiError, badRequest, notFound } from "./http/errors.ts";
import { createBrandingRoutes } from "./routes/branding.ts";
import { createHealthRoutes } from "./routes/health.ts";
import { createInvitationRoutes } from "./routes/invitations.ts";
import { createMeRoutes } from "./routes/me.ts";
import { createOrgRoutes } from "./routes/org.ts";
import { createPlatformRoutes } from "./routes/platform.ts";
import { createPlatformSetupRoutes } from "./routes/platform-setup.ts";
import { createPlayerRoutes } from "./routes/players.ts";
import { createStructureRoutes } from "./routes/structure.ts";
import { DEPLOY_CONTEXT_HEADER } from "./tenancy.ts";

export type { NetlifyContext, NetlifyEnv } from "./http/context.ts";

export interface AppOptions {
  config?: ApiConfig;
  data?: DataLayer;
}

export const API_VERSION = "0.7.0";

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

  /**
   * Better Auth: login, logout, recuperación de contraseña y sesión. La API fija la cabecera
   * interna con el contexto de deploy (nunca se acepta del cliente) para que los enlaces de los
   * emails se construyan con el mismo criterio que la cadena de petición (ADR 0016).
   */
  app.on(["GET", "POST"], "/api/auth/*", (c) => {
    const headers = new Headers(c.req.raw.headers);
    const deployContext = c.env?.context?.deploy?.context;
    if (deployContext) headers.set(DEPLOY_CONTEXT_HEADER, deployContext);
    else headers.delete(DEPLOY_CONTEXT_HEADER);
    return data.auth.handler(new Request(c.req.raw, { headers }));
  });

  app.route("/", createHealthRoutes(data));
  app.route("/", createMeRoutes(config, data));
  // Rutas públicas del club (marca y logo) antes que las protegidas: terminan la cadena sin sesión.
  app.route("/", createBrandingRoutes(config, data));
  app.route("/", createOrgRoutes(config, data));
  app.route("/", createInvitationRoutes(config, data));
  app.route("/", createStructureRoutes(config, data));
  app.route("/", createPlayerRoutes(config, data));
  app.route("/", createPlatformRoutes(config, data));
  app.route("/", createPlatformSetupRoutes(config, data));

  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: "sm.session_token",
    description:
      "Cookie de sesión emitida por /api/auth (con prefijo __Secure- fuera de local). Cada club se resuelve por el subdominio de la petición.",
  });
  app.doc("/api/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Sports Manager API",
      version: API_VERSION,
      description:
        "API de la plataforma. Toda petición a /api/org/* se resuelve por el subdominio del club, la sesión identifica al usuario y la pertenencia fija los permisos. Login, logout y recuperación de contraseña viven en /api/auth/* (Better Auth): POST /api/auth/sign-in/email, POST /api/auth/sign-out, POST /api/auth/request-password-reset, POST /api/auth/reset-password.",
    },
  });
  app.get("/api/docs", Scalar({ url: "/api/openapi.json" }));

  return app;
}

export type App = ReturnType<typeof createApp>;
