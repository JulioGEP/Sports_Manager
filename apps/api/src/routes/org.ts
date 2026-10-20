import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  AssignRoleBodySchema,
  AssignRoleResponseSchema,
  MembersResponseSchema,
  OrganizationResponseSchema,
  RoleCodeSchema,
  type Actor as ActorDto,
  type Locale,
  type OrganizationResponse,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import type { DataLayer } from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { Actor, AppEnv } from "../http/context.ts";
import { conflict, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";

const errorResponses = {
  401: { description: "Sin sesión", content: { "application/json": { schema: ApiErrorSchema } } },
  403: {
    description: "Sin pertenencia o sin permiso",
    content: { "application/json": { schema: ApiErrorSchema } },
  },
  404: {
    description: "Host sin club",
    content: { "application/json": { schema: ApiErrorSchema } },
  },
};

function actorDto(actor: Actor): ActorDto {
  return actor.kind === "member"
    ? { kind: "member", roles: actor.roles, permissions: [...actor.permissions] }
    : { kind: "platform_support", hasGrant: actor.hasGrant, permissions: [...actor.permissions] };
}

/** Rutas del club del host. Cadena completa: club → sesión → pertenencia → permiso. */
export function createOrgRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  app.use("/api/org", ...chain);
  app.use("/api/org/*", ...chain);

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org",
      tags: ["Club"],
      summary:
        "El club del host. Vista completa con `org.settings.read`; vista de soporte en caso contrario",
      security: [{ sessionCookie: [] }],
      responses: {
        200: {
          description: "Club y actor",
          content: { "application/json": { schema: OrganizationResponseSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const actor = c.get("actor");
      const org = tenant.organization;
      const status = org.status as "active" | "suspended" | "archived";
      const defaultLocale = org.defaultLocale as Locale;

      let organization: OrganizationResponse["organization"];
      if (actor.permissions.has("org.settings.read")) {
        const sport = await data.organizations.getSport(tenant.scope);
        organization = {
          view: "full",
          id: org.id,
          slug: org.slug,
          name: org.name,
          status,
          defaultLocale,
          sport,
          brandPrimaryColor: org.brandPrimaryColor,
          brandSecondaryColor: org.brandSecondaryColor,
          logoUrl: null,
          createdAt: org.createdAt.toISOString(),
        };
      } else {
        const counts = await data.organizations.supportCounts(tenant.scope);
        organization = {
          view: "support",
          slug: org.slug,
          name: org.name,
          status,
          defaultLocale,
          counts,
        };
      }
      return c.json({ organization, actor: actorDto(actor) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/members",
      tags: ["Club"],
      summary: "Miembros del club con sus roles",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.read")],
      responses: {
        200: {
          description: "Miembros",
          content: { "application/json": { schema: MembersResponseSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const members = await data.memberships.listMembers(tenant.scope);
      return c.json(
        { members: members.map((m) => ({ ...m, memberSince: m.memberSince.toISOString() })) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/members/{userId}/roles",
      tags: ["Club"],
      summary: "Añade un rol a un miembro. Solo `org_admin` del club",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.manage")],
      request: {
        params: z.object({ userId: z.string().uuid() }),
        body: { content: { "application/json": { schema: AssignRoleBodySchema } }, required: true },
      },
      responses: {
        200: {
          description: "Rol asignado o ya existente",
          content: { "application/json": { schema: AssignRoleResponseSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { userId } = c.req.valid("param");
      const { roleCode } = c.req.valid("json");
      const result = await data.memberships.assignRole(tenant.scope, userId, roleCode);
      if (result.outcome === "not_member")
        throw notFound("Esa persona no es miembro de este club.");
      return c.json({ userId, roleCode, roles: result.roles }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/members/{userId}/roles/{roleCode}",
      tags: ["Club"],
      summary: "Quita un rol a un miembro. Nunca deja el club sin `org_admin`",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.manage")],
      request: { params: z.object({ userId: z.string().uuid(), roleCode: RoleCodeSchema }) },
      responses: {
        200: {
          description: "Rol retirado",
          content: { "application/json": { schema: AssignRoleResponseSchema } },
        },
        409: {
          description: "Último administrador",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { userId, roleCode } = c.req.valid("param");
      const result = await data.memberships.removeRole(tenant.scope, userId, roleCode);
      if (result.outcome === "not_found")
        throw notFound("Esa persona no tiene ese rol en este club.");
      if (result.outcome === "last_admin")
        throw conflict("No se puede quitar al último administrador del club.");
      return c.json({ userId, roleCode, roles: result.roles }, 200);
    },
  );

  return app;
}
