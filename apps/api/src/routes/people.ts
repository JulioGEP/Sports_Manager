import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  CLUB_MEMBER_STATUSES,
  ClubMemberCreateSchema,
  ClubMemberResponseSchema,
  ClubMembersResponseSchema,
  ClubMemberUpdateSchema,
  MemberTypeCreateSchema,
  MemberTypeResponseSchema,
  MemberTypesResponseSchema,
  MemberTypeUpdateSchema,
  PeopleResponseSchema,
  personDisplayName,
  PersonResponseSchema,
  PersonUpdateSchema,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  playerPhotoUrlFor,
  type ClubMemberRecord,
  type DataLayer,
  type PersonRow,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const errors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club o recurso inexistente"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const idParam = z.object({ id: z.string().uuid() });

/** La foto de una persona vive en el mismo store que la del jugador; la URL es la del jugador si lo es. */
const personDto = (p: PersonRow, slug: string, playerId: string | null) => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  birthDate: p.birthDate,
  gender: p.gender,
  email: p.email,
  phone: p.phone,
  nationalId: p.nationalId,
  photoUrl: playerId ? playerPhotoUrlFor(p.photoBlobKey, slug, playerId) : null,
  notes: p.notes,
  status: p.status,
  userId: p.userId,
  createdAt: p.createdAt.toISOString(),
});

/**
 * Personas y socios (Bloque 14, ADR 0031). Lectura con `org.club_members.read`, cambios con
 * `org.club_members.write`. Lo pendiente de cuota de cada socio solo sale con `org.fees.read`.
 */
export function createPeopleRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  for (const path of ["/api/org/people", "/api/org/club-members", "/api/org/member-types"]) {
    app.use(path, ...chain);
    app.use(`${path}/*`, ...chain);
  }
  const read = requirePermission("org.club_members.read");
  const write = requirePermission("org.club_members.write");

  const scopeOf = (c: { get: (key: "tenant") => AppEnv["Variables"]["tenant"] }) => {
    const tenant = c.get("tenant");
    if (tenant.kind !== "organization") throw notFound();
    return tenant;
  };
  const audit = (
    c: { get: (key: "sessionUser") => AppEnv["Variables"]["sessionUser"] },
    tenant: { organization: { id: string } },
    action: Parameters<DataLayer["audit"]["record"]>[0]["action"],
    target: string,
    details?: unknown,
  ) =>
    data.audit.record({
      actorUserId: c.get("sessionUser").id,
      organizationId: tenant.organization.id,
      action,
      target,
      details,
    });

  async function memberDtos(
    c: { get: (key: "actor") => AppEnv["Variables"]["actor"] },
    tenant: ReturnType<typeof scopeOf>,
    members: ClubMemberRecord[],
  ) {
    const fees = c.get("actor").permissions.has("org.fees.read")
      ? await data.fees.pendingByPerson(
          tenant.scope,
          members.map((m) => m.person.id),
        )
      : null;
    return members.map((m) => ({
      id: m.id,
      memberNumber: m.memberNumber,
      status: m.status,
      joinedOn: m.joinedOn,
      leftOn: m.leftOn,
      memberType: m.memberType,
      person: personDto(m.person, tenant.organization.slug, m.roles.player?.id ?? null),
      roles: m.roles,
      fees: fees ? (fees.get(m.person.id) ?? { pendingCents: 0, overdueCount: 0 }) : null,
    }));
  }

  // --- Personas ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/people",
      tags: ["Socios"],
      summary:
        "Busca personas del club por nombre o email, con sus papeles (para altas sobre alguien que ya existe)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ q: z.string().max(80).optional() }) },
      responses: { 200: json("Personas", PeopleResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { q } = c.req.valid("query");
      const people = await data.people.search(tenant.scope, { query: q });
      return c.json(
        {
          people: people.map(({ isMember, isPlayer, ...p }) => ({
            ...personDto(p, tenant.organization.slug, null),
            isMember,
            isPlayer,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/people/{id}",
      tags: ["Socios"],
      summary:
        "Edita los datos de una persona: nombre, nacimiento, contacto, documento, notas o estado",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: PersonUpdateSchema } }, required: true },
      },
      responses: { 200: json("Persona", PersonResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const person = await data.people.update(tenant.scope, id, body);
      if (!person) throw notFound("Esa persona no existe.");
      await audit(c, tenant, "person.updated", personDisplayName(person), Object.keys(body));
      return c.json({ person: personDto(person, tenant.organization.slug, null) }, 200);
    },
  );

  // --- Tipos de socio ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/member-types",
      tags: ["Socios"],
      summary: "Tipos de socio del club",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      responses: { 200: json("Tipos", MemberTypesResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json({ memberTypes: await data.memberTypes.list(tenant.scope) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/member-types",
      tags: ["Socios"],
      summary: "Crea un tipo de socio. Permiso `org.settings.write`",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.write")],
      request: {
        body: {
          content: { "application/json": { schema: MemberTypeCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Tipo creado", MemberTypeResponseSchema),
        409: error("Ya hay un tipo con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.memberTypes.create(tenant.scope, body);
      if (result.outcome === "name_taken")
        throw conflict("Ya hay un tipo de socio con ese nombre.");
      await audit(c, tenant, "member_type.created", result.memberType.name);
      return c.json({ memberType: result.memberType }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/member-types/{id}",
      tags: ["Socios"],
      summary: "Renombra o archiva un tipo de socio. Permiso `org.settings.write`",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.settings.write")],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: MemberTypeUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Tipo", MemberTypeResponseSchema),
        409: error("Ya hay un tipo con ese nombre"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.memberTypes.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese tipo de socio no existe.");
      if (result.outcome === "name_taken")
        throw conflict("Ya hay un tipo de socio con ese nombre.");
      await audit(c, tenant, "member_type.updated", result.memberType.name, body);
      return c.json({ memberType: result.memberType }, 200);
    },
  );

  // --- Socios ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/club-members",
      tags: ["Socios"],
      summary: "Socios del club: número, persona, tipo, estado, papeles y cuotas pendientes",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        query: z.object({
          q: z.string().max(80).optional(),
          status: z.enum(CLUB_MEMBER_STATUSES).optional(),
          type: z.string().uuid().optional(),
        }),
      },
      responses: { 200: json("Socios", ClubMembersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { q, status, type } = c.req.valid("query");
      const members = await data.clubMembers.list(tenant.scope, {
        query: q,
        status,
        memberTypeId: type,
      });
      return c.json({ members: await memberDtos(c, tenant, members) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/club-members",
      tags: ["Socios"],
      summary: "Alta de socio: sobre una persona que ya existe o creando una nueva",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: {
          content: { "application/json": { schema: ClubMemberCreateSchema } },
          required: true,
        },
      },
      responses: {
        201: json("Socio", ClubMemberResponseSchema),
        400: error("Persona o tipo desconocidos"),
        409: error("Ya es socio o el número está ocupado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      const result = await data.clubMembers.create(tenant.scope, body);
      if (result.outcome === "unknown_person") throw badRequest("Esa persona no es de este club.");
      if (result.outcome === "unknown_member_type")
        throw badRequest("Ese tipo de socio no es de este club.");
      if (result.outcome === "already_member") throw conflict("Esa persona ya es socia del club.");
      if (result.outcome === "number_taken") throw conflict("Ese número de socio ya está ocupado.");
      await audit(c, tenant, "club_member.created", personDisplayName(result.member.person), {
        memberNumber: result.member.memberNumber,
      });
      return c.json({ member: (await memberDtos(c, tenant, [result.member]))[0]! }, 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/club-members/{id}",
      tags: ["Socios"],
      summary: "Ficha de un socio",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Socio", ClubMemberResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const member = await data.clubMembers.byId(tenant.scope, id);
      if (!member) throw notFound("Ese socio no existe.");
      return c.json({ member: (await memberDtos(c, tenant, [member]))[0]! }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/club-members/{id}",
      tags: ["Socios"],
      summary: "Edita la ficha de socio: tipo, número, alta, baja o estado",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: ClubMemberUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Socio", ClubMemberResponseSchema),
        400: error("Tipo desconocido"),
        409: error("Número ocupado"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await data.clubMembers.update(tenant.scope, id, body);
      if (result.outcome === "not_found") throw notFound("Ese socio no existe.");
      if (result.outcome === "unknown_member_type")
        throw badRequest("Ese tipo de socio no es de este club.");
      if (result.outcome === "number_taken") throw conflict("Ese número de socio ya está ocupado.");
      await audit(c, tenant, "club_member.updated", personDisplayName(result.member.person), body);
      return c.json({ member: (await memberDtos(c, tenant, [result.member]))[0]! }, 200);
    },
  );

  return app;
}
