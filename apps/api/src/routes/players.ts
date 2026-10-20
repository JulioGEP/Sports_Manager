import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  EligibleMembersResponseSchema,
  FamilyResponseSchema,
  GuardianInviteSchema,
  GuardianLinkSchema,
  InvitationSentResponseSchema,
  PlayerCreateSchema,
  PlayerDetailResponseSchema,
  PlayerResponseSchema,
  PlayersResponseSchema,
  PlayerUpdateSchema,
  playerDisplayName,
  type Locale,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  invitationState,
  isUniqueViolation,
  type DataLayer,
  type PlayerRow,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { AppEnv } from "../http/context.ts";
import { badRequest, conflict, notFound } from "../http/errors.ts";
import { requireSession } from "../http/session.ts";
import { requireOrganizationHost, resolveTenant } from "../http/tenant.ts";
import { sendInvitationEmail } from "../services/invitations.ts";
import { organizationUrl } from "../tenancy.ts";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } },
});
const errors = {
  401: error("Sin sesión"),
  403: error("Sin pertenencia o sin permiso"),
  404: error("Host sin club o jugador inexistente"),
};
const json = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});
const idParam = z.object({ id: z.string().uuid() });

const playerDto = (p: PlayerRow) => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  birthDate: p.birthDate,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
});

/**
 * Jugadores y familias (Fase 1, Bloque 11, ADR 0028). Datos de menores: lectura con
 * `org.players.read`, cambios con `org.players.write`; una familia solo ve lo suyo (`org.family.read`).
 */
export function createPlayerRoutes(config: ApiConfig, data: DataLayer) {
  const app = new OpenAPIHono<AppEnv>();
  const chain = [
    resolveTenant(config, data),
    requireOrganizationHost,
    requireSession(data),
    requireActor(data),
  ] as const;
  app.use("/api/org/players", ...chain);
  app.use("/api/org/players/*", ...chain);
  app.use("/api/org/family", ...chain);

  const read = requirePermission("org.players.read");
  const write = requirePermission("org.players.write");

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

  async function detail(scope: Parameters<DataLayer["players"]["byId"]>[0], player: PlayerRow) {
    const [teams, guardians, invitations] = await Promise.all([
      data.players.teamsOf(scope, player.id),
      data.players.guardiansOf(scope, player.id),
      data.invitations.listForPlayer(scope, player.id),
    ]);
    return {
      player: playerDto(player),
      teams,
      guardians,
      pendingInvitations: invitations
        .map((i) => ({
          id: i.id,
          email: i.email,
          relationship: i.relationship,
          state: invitationState(i.status, i.expiresAt),
          expiresAt: i.expiresAt.toISOString(),
        }))
        .filter((i) => i.state === "pending" || i.state === "expired"),
    };
  }

  // --- Familia: lo propio ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/family",
      tags: ["Jugadores"],
      summary: "Los jugadores de la familia de la sesión, con su equipo y quién lo entrena",
      security: [{ sessionCookie: [] }],
      middleware: [requirePermission("org.family.read")],
      responses: { 200: json("Familia", FamilyResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const players = await data.players.familyOf(tenant.scope, c.get("sessionUser").id);
      return c.json(
        {
          players: players.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            birthDate: p.birthDate,
            status: p.status,
            relationship: p.relationship,
            teams: p.teams,
          })),
        },
        200,
      );
    },
  );

  // --- Jugadores ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players",
      tags: ["Jugadores"],
      summary: "Jugadores del club con sus equipos de la temporada actual",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        query: z.object({
          q: z.string().max(80).optional(),
          team: z.string().uuid().optional(),
        }),
      },
      responses: { 200: json("Jugadores", PlayersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { q, team } = c.req.valid("query");
      const players = await data.players.list(tenant.scope, { query: q, teamId: team });
      return c.json(
        {
          players: players.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            birthDate: p.birthDate,
            status: p.status,
            teams: p.teams,
            guardiansCount: p.guardiansCount,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/players",
      tags: ["Jugadores"],
      summary: "Da de alta un jugador y, si se indica, lo mete en un equipo",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        body: { content: { "application/json": { schema: PlayerCreateSchema } }, required: true },
      },
      responses: {
        201: json("Jugador", PlayerDetailResponseSchema),
        400: error("Equipo desconocido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const body = c.req.valid("json");
      if (body.teamId) {
        const team = await data.teams.byId(tenant.scope, body.teamId);
        if (!team) throw badRequest("Ese equipo no es de este club.");
      }
      const player = await data.players.create(tenant.scope, body);
      if (body.teamId) {
        await data.teams.addPlayer(tenant.scope, body.teamId, { playerId: player.id });
      }
      await audit(c, tenant, "player.created", playerDisplayName(player), {
        teamId: body.teamId ?? null,
      });
      return c.json(await detail(tenant.scope, player), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/{id}",
      tags: ["Jugadores"],
      summary: "Ficha del jugador: datos, equipos, familia e invitaciones de familia pendientes",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Jugador", PlayerDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const player = await data.players.byId(tenant.scope, id);
      if (!player) throw notFound("Ese jugador no existe.");
      return c.json(await detail(tenant.scope, player), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/org/players/{id}",
      tags: ["Jugadores"],
      summary: "Edita los datos del jugador o lo da de baja (estado inactivo)",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: PlayerUpdateSchema } }, required: true },
      },
      responses: { 200: json("Jugador", PlayerResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const player = await data.players.update(tenant.scope, id, body);
      if (!player) throw notFound("Ese jugador no existe.");
      await audit(c, tenant, "player.updated", playerDisplayName(player), body);
      return c.json({ player: playerDto(player) }, 200);
    },
  );

  // --- Familia del jugador ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/{id}/eligible-guardians",
      tags: ["Jugadores"],
      summary: "Miembros del club que se pueden vincular como familia sin invitación",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: idParam },
      responses: { 200: json("Miembros", EligibleMembersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json({ members: await data.players.eligibleGuardians(tenant.scope) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/players/{id}/guardians",
      tags: ["Jugadores"],
      summary:
        "Vincula a un miembro del club como familia del jugador (le añade el rol de tutor si no lo tiene)",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: GuardianLinkSchema } }, required: true },
      },
      responses: {
        200: json("Jugador", PlayerDetailResponseSchema),
        400: error("No es miembro del club"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const { userId, relationship } = c.req.valid("json");
      const player = await data.players.byId(tenant.scope, id);
      if (!player) throw notFound("Ese jugador no existe.");
      const roles = await data.memberships.rolesFor(tenant.scope, userId);
      if (roles.length === 0) throw badRequest("Esa persona no es miembro del club.");
      if (!roles.includes("guardian")) {
        await data.memberships.assignRole(tenant.scope, userId, "guardian");
      }
      await data.players.linkGuardian(tenant.scope, id, userId, relationship);
      await audit(c, tenant, "player.guardian_linked", playerDisplayName(player), {
        userId,
        relationship,
      });
      return c.json(await detail(tenant.scope, player), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/players/{id}/guardians/{userId}",
      tags: ["Jugadores"],
      summary: "Desvincula a una persona de la familia del jugador. Conserva su cuenta y su rol",
      security: [{ sessionCookie: [] }],
      middleware: [write],
      request: { params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }) },
      responses: { 200: json("Jugador", PlayerDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id, userId } = c.req.valid("param");
      const player = await data.players.byId(tenant.scope, id);
      if (!player) throw notFound("Ese jugador no existe.");
      const ok = await data.players.unlinkGuardian(tenant.scope, id, userId);
      if (!ok) throw notFound("Esa persona no está vinculada a este jugador.");
      await audit(c, tenant, "player.guardian_unlinked", playerDisplayName(player), { userId });
      return c.json(await detail(tenant.scope, player), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/players/{id}/guardians/invite",
      tags: ["Jugadores"],
      summary:
        "Invita a una familia por email con el rol de tutor; al aceptar, la cuenta queda vinculada al jugador",
      security: [{ sessionCookie: [] }],
      middleware: [write, requirePermission("org.members.invite")],
      request: {
        params: idParam,
        body: { content: { "application/json": { schema: GuardianInviteSchema } }, required: true },
      },
      responses: {
        201: json("Invitación creada", InvitationSentResponseSchema),
        409: error("Ya hay una invitación pendiente para ese email"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const user = c.get("sessionUser");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const player = await data.players.byId(tenant.scope, id);
      if (!player) throw notFound("Ese jugador no existe.");
      const locale = body.locale ?? (tenant.organization.defaultLocale as Locale);

      // Quien ya tiene cuenta y es miembro se vincula directamente, sin email.
      const existing = await data.users.findByEmail(body.email);
      if (existing) {
        const roles = await data.memberships.rolesFor(tenant.scope, existing.id);
        if (roles.length > 0) {
          throw conflict(
            "Esa persona ya es miembro del club: vincúlala desde la lista de miembros, sin invitación.",
          );
        }
      }

      let result;
      try {
        result = await data.invitations.create(tenant.scope, {
          email: body.email,
          roleCode: "guardian",
          locale,
          invitedBy: user.id,
          ttlDays: config.invitationTtlDays,
          playerId: player.id,
          relationship: body.relationship,
        });
      } catch (err) {
        if (isUniqueViolation(err)) result = { outcome: "pending_exists" as const };
        else throw err;
      }
      if (result.outcome === "pending_exists")
        throw conflict("Ya hay una invitación pendiente para ese email. Reenvíala o revócala.");

      const sent = await sendInvitationEmail(config, data, {
        organization: tenant.organization,
        issued: result,
        inviterName: user.name,
        origin: organizationUrl(
          tenant.organization.slug,
          config,
          c.req.header("host"),
          c.env?.context?.deploy?.context,
        ),
      });
      await audit(c, tenant, "invitation.created", body.email, {
        roleCode: "guardian",
        locale,
        player: playerDisplayName(player),
        relationship: body.relationship,
      });
      return c.json(sent, 201);
    },
  );

  return app;
}
