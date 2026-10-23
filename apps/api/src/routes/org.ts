import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ACCESS_AREAS,
  AccessAreaSchema,
  AccessAreaUpdateSchema,
  AccessOverviewResponseSchema,
  AccessProfileRowSchema,
  ActivityResponseSchema,
  ApiErrorSchema,
  AssignRoleBodySchema,
  AssignRoleResponseSchema,
  overridableAreas,
  CONFIGURABLE_PROFILES,
  ConfigurableProfileSchema,
  defaultPermissionsOf,
  effectivePermissions,
  isAreaVisible,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  MemberAccessResponseSchema,
  MemberAccessUpdateSchema,
  MemberSectionsResponseSchema,
  MemberSectionsUpdateSchema,
  membershipOfProfile,
  MembersResponseSchema,
  OrganizationBrandingSchema,
  OrganizationResponseSchema,
  OrganizationUpdateResponseSchema,
  OrganizationUpdateSchema,
  overridesFor,
  PROFILE_SCOPE,
  RoleCodeSchema,
  roleVisibleAreas,
  summarizeScope,
  type AccessArea,
  type AccessProfileRow,
  type AccessRule,
  type AccessScope,
  type Actor as ActorDto,
  type ClubStyle,
  type ClubVoice,
  type ConfigurableProfile,
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
import { accessScopeOf, requireActor, requirePermission } from "../http/actor.ts";
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

/** Identidad visual del club (ADR 0043) tal como la guarda la base, que ya valida cada opción. */
export function styleDto(org: OrganizationRow): ClubStyle {
  return {
    typography: org.styleTypography as ClubStyle["typography"],
    buttons: org.styleButtons as ClubStyle["buttons"],
    icons: org.styleIcons as ClubStyle["icons"],
    background: org.styleBackground as ClubStyle["background"],
    hero: org.styleHero as ClubStyle["hero"],
    nav: org.styleNav as ClubStyle["nav"],
    corners: org.styleCorners as ClubStyle["corners"],
  };
}

export function brandingDto(org: OrganizationRow) {
  return {
    slug: org.slug,
    name: org.name,
    defaultLocale: org.defaultLocale as Locale,
    brandPrimaryColor: org.brandPrimaryColor,
    brandSecondaryColor: org.brandSecondaryColor,
    logoUrl: logoUrlFor(org.logoBlobKey, org.slug),
    voice: org.voice as ClubVoice,
    style: styleDto(org),
    motto: org.motto,
  };
}

function actorDto(
  actor: Actor,
  scope: AccessScope,
  athletePlayerId: string | null = null,
  canShop = false,
): ActorDto {
  return actor.kind === "member"
    ? {
        kind: "member",
        roles: actor.roles,
        position: actor.position,
        permissions: [...actor.permissions],
        viewingAs: actor.viewingAs,
        canViewAs: actor.canViewAs,
        scope: summarizeScope(scope),
        athletePlayerId,
        canShop,
      }
    : { kind: "platform_support", hasGrant: actor.hasGrant, permissions: [...actor.permissions] };
}

/** Una fila de la matriz de acceso: lo que ve un perfil por defecto y con las reglas del club. */
function profileRow(profile: ConfigurableProfile, rules: readonly AccessRule[]): AccessProfileRow {
  const defaults = defaultPermissionsOf(profile);
  const effective = effectivePermissions([membershipOfProfile(profile)], rules);
  return {
    profile,
    scope: PROFILE_SCOPE[profile],
    areas: ACCESS_AREAS.map((area) => ({
      area,
      default: isAreaVisible(defaults, area),
      visible: isAreaVisible(effective, area),
    })),
  };
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
      style: styleDto(org),
      motto: org.motto,
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
      const [athlete, canShop] =
        actor.kind === "member"
          ? await Promise.all([
              data.load.athleteOf(tenant.scope, actor.userId),
              data.store.canShop(tenant.scope, actor.userId),
            ])
          : [null, false];
      return c.json(
        {
          organization,
          actor: actorDto(actor, await accessScopeOf(data, c), athlete?.id ?? null, canShop),
        },
        200,
      );
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
      const ids = members.map((m) => m.userId);
      const [sections, overrides] = await Promise.all([
        data.access.sectionsByUser(tenant.scope, ids),
        data.access.overridesByUser(tenant.scope, ids),
      ]);
      return c.json(
        {
          members: members.map((m) => ({
            ...m,
            sections: sections.get(m.userId) ?? [],
            accessOverrides: overrides.get(m.userId) ?? { allow: [], deny: [] },
            memberSince: m.memberSince.toISOString(),
          })),
        },
        200,
      );
    },
  );

  // --- Acceso por rol (Bloque 19, ADR 0033): solo quien gestiona el personal ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/access",
      tags: ["Club"],
      summary:
        "Qué área ve cada rol o cargo, por defecto y con las reglas del club, y las excepciones por persona",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.manage")],
      responses: {
        200: {
          description: "Matriz de acceso",
          content: { "application/json": { schema: AccessOverviewResponseSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const rules = await data.access.listRules(tenant.scope);
      const byUser = new Map<
        string,
        { userId: string; name: string; allow: AccessArea[]; deny: AccessArea[] }
      >();
      for (const u of rules.users) {
        const entry = byUser.get(u.userId) ?? {
          userId: u.userId,
          name: u.name,
          allow: [],
          deny: [],
        };
        entry[u.effect].push(u.area);
        byUser.set(u.userId, entry);
      }
      const people = await Promise.all(
        [...byUser.values()].map(async (person) => {
          const memberships = await data.memberships.membershipsFor(tenant.scope, person.userId);
          return memberships.length === 0
            ? null
            : { ...person, byRole: roleVisibleAreas(memberships, rules.profiles) };
        }),
      );
      return c.json(
        {
          profiles: CONFIGURABLE_PROFILES.map((profile) => profileRow(profile, rules.profiles)),
          // Quien ya no es miembro no cuenta: sus reglas no le afectan en este club.
          people: people.filter((p) => p !== null),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/access/profiles/{profile}/areas/{area}",
      tags: ["Club"],
      summary:
        "Incluye o excluye un área para un rol o cargo. Igual que por defecto, borra la regla",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.manage")],
      request: {
        params: z.object({ profile: ConfigurableProfileSchema, area: AccessAreaSchema }),
        body: {
          content: { "application/json": { schema: AccessAreaUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: {
          description: "La fila del perfil ya actualizada",
          content: { "application/json": { schema: AccessProfileRowSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { profile, area } = c.req.valid("param");
      const { visible } = c.req.valid("json");
      const byDefault = isAreaVisible(defaultPermissionsOf(profile), area);
      const effect = visible === byDefault ? null : visible ? "allow" : "deny";
      await data.access.setProfileRule(tenant.scope, profile, area, effect);
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "access.rule_updated",
        target: profile,
        details: { area, visible, effect },
      });
      const rules = await data.access.listRules(tenant.scope);
      return c.json(profileRow(profile, rules.profiles), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/access/members/{userId}",
      tags: ["Club"],
      summary:
        "Lo que ve una persona concreta (ADR 0036): se guarda como excepciones a lo que ve su rol, en los dos sentidos. Solo personal y cuerpo técnico; la administración lo ve todo",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.manage")],
      request: {
        params: z.object({ userId: z.string().uuid() }),
        body: {
          content: { "application/json": { schema: MemberAccessUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Excepciones guardadas",
          content: { "application/json": { schema: MemberAccessResponseSchema } },
        },
        409: {
          description: "Es administración del club o no es personal ni cuerpo técnico",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { userId } = c.req.valid("param");
      const { visible } = c.req.valid("json");
      const [memberships, rules] = await Promise.all([
        data.memberships.membershipsFor(tenant.scope, userId),
        data.access.rulesFor(tenant.scope, userId),
      ]);
      if (memberships.length === 0) throw notFound("Esa persona no es miembro de este club.");
      // La administración solo admite la excepción de Salud (ADR 0039); la familia, ninguna.
      const allowed = overridableAreas(memberships.map((m) => m.roleCode));
      if (allowed.length === 0)
        throw conflict(
          "Solo el personal y el cuerpo técnico tienen excepciones; la administración lo ve todo.",
        );
      const byRole = roleVisibleAreas(memberships, rules);
      const overrides = overridesFor(byRole, visible);
      if ([...overrides.allow, ...overrides.deny].some((a) => !allowed.includes(a)))
        throw conflict(
          "A la administración solo se le abre Salud por excepción; el resto lo ve todo.",
        );
      await data.access.setUserOverrides(tenant.scope, userId, overrides);
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "membership.access_updated",
        target: userId,
        details: overrides,
      });
      return c.json({ userId, byRole, ...overrides }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/access/members/{userId}",
      tags: ["Club"],
      summary: "Quita las excepciones de una persona: vuelve a ver lo que ve su rol",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.manage")],
      request: { params: z.object({ userId: z.string().uuid() }) },
      responses: {
        204: { description: "Sin excepciones" },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { userId } = c.req.valid("param");
      const roles = await data.memberships.rolesFor(tenant.scope, userId);
      if (roles.length === 0) throw notFound("Esa persona no es miembro de este club.");
      await data.access.setUserOverrides(tenant.scope, userId, { allow: [], deny: [] });
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "membership.access_updated",
        target: userId,
        details: { allow: [], deny: [] },
      });
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/members/{userId}/sections",
      tags: ["Club"],
      summary:
        "Secciones a cargo de alguien del personal (dirección, coordinación). Sustituye las asignadas; las que coordina siguen por la sección",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.members.manage")],
      request: {
        params: z.object({ userId: z.string().uuid() }),
        body: {
          content: { "application/json": { schema: MemberSectionsUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Secciones a su cargo",
          content: { "application/json": { schema: MemberSectionsResponseSchema } },
        },
        400: {
          description: "Alguna sección no es de este club",
          content: { "application/json": { schema: ApiErrorSchema } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const tenant = c.get("tenant");
      if (tenant.kind !== "organization") throw notFound();
      const { userId } = c.req.valid("param");
      const { sectionIds } = c.req.valid("json");
      const roles = await data.memberships.rolesFor(tenant.scope, userId);
      if (roles.length === 0) throw notFound("Esa persona no es miembro de este club.");
      const outcome = await data.access.setUserSections(tenant.scope, userId, sectionIds);
      if (outcome === "unknown_section") throw badRequest("Alguna sección no es de este club.");
      await data.audit.record({
        actorUserId: c.get("sessionUser").id,
        organizationId: tenant.organization.id,
        action: "membership.sections_updated",
        target: userId,
        details: { sectionIds },
      });
      const sections = (await data.access.sectionsByUser(tenant.scope, [userId])).get(userId) ?? [];
      return c.json({ userId, sections }, 200);
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
      summary:
        "Cambia nombre, idioma, zona horaria, voz, colores, identidad visual o lema del club. Permiso `org.settings.write`",
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
        // La identidad visual se audita por opción: "style.typography", "style.nav"...
        details: {
          fields: Object.entries(patch).flatMap(([key, value]) =>
            key === "style" && value && typeof value === "object"
              ? Object.keys(value).map((option) => `style.${option}`)
              : [key],
          ),
        },
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
