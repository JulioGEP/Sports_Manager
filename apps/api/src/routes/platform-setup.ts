import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  PlatformSetupBodySchema,
  PlatformSetupResponseSchema,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { DataLayer } from "../data/index.ts";
import type { AppEnv } from "../http/context.ts";
import { conflict, forbidden } from "../http/errors.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});

/**
 * Alta del primer administrador de plataforma (ADR 0026). Vive fuera de `/api/platform/*` porque
 * ese prefijo exige sesión de administrador, y aquí todavía no hay cuenta. Solo acepta los emails
 * fijados en PLATFORM_ADMIN_EMAILS (la lista la controla el negocio en Netlify) y solo mientras
 * la cuenta no exista; después responde 409 y la entrada es `/admin/login`.
 */
export function createPlatformSetupRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/platform-setup",
      tags: ["Plataforma"],
      summary: "Crea la cuenta de un administrador de plataforma que aún no la tiene",
      request: {
        body: { content: { "application/json": { schema: PlatformSetupBodySchema } } },
      },
      responses: {
        201: {
          description: "Cuenta creada y sesión iniciada",
          content: { "application/json": { schema: PlatformSetupResponseSchema } },
        },
        403: error("El email no es administrador de plataforma"),
        409: error("La cuenta ya existe"),
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const email = body.email.toLowerCase();
      if (!config.platformAdminEmails.includes(email)) {
        throw forbidden("Ese email no está autorizado como administrador de plataforma.");
      }
      if (await data.users.findByEmail(email)) {
        throw conflict("Esa cuenta ya existe. Entra con tu contraseña o recupérala.");
      }
      const user = await data.users.createWithPassword({
        email,
        name: body.name,
        password: body.password,
        locale: null,
      });
      await data.audit.record({
        actorUserId: user.id,
        organizationId: null,
        action: "platform.admin_created",
        target: email,
        details: null,
      });

      // Misma sesión y mismas cookies que un login normal, para entrar en /admin sin un segundo paso.
      const signIn = await data.auth.api.signInEmail({
        body: { email, password: body.password },
        headers: c.req.raw.headers,
        asResponse: true,
      });
      if (signIn.ok) {
        for (const cookie of signIn.headers.getSetCookie()) {
          c.header("set-cookie", cookie, { append: true });
        }
      } else {
        console.error("[platform-setup] la sesión tras el alta no se pudo iniciar", signIn.status);
      }
      return c.json({ created: true as const }, 201);
    },
  );

  return app;
}
