import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ActivityResponseSchema,
  ApiErrorSchema,
  AssignRoleBodySchema,
  AssignRoleResponseSchema,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  MembersResponseSchema,
  OrganizationBrandingSchema,
  OrganizationResponseSchema,
  OrganizationUpdateResponseSchema,
  OrganizationUpdateSchema,
  RoleCodeSchema,
  type Actor as ActorDto,
  type ClubVoice,
  type Locale,
  type OrganizationResponse,
  type PaymentProvider,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  isLogoContentType,
  logoUrlFor,
  sniffImageType,
  type DataLayer,
  type OrganizationRow,
  type OrgScope,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { Actor, AppEnv } from "../http/context.ts";
import {
  badRequest,
  conflict,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from "../http/errors.ts";
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

export function brandingDto(org: OrganizationRow) {
  return {
    slug: org.slug,
    name: org.name,
    defaultLocale: org.defaultLocale as Locale,
    brandPrimaryColor: org.brandPrimaryColor,
    brandSecondaryColor: org.brandSecondaryColor,
    logoUrl: logoUrlFor(org.logoBlobKey, org.slug),
    voice: org.voice as ClubVoice,
  };
}

function actorDto(actor: Actor): ActorDto {
  return actor.kind === "member"
    ? {
        kind: "member",
        roles: actor.roles,
        position: actor.position,
        permissions: [...actor.permissions],
        viewingAs: actor.viewingAs,
        canViewAs: actor.canViewAs,
      }
    : { kind: "platform_support", hasGrant: actor.hasGrant, permissions: [...actor.permissions] };
}

/** Rutas del club del host. Cadena completa: club → sesión → pertenencia → permiso. */
export function createOrgRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();

  async function fullView(org: OrganizationRow, scope: OrgScope) {
    const sport = await data.organizations.getSport(scope);
    return {
      view: "full" as const,
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status as "active" | "suspended" | "archived",
      defaultLocale: org.defaultLocale as Locale,
      sport,
      brandPrimaryColor: org.brandPrimaryColor,
      brandSecondaryColor: org.brandSecondaryColor,
      logoUrl: logoUrlFor(org.logoBlobKey, org.slug),
      voice: org.voice as ClubVoice,
      timezone: org.timezone,
      paymentsProvider: org.paymentsProvider as PaymentProvider,
      createdAt: org.createdAt.toISOString(),
    };
  }
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

      if (actor.kind === "member" && actor.viewingAs) {
        await data.audit.record({
          actorUserId: c.get("sessionUser").id,
          organizationId: org.id,
          action: "view_as.started",
          target: actor.viewingAs.userId,
          details: { name: actor.viewingAs.name, roles: actor.viewingAs.roles },
        });
      }
      let organization: OrganizationResponse["organization"];
      if (actor.permissions.has("org.settings.read")) {
        organization = await fullView(org, tenant.scope);
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
      summary:
        "Añade un rol a un miembro. Con el rol `staff`, fija o cambia su cargo. Solo `org_admin` del club",
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
      const { roleCode, position } = c.req.valid("json");
      const result = await data.memberships.assignRole(
        tenant.scope,
        userId,
        roleCode,
        position ?? null,
      );
      if (result.outcome === "not_member")
        throw notFound("Esa persona no es miembro de este club.");
      if (result.outcome === "assigned" || (roleCode === "staff" && position)) {
        await data.audit.record({
          actorUserId: c.get("sessionUser").id,
          organizationId: tenant.organization.id,
          action: "membership.role_assigned",
          target: userId,
          details: { roleCode, position: position ?? null },
        });
      }
      return c.json({ userId, roleCode, roles: result.roles, position: result.position }, 200);
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
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "membership.role_removed",
        target: userId,
        details: { roleCode },
      });
      const position = result.roles.includes("staff")
        ? ((await data.memberships.membershipsFor(tenant.scope, userId)).find(
            (m) => m.roleCode === "staff",
          )?.position ?? null)
        : null;
      return c.json({ userId, roleCode, roles: result.roles, position }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/activity",
      tags: ["Club"],
      summary: "Últimos movimientos del club (Bloque 13). Permiso `org.activity.read`",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.activity.read")],
      request: { query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }) },
      responses: {
        200: {
          description: "Movimientos",
          content: { "application/json": { schema: ActivityResponseSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { limit } = c.req.valid("query");
      const entries = await data.audit.listForOrganization(tenant.scope, limit ?? 20);
      return c.json(
        { entries: entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org",
      tags: ["Club"],
      summary: "Cambia nombre, idioma o colores de marca del club. Permiso `org.settings.write`",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.write")],
      request: {
        body: {
          content: { "application/json": { schema: OrganizationUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Club actualizado",
          content: { "application/json": { schema: OrganizationUpdateResponseSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const patch = c.req.valid("json");
      if (Object.keys(patch).length === 0) throw badRequest("No hay nada que cambiar.");
      const updated = await data.organizations.update(tenant.scope, patch);
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: updated.id,
        action: "organization.updated",
        target: updated.slug,
        details: { fields: Object.keys(patch) },
      });
      return c.json({ organization: await fullView(updated, tenant.scope) }, 200);
    },
  );

  const logoBody = Object.fromEntries(
    LOGO_CONTENT_TYPES.map((type) => [type, { schema: z.string().openapi({ format: "binary" }) }]),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/logo",
      tags: ["Club"],
      summary: `Sube el logo del club (cuerpo binario, ${LOGO_CONTENT_TYPES.join(", ")}, máximo ${LOGO_MAX_BYTES} bytes). Permiso \`org.settings.write\``,
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.write")],
      request: { body: { content: logoBody, required: true } },
      responses: {
        200: {
          description: "Marca con el logo nuevo",
          content: { "application/json": { schema: OrganizationBrandingSchema } },
        },
        413: {
          description: "Demasiado grande",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
        415: {
          description: "Formato no admitido",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const declared =
        (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!isLogoContentType(declared)) throw unsupportedMediaType();
      const length = Number(c.req.header("content-length") ?? "0");
      if (length > LOGO_MAX_BYTES) throw payloadTooLarge();
      const body = await c.req.arrayBuffer();
      if (body.byteLength === 0) throw badRequest("El fichero está vacío.");
      if (body.byteLength > LOGO_MAX_BYTES) throw payloadTooLarge();
      const actual = sniffImageType(new Uint8Array(body));
      if (actual !== declared)
        throw unsupportedMediaType("El contenido no coincide con el formato declarado.");
      const key = await data.logos.upload(tenant.scope, body, declared, {
        cleanup: c.env?.context?.deploy?.context === "production",
      });
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "organization.logo_updated",
        target: tenant.organization.slug,
      });
      return c.json({ ...brandingDto({ ...tenant.organization, logoBlobKey: key }) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/logo",
      tags: ["Club"],
      summary: "Quita el logo del club. Permiso `org.settings.write`",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.write")],
      responses: {
        200: {
          description: "Marca sin logo",
          content: { "application/json": { schema: OrganizationBrandingSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      await data.logos.remove(tenant.scope, {
        cleanup: c.env?.context?.deploy?.context === "production",
      });
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "organization.logo_removed",
        target: tenant.organization.slug,
      });
      return c.json({ ...brandingDto({ ...tenant.organization, logoBlobKey: null }) }, 200);
    },
  );

  return app;
}
