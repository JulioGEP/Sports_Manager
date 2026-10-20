import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  MeResponseSchema,
  MyMembershipsResponseSchema,
  type Locale,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import { logoUrlFor, type DataLayer } from "../data/index.ts";
import type { AppEnv } from "../http/context.ts";
import { requireSession } from "../http/session.ts";
import { organizationUrl } from "../tenancy.ts";

const errors = {
  401: { description: "Sin sesión", content: { "application/json": { schema: ApiErrorSchema } } },
};

/** Rutas de la propia persona. Necesitan sesión, no club: solo devuelven datos del usuario. */
export function createMeRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  app.use("/api/me", requireSession(data));
  app.use("/api/me/*", requireSession(data));

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/me",
      tags: ["Yo"],
      summary: "Usuario de la sesión",
      security: [{ sessionCookie: [] }],
      responses: {
        200: {
          description: "Usuario",
          content: { "application/json": { schema: MeResponseSchema } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const user = c.get("sessionUser");
      const platformAdmin = await data.platform.isPlatformAdmin(user.id);
      return c.json({ user, platformAdmin }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/me/memberships",
      tags: ["Yo"],
      summary: "Clubes de la sesión y roles en cada uno (selector de club)",
      security: [{ sessionCookie: [] }],
      responses: {
        200: {
          description: "Clubes",
          content: { "application/json": { schema: MyMembershipsResponseSchema } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const user = c.get("sessionUser");
      const memberships = await data.memberships.listForUser(user.id);
      const host = c.req.header("host");
      return c.json(
        {
          memberships: memberships.map((m) => {
            const url = organizationUrl(m.organization.slug, config, host);
            const logo = logoUrlFor(m.organization.logoBlobKey);
            return {
              organization: {
                slug: m.organization.slug,
                name: m.organization.name,
                status: m.organization.status as "active" | "suspended" | "archived",
                defaultLocale: m.organization.defaultLocale as Locale,
                brandPrimaryColor: m.organization.brandPrimaryColor,
                brandSecondaryColor: m.organization.brandSecondaryColor,
                logoUrl: logo ? `${url}${logo}` : null,
                url,
              },
              roles: m.roles,
            };
          }),
        },
        200,
      );
    },
  );

  return app;
}
