import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  AuditResponseSchema,
  InvitationSentResponseSchema,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  MeResponseSchema,
  OrganizationCreateSchema,
  PlatformInvitationCreateSchema,
  PlatformOrganizationDetailSchema,
  PlatformOrganizationResponseSchema,
  PlatformOrganizationsResponseSchema,
  PlatformOrganizationUpdateSchema,
  SportsResponseSchema,
  type Locale,
  type PlatformOrganization,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  isLogoContentType,
  logoUrlFor,
  sniffImageType,
  type DataLayer,
  type OrganizationCounts,
  type OrganizationRow,
  type OrganizationSport,
  type OrgScope,
} from "../data/index.ts";
import { requirePlatformAdmin } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import {
  badRequest,
  conflict,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { invitationDto, sendInvitationEmail } from "../services/invitations.ts";
import { organizationUrl } from "../tenancy.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const errors = {
  401: error("Sin sesión"),
  403: error("No es administrador de plataforma"),
};
const slugParam = z.object({ slug: z.string().min(1).max(63) });

/**
 * Admin interno (Bloque 6, ADR 0022 y 0023): cadena sesión → administrador de plataforma, en
 * cualquier host. No resuelve club por host: cada ruta nombra el club por su slug y la capa de
 * datos acuña el ámbito a partir de la fila real.
 */
export function createPlatformRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  app.use("/api/platform/*", requireSession(data), requirePlatformAdmin(data));

  function dto(
    org: OrganizationRow,
    sport: OrganizationSport,
    counts: OrganizationCounts,
    host: string | undefined,
  ): PlatformOrganization {
    const url = organizationUrl(org.slug, config, host);
    const logo = logoUrlFor(org.logoBlobKey);
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status as PlatformOrganization["status"],
      defaultLocale: org.defaultLocale as Locale,
      sport,
      brandPrimaryColor: org.brandPrimaryColor,
      brandSecondaryColor: org.brandSecondaryColor,
      logoUrl: logo ? `${url}${logo}` : null,
      url,
      createdAt: org.createdAt.toISOString(),
      counts,
    };
  }

  async function load(slug: string) {
    const resolved = await data.organizations.findBySlug(slug);
    if (!resolved) throw notFound("No existe ningún club con ese subdominio.");
    return resolved;
  }

  async function detailDto(org: OrganizationRow, scope: OrgScope, host: string | undefined) {
    const [sport, counts] = await Promise.all([
      data.organizations.getSport(scope),
      data.organizations.countsFor(scope),
    ]);
    return dto(org, sport, counts, host);
  }

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
          content: { "application/json": { schema: MeResponseSchema } },
        },
        ...errors,
      },
    }),
    (c) => c.json({ user: c.get("sessionUser"), platformAdmin: true }, 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/platform/sports",
      tags: ["Plataforma"],
      summary: "Catálogo de deportes para dar de alta clubes",
      security: [{ sessionCookie: [] }],
      responses: {
        200: {
          description: "Deportes",
          content: { "application/json": { schema: SportsResponseSchema } },
        },
        ...errors,
      },
    }),
    async (c) => c.json({ sports: await data.sports.list() }, 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/platform/organizations",
      tags: ["Plataforma"],
      summary: "Todos los clubes con estado y recuentos. Sin datos personales",
      security: [{ sessionCookie: [] }],
      responses: {
        200: {
          description: "Clubes",
          content: { "application/json": { schema: PlatformOrganizationsResponseSchema } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const host = c.req.header("host");
      const rows = await data.organizations.listAll();
      return c.json(
        { organizations: rows.map((r) => dto(r.organization, r.sport, r.counts, host)) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/platform/organizations",
      tags: ["Plataforma"],
      summary: "Crea un club: nombre, subdominio, idioma, deporte y colores",
      security: [{ sessionCookie: [] }],
      request: {
        body: {
          content: { "application/json": { schema: OrganizationCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: {
          description: "Club creado",
          content: { "application/json": { schema: PlatformOrganizationResponseSchema } },
        },
        400: error("Datos no válidos o deporte desconocido"),
        409: error("Ese subdominio ya existe"),
        ...errors,
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      if (body.slug === config.tenantFallbackSlug && config.tenantFallbackSlug !== "demo") {
        throw badRequest("Ese subdominio está reservado para el club de reserva.");
      }
      const result = await data.organizations.create(body);
      if (result.outcome === "unknown_sport") throw badRequest("Ese deporte no existe.");
      if (result.outcome === "slug_taken") throw conflict("Ya existe un club con ese subdominio.");
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: result.organization.id,
        action: "organization.created",
        target: result.organization.slug,
        details: { name: body.name, defaultSportCode: body.defaultSportCode },
      });
      const organization = await detailDto(result.organization, result.scope, c.req.header("host"));
      return c.json({ organization }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/platform/organizations/{slug}",
      tags: ["Plataforma"],
      summary: "Detalle de un club y las invitaciones hechas desde el admin por quien consulta",
      security: [{ sessionCookie: [] }],
      request: { params: slugParam },
      responses: {
        200: {
          description: "Club",
          content: { "application/json": { schema: PlatformOrganizationDetailSchema } },
        },
        404: error("No existe"),
        ...errors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { organization, scope } = await load(slug);
      const me = c.get("sessionUser");
      const invitations = (await data.invitations.list(scope)).filter(
        (i) => i.invitedByUserId === me.id,
      );
      return c.json(
        {
          organization: await detailDto(organization, scope, c.req.header("host")),
          myInvitations: invitations.map(invitationDto),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/platform/organizations/{slug}",
      tags: ["Plataforma"],
      summary: "Edita nombre, idioma, colores o estado de un club",
      security: [{ sessionCookie: [] }],
      request: {
        params: slugParam,
        body: {
          content: { "application/json": { schema: PlatformOrganizationUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Club actualizado",
          content: { "application/json": { schema: PlatformOrganizationResponseSchema } },
        },
        400: error("Nada que cambiar"),
        404: error("No existe"),
        ...errors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid("param");
      const patch = c.req.valid("json");
      if (Object.keys(patch).length === 0) throw badRequest("No hay nada que cambiar.");
      const { scope } = await load(slug);
      const updated = await data.organizations.update(scope, patch);
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: updated.id,
        action: "organization.updated",
        target: updated.slug,
        details: { fields: Object.keys(patch) },
      });
      return c.json({ organization: await detailDto(updated, scope, c.req.header("host")) }, 200);
    },
  );

  const logoBody = Object.fromEntries(
    LOGO_CONTENT_TYPES.map((type) => [type, { schema: z.string().openapi({ format: "binary" }) }]),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/platform/organizations/{slug}/logo",
      tags: ["Plataforma"],
      summary: `Sube el logo de un club (cuerpo binario, ${LOGO_CONTENT_TYPES.join(", ")}, máximo ${LOGO_MAX_BYTES} bytes)`,
      security: [{ sessionCookie: [] }],
      request: { params: slugParam, body: { content: logoBody, required: true } },
      responses: {
        200: {
          description: "Club con el logo nuevo",
          content: { "application/json": { schema: PlatformOrganizationResponseSchema } },
        },
        404: error("No existe"),
        413: error("Demasiado grande"),
        415: error("Formato no admitido"),
        ...errors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { organization, scope } = await load(slug);
      const declared =
        (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!isLogoContentType(declared)) throw unsupportedMediaType();
      if (Number(c.req.header("content-length") ?? "0") > LOGO_MAX_BYTES) throw payloadTooLarge();
      const body = await c.req.arrayBuffer();
      if (body.byteLength === 0) throw badRequest("El fichero está vacío.");
      if (body.byteLength > LOGO_MAX_BYTES) throw payloadTooLarge();
      if (sniffImageType(new Uint8Array(body)) !== declared)
        throw unsupportedMediaType("El contenido no coincide con el formato declarado.");
      const key = await data.logos.upload(scope, body, declared, {
        cleanup: c.env?.context?.deploy?.context === "production",
      });
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: organization.id,
        action: "organization.logo_updated",
        target: organization.slug,
      });
      const org = { ...organization, logoBlobKey: key };
      return c.json({ organization: await detailDto(org, scope, c.req.header("host")) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/platform/organizations/{slug}/logo",
      tags: ["Plataforma"],
      summary: "Quita el logo de un club",
      security: [{ sessionCookie: [] }],
      request: { params: slugParam },
      responses: {
        200: {
          description: "Club sin logo",
          content: { "application/json": { schema: PlatformOrganizationResponseSchema } },
        },
        404: error("No existe"),
        ...errors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { organization, scope } = await load(slug);
      await data.logos.remove(scope, { cleanup: c.env?.context?.deploy?.context === "production" });
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: organization.id,
        action: "organization.logo_removed",
        target: organization.slug,
      });
      const org = { ...organization, logoBlobKey: null };
      return c.json({ organization: await detailDto(org, scope, c.req.header("host")) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/platform/organizations/{slug}/invitations",
      tags: ["Plataforma"],
      summary: "Invita al primer administrador (u otro rol) de un club y le envía el email",
      security: [{ sessionCookie: [] }],
      request: {
        params: slugParam,
        body: {
          content: { "application/json": { schema: PlatformInvitationCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: {
          description: "Invitación creada",
          content: { "application/json": { schema: InvitationSentResponseSchema } },
        },
        404: error("No existe"),
        409: error("Ya es miembro con ese rol o ya tiene una invitación pendiente"),
        ...errors,
      },
    }),
    async (c) => {
      const { slug } = c.req.valid("param");
      const body = c.req.valid("json");
      const { organization, scope } = await load(slug);
      const me = c.get("sessionUser");
      const locale = body.locale ?? (organization.defaultLocale as Locale);
      const existing = await data.users.findByEmail(body.email);
      if (existing) {
        const roles = await data.memberships.rolesFor(scope, existing.id);
        if (roles.includes(body.roleCode))
          throw conflict("Esa persona ya es miembro del club con ese rol.");
      }
      const result = await data.invitations.create(scope, {
        email: body.email,
        roleCode: body.roleCode,
        locale,
        invitedBy: me.id,
        ttlDays: config.invitationTtlDays,
      });
      if (result.outcome === "pending_exists")
        throw conflict("Ya hay una invitación pendiente para ese email en ese club.");
      const sent = await sendInvitationEmail(config, data, {
        organization,
        issued: result,
        inviterName: me.name,
        origin: organizationUrl(organization.slug, config, c.req.header("host")),
      });
      await data.audit.record({
        actorUserId: me.id,
        organizationId: organization.id,
        action: "invitation.created",
        target: body.email,
        details: { roleCode: body.roleCode, locale, from: "platform" },
      });
      return c.json(sent, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/platform/audit",
      tags: ["Plataforma"],
      summary: "Últimas acciones registradas: quién hizo qué, sobre qué club y a quién",
      security: [{ sessionCookie: [] }],
      request: { query: z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }) },
      responses: {
        200: {
          description: "Entradas",
          content: { "application/json": { schema: AuditResponseSchema } },
        },
        ...errors,
      },
    }),
    async (c) => {
      const { limit } = c.req.valid("query");
      const entries = await data.audit.listRecent(limit ?? 100);
      return c.json(
        { entries: entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) },
        200,
      );
    },
  );

  return app;
}
