import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { loadConfig, type ApiConfig } from "./config.ts";
import { createDataLayer, type DataLayer } from "./data/index.ts";
import type { AppEnv } from "./http/context.ts";
import { ApiError, badRequest, notFound } from "./http/errors.ts";
import { createAccountingRoutes } from "./routes/accounting.ts";
import { createBrandingRoutes } from "./routes/branding.ts";
import { createChallengeRoutes } from "./routes/challenges.ts";
import { createEventRoutes } from "./routes/events.ts";
import { createFeeRoutes } from "./routes/fees.ts";
import { createHealthRoutes } from "./routes/health.ts";
import { createInvitationRoutes } from "./routes/invitations.ts";
import { createLoadRoutes } from "./routes/load.ts";
import { createMatchRoutes } from "./routes/matches.ts";
import { createMeRoutes } from "./routes/me.ts";
import { createOrgRoutes } from "./routes/org.ts";
import { createPeopleRoutes } from "./routes/people.ts";
import { createPlatformRoutes } from "./routes/platform.ts";
import { createPlatformSetupRoutes } from "./routes/platform-setup.ts";
import { createPlayerRoutes } from "./routes/players.ts";
import { createStructureRoutes } from "./routes/structure.ts";
import { createTrainingRoutes } from "./routes/training.ts";
import { createTrainingAiRoutes } from "./routes/training-ai.ts";
import { createPlayerHealthRoutes } from "./routes/player-health.ts";
import { createPublicStoreRoutes } from "./routes/public-store.ts";
import { createStoreRoutes } from "./routes/store.ts";
import { createSuggestionRoutes } from "./routes/suggestions.ts";
import { createFitnessAiRoutes } from "./routes/fitness-ai.ts";
import { createFitnessExerciseRoutes } from "./routes/fitness-exercises.ts";
import { createFitnessClassRoutes } from "./routes/fitness-classes.ts";
import { createFitnessCommunityRoutes } from "./routes/fitness-community.ts";
import { createFitnessInsightRoutes } from "./routes/fitness-insights.ts";
import { createFitnessPlanRoutes } from "./routes/fitness-plans.ts";
import { createFitnessWorkoutRoutes } from "./routes/fitness-workouts.ts";
import { createPublicClassRoutes } from "./routes/public-classes.ts";
import { createAccountingService } from "./services/accounting/index.ts";
import { DEPLOY_CONTEXT_HEADER } from "./tenancy.ts";

export type { NetlifyContext, NetlifyEnv } from "./http/context.ts";

export interface AppOptions {
  config?: ApiConfig;
  data?: DataLayer;
}

export const API_VERSION = "0.16.0";

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? loadConfig();
  const data = options.data ?? createDataLayer({ config });
  // Contabilidad (ADR 0042): un servicio para las cuotas, la tienda, el webhook y sus propias rutas.
  const accounting = createAccountingService(config, data);

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
  app.route("/", createPeopleRoutes(config, data));
  app.route("/", createEventRoutes(config, data));
  app.route("/", createFeeRoutes(config, data, { accounting }));
  app.route("/", createAccountingRoutes(config, data, { service: accounting }));
  app.route("/", createStoreRoutes(config, data, { accounting }));
  // API pública del catálogo (ADR 0041): sin sesión, la clave publicable dice el club.
  app.route("/", createPublicStoreRoutes(config, data));
  app.route("/", createChallengeRoutes(config, data));
  app.route("/", createMatchRoutes(config, data));
  app.route("/", createTrainingRoutes(config, data));
  app.route("/", createTrainingAiRoutes(config, data));
  app.route("/", createLoadRoutes(config, data));
  app.route("/", createPlayerHealthRoutes(config, data));
  // Clubs de fitness (ADR 0049): clases y reservas, tarifas, el WOD, comunidad y cifras del box.
  app.route("/", createFitnessClassRoutes(config, data));
  app.route("/", createFitnessPlanRoutes(config, data, { accounting }));
  app.route("/", createFitnessWorkoutRoutes(config, data));
  app.route("/", createFitnessCommunityRoutes(config, data));
  app.route("/", createFitnessInsightRoutes(config, data));
  app.route("/", createFitnessAiRoutes(config, data));
  app.route("/", createFitnessExerciseRoutes(config, data));
  // La web del box: su horario y la clase de prueba, con la clave publicable del club.
  app.route("/", createPublicClassRoutes(config, data));
  // Mejoras de la plataforma (ADR 0047): lo que la administración del club sugiere y vota.
  app.route("/", createSuggestionRoutes(config, data));
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
        "API de la plataforma. Toda petición a /api/org/* se resuelve por el subdominio del club, la sesión identifica al usuario y la pertenencia fija los permisos. Login, logout y recuperación de contraseña viven en /api/auth/* (Better Auth): POST /api/auth/sign-in/email, POST /api/auth/sign-out, POST /api/auth/request-password-reset, POST /api/auth/reset-password. El catálogo público de la tienda de cada club vive en /api/public/v1 y se lee con la clave publicable del club (cabecera x-sm-key o query key), sin sesión.",
    },
  });
  app.get("/api/docs", Scalar({ url: "/api/openapi.json" }));

  return app;
}

export type App = ReturnType<typeof createApp>;
