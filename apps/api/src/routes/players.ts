import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorSchema,
  DevelopmentPlanUpdateSchema,
  EligibleMembersResponseSchema,
  FamilyPlayerDetailResponseSchema,
  FamilyResponseSchema,
  GuardianInviteSchema,
  GuardianLinkSchema,
  InvitationSentResponseSchema,
  PLAYER_MISSING_FILTERS,
  PLAYER_PHOTO_CONTENT_TYPES,
  PLAYER_PHOTO_MAX_BYTES,
  PlayerCreateSchema,
  PlayerDetailResponseSchema,
  PlayerIndicatorsUpdateSchema,
  PlayerNoteCreateSchema,
  PlayerObjectiveUpdateSchema,
  PlayerResponseSchema,
  PlayersOverviewResponseSchema,
  PlayersResponseSchema,
  PlayerUpdateSchema,
  playerDisplayName,
  type Locale,
  type PlayerEventKind,
} from "@sportsmanager/shared";
import type { ApiConfig } from "../config.ts";
import {
  invitationState,
  isLogoContentType,
  isUniqueViolation,
  playerPhotoUrlFor,
  sniffImageType,
  type DataLayer,
  type PlayerRow,
} from "../data/index.ts";
import { requireActor, requirePermission } from "../http/actor.ts";
import type { Actor, AppEnv } from "../http/context.ts";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from "../http/errors.ts";
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

const playerDto = (p: PlayerRow, slug: string) => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  birthDate: p.birthDate,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
  joinedOn: p.joinedOn,
  photoUrl: playerPhotoUrlFor(p.photoBlobKey, slug, p.id),
  dominantFoot: p.dominantFoot,
  heightCm: p.heightCm,
});

/** El alta en el club: la fecha indicada o, si no la hay, la creación de la ficha. */
const joinedOn = (p: PlayerRow) => p.joinedOn ?? p.createdAt.toISOString().slice(0, 10);

const photoBody = Object.fromEntries(
  PLAYER_PHOTO_CONTENT_TYPES.map((type) => [
    type,
    { schema: z.string().openapi({ format: "binary" }) },
  ]),
);

/** Lo que una familia ve del timeline: nunca anotaciones del personal ni cambios de indicadores. */
const FAMILY_EVENT_KINDS: readonly PlayerEventKind[] = [
  "roster_added",
  "roster_removed",
  "status_changed",
  "objective_updated",
  "plan_updated",
  "photo_updated",
  "challenge_closed",
];

/**
 * Jugadores y familias (Fase 1, Bloque 11, ADR 0028), ficha ampliada (Bloque 12, ADR 0029) y,
 * en el Bloque 13 (ADR 0030), permisos por equipo, ficha para la familia y vista de conjunto.
 * Datos de menores: lectura con `org.players.read`, cambios con `org.players.write`; valoraciones
 * con `org.players.assess` o, sobre los jugadores de los equipos propios, `org.players.assess_own`;
 * una familia solo ve lo suyo (`org.family.read`) y cambia la foto de los suyos (`org.family.write`).
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
  app.use("/api/org/family/*", ...chain);

  const read = requirePermission("org.players.read");
  const write = requirePermission("org.players.write");
  const family = requirePermission("org.family.read");

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

  type Tenant = ReturnType<typeof scopeOf>;
  type Ctx = {
    get: ((key: "sessionUser") => AppEnv["Variables"]["sessionUser"]) &
      ((key: "actor") => Actor) &
      ((key: "tenant") => AppEnv["Variables"]["tenant"]);
  };
  const actorId = (c: Ctx) => c.get("sessionUser").id;

  /**
   * Valorar a un jugador (objetivo, indicadores, PDI, anotaciones): con permiso de club, o con el
   * permiso "propio" si quien llama es cuerpo técnico de un equipo donde está el jugador esta temporada.
   */
  async function requireAssess(c: Ctx, tenant: Tenant, playerId: string) {
    const actor = c.get("actor");
    if (actor.permissions.has("org.players.assess")) return;
    if (
      actor.permissions.has("org.players.assess_own") &&
      (await data.players.isStaffOf(tenant.scope, actorId(c), playerId))
    )
      return;
    throw forbidden();
  }

  /** La foto la cambian quien escribe jugadores, su cuerpo técnico y su propia familia. */
  async function requirePhotoWrite(c: Ctx, tenant: Tenant, playerId: string) {
    const actor = c.get("actor");
    if (actor.permissions.has("org.players.write")) return;
    if (
      actor.permissions.has("org.players.assess_own") &&
      (await data.players.isStaffOf(tenant.scope, actorId(c), playerId))
    )
      return;
    if (
      actor.permissions.has("org.family.write") &&
      (await data.players.isGuardianOf(tenant.scope, actorId(c), playerId))
    )
      return;
    throw forbidden();
  }

  /** Qué puede hacer quien pregunta en la ficha: valorar y cambiar la foto. */
  async function accessOf(c: Ctx, tenant: Tenant, playerId: string) {
    const actor = c.get("actor");
    const own =
      actor.permissions.has("org.players.assess_own") &&
      (await data.players.isStaffOf(tenant.scope, actorId(c), playerId));
    const assess = actor.permissions.has("org.players.assess") || own;
    const photo = actor.permissions.has("org.players.write") || own;
    return { assess, photo };
  }

  async function detail(c: Ctx, tenant: Tenant, player: PlayerRow) {
    const scope = tenant.scope;
    const profile = data.playerProfile;
    const [teams, guardians, invitations, objective, indicators, developmentPlan, events, access] =
      await Promise.all([
        data.players.teamsOf(scope, player.id),
        data.players.guardiansOf(scope, player.id),
        data.invitations.listForPlayer(scope, player.id),
        profile.objectiveOf(scope, player.id),
        profile.indicatorsOf(scope, player.id),
        profile.planOf(scope, player.id),
        profile.eventsOf(scope, player.id),
        accessOf(c, tenant, player.id),
      ]);
    return {
      access,
      player: playerDto(player, tenant.organization.slug),
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
      objective: objective ? { ...objective, updatedAt: objective.updatedAt.toISOString() } : null,
      indicators: indicators.map((i) => ({ ...i, updatedAt: i.updatedAt.toISOString() })),
      developmentPlan: developmentPlan
        ? { ...developmentPlan, updatedAt: developmentPlan.updatedAt.toISOString() }
        : null,
      // El alta en el club cierra siempre el timeline: sale de la fecha de alta, no se guarda.
      timeline: [
        ...events,
        {
          id: `joined-${player.id}`,
          kind: "joined" as const,
          happenedOn: joinedOn(player),
          details: {},
          actorName: null,
        },
      ],
    };
  }

  /** Jugador del club o 404. */
  async function playerOr404(tenant: Tenant, id: string): Promise<PlayerRow> {
    const player = await data.players.byId(tenant.scope, id);
    if (!player) throw notFound("Ese jugador no existe.");
    return player;
  }

  /** El responsable del objetivo o la coordinación del PDI tienen que ser miembros del club. */
  async function requireMember(tenant: Tenant, userId: string | null | undefined) {
    if (!userId) return;
    const roles = await data.memberships.rolesFor(tenant.scope, userId);
    if (roles.length === 0) throw badRequest("Esa persona no es miembro del club.");
  }

  // --- Familia: lo propio ---
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/family",
      tags: ["Jugadores"],
      summary: "Los jugadores de la familia de la sesión, con su equipo y quién lo entrena",
      security: [{ sessionCookie: [] }],
      middleware: [family],
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
            photoUrl: playerPhotoUrlFor(p.photoBlobKey, tenant.organization.slug, p.id),
            teams: p.teams,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/family/players/{id}",
      tags: ["Jugadores"],
      summary:
        "Ficha de uno de los suyos, vista por la familia: foto, equipo, objetivo, PDI si está compartido, movimientos y puntos del reto. Sin indicadores ni comparativas",
      security: [{ sessionCookie: [] }],
      middleware: [family],
      request: { params: idParam },
      responses: { 200: json("Jugador", FamilyPlayerDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const player = await data.players.familyPlayer(tenant.scope, actorId(c), id);
      if (!player) throw notFound("Ese jugador no está vinculado a tu cuenta.");
      const scope = tenant.scope;
      const [objective, plan, events, challenge] = await Promise.all([
        data.playerProfile.objectiveOf(scope, id),
        data.playerProfile.planOf(scope, id),
        data.playerProfile.eventsOf(scope, id, { kinds: FAMILY_EVENT_KINDS }),
        data.challenges.active(scope),
      ]);
      const totals = challenge ? await data.challenges.totalsFor(scope, challenge.id, id) : null;
      return c.json(
        {
          player: {
            ...playerDto(player, tenant.organization.slug),
            relationship: player.relationship,
          },
          teams: player.teams,
          objective: objective
            ? { ...objective, updatedAt: objective.updatedAt.toISOString() }
            : null,
          developmentPlan:
            plan && plan.status === "shared"
              ? { ...plan, updatedAt: plan.updatedAt.toISOString() }
              : null,
          timeline: [
            ...events,
            {
              id: `joined-${player.id}`,
              kind: "joined" as const,
              happenedOn: joinedOn(player),
              details: {},
              actorName: null,
            },
          ],
          challenge:
            challenge && totals
              ? {
                  id: challenge.id,
                  name: challenge.name,
                  minPoints: challenge.minPoints,
                  targetPoints: challenge.targetPoints,
                  approvedPoints: totals.approved,
                  pendingPoints: totals.pending,
                }
              : null,
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
          /** Lo que falta en la ficha: foto, objetivo, equipo o familia (alertas del inicio). */
          missing: z.enum(PLAYER_MISSING_FILTERS).optional(),
        }),
      },
      responses: { 200: json("Jugadores", PlayersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { q, team, missing } = c.req.valid("query");
      const players = await data.players.list(tenant.scope, { query: q, teamId: team, missing });
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
            pendingInvitationsCount: p.pendingInvitationsCount,
            photoUrl: playerPhotoUrlFor(p.photoBlobKey, tenant.organization.slug, p.id),
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/overview",
      tags: ["Jugadores"],
      summary:
        "Vista de conjunto para los paneles del personal: indicadores, objetivo y plan de cada jugador activo. Con `scope=own`, solo los equipos propios",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { query: z.object({ scope: z.enum(["club", "own"]).optional() }) },
      responses: { 200: json("Jugadores", PlayersOverviewResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { scope: requested } = c.req.valid("query");
      const own = requested === "own";
      const teamIds = own ? await data.memberships.ownTeamIds(tenant.scope, actorId(c)) : undefined;
      const players = await data.players.overview(tenant.scope, { teamIds });
      return c.json(
        {
          scope: own ? ("own" as const) : ("club" as const),
          players: players.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            status: p.status,
            photoUrl: playerPhotoUrlFor(p.photoBlobKey, tenant.organization.slug, p.id),
            birthDate: p.birthDate,
            heightCm: p.heightCm,
            dominantFoot: p.dominantFoot,
            teams: p.teams,
            guardiansCount: p.guardiansCount,
            indicators: p.indicators,
            objective: p.objective,
            plan: p.plan,
            lastNoteOn: p.lastNoteOn,
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
        const team = await data.teams.byId(tenant.scope, body.teamId);
        if (team) {
          await data.playerProfile.recordEvent(tenant.scope, {
            playerId: player.id,
            kind: "roster_added",
            details: { team: team.name, season: team.season.name },
            actorUserId: actorId(c),
          });
        }
      }
      await audit(c, tenant, "player.created", playerDisplayName(player), {
        teamId: body.teamId ?? null,
      });
      return c.json(await detail(c, tenant, player), 201);
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
      const player = await playerOr404(tenant, id);
      return c.json(await detail(c, tenant, player), 200);
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
      const before = await playerOr404(tenant, id);
      const player = await data.players.update(tenant.scope, id, body);
      if (!player) throw notFound("Ese jugador no existe.");
      if (body.status !== undefined && body.status !== before.status) {
        await data.playerProfile.recordEvent(tenant.scope, {
          playerId: id,
          kind: "status_changed",
          details: { status: body.status },
          actorUserId: actorId(c),
        });
      }
      await audit(c, tenant, "player.updated", playerDisplayName(player), body);
      return c.json({ player: playerDto(player, tenant.organization.slug) }, 200);
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
      return c.json(await detail(c, tenant, player), 200);
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
      return c.json(await detail(c, tenant, player), 200);
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

  // --- Ficha ampliada (Bloque 12, ADR 0029): valorar con permiso de club o sobre los propios ---

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/org/players/{id}/eligible-staff",
      tags: ["Jugadores"],
      summary:
        "Miembros con rol de entrenador, personal o administración, para responsable del objetivo o del PDI",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Miembros", EligibleMembersResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      return c.json({ members: await data.teams.eligibleStaff(tenant.scope) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/objective",
      tags: ["Jugadores"],
      summary: "Fija el objetivo individual vigente del jugador (sustituye al anterior)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: PlayerObjectiveUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Jugador", PlayerDetailResponseSchema),
        400: error("El responsable no es miembro del club"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const player = await playerOr404(tenant, id);
      await requireAssess(c, tenant, id);
      await requireMember(tenant, body.ownerUserId);
      const objective = await data.playerProfile.setObjective(tenant.scope, id, body);
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId: id,
        kind: "objective_updated",
        details: { title: objective.title, progress: objective.progress },
        actorUserId: actorId(c),
      });
      await audit(c, tenant, "player.objective_updated", playerDisplayName(player), {
        title: objective.title,
        progress: objective.progress,
      });
      return c.json(await detail(c, tenant, player), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/players/{id}/objective",
      tags: ["Jugadores"],
      summary: "Quita el objetivo individual vigente",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: { params: idParam },
      responses: { 200: json("Jugador", PlayerDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const player = await playerOr404(tenant, id);
      await requireAssess(c, tenant, id);
      const removed = await data.playerProfile.clearObjective(tenant.scope, id);
      if (removed) {
        await audit(c, tenant, "player.objective_removed", playerDisplayName(player));
      }
      return c.json(await detail(c, tenant, player), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/indicators",
      tags: ["Jugadores"],
      summary:
        "Valora una o varias dimensiones del jugador (deporte, cuerpo, bienestar, compromiso)",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: PlayerIndicatorsUpdateSchema } },
          required: true,
        },
      },
      responses: { 200: json("Jugador", PlayerDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const player = await playerOr404(tenant, id);
      await requireAssess(c, tenant, id);
      await data.playerProfile.setIndicators(tenant.scope, id, body, actorId(c));
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId: id,
        kind: "indicators_updated",
        actorUserId: actorId(c),
      });
      await audit(c, tenant, "player.indicators_updated", playerDisplayName(player), body);
      return c.json(await detail(c, tenant, player), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/development-plan",
      tags: ["Jugadores"],
      summary:
        "Guarda el plan de desarrollo individual: una línea por área, coordinación, estado y revisión",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: DevelopmentPlanUpdateSchema } },
          required: true,
        },
      },
      responses: {
        200: json("Jugador", PlayerDetailResponseSchema),
        400: error("La coordinación no es miembro del club"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const player = await playerOr404(tenant, id);
      await requireAssess(c, tenant, id);
      await requireMember(tenant, body.coordinatorUserId);
      const plan = await data.playerProfile.setPlan(tenant.scope, id, body);
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId: id,
        kind: "plan_updated",
        details: { status: plan.status },
        actorUserId: actorId(c),
      });
      await audit(c, tenant, "player.plan_updated", playerDisplayName(player), {
        status: plan.status,
      });
      return c.json(await detail(c, tenant, player), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/org/players/{id}/events",
      tags: ["Jugadores"],
      summary: "Añade una anotación al timeline del jugador",
      security: [{ sessionCookie: [] }],
      middleware: [read],
      request: {
        params: idParam,
        body: {
          content: { "application/json": { schema: PlayerNoteCreateSchema } },
          required: true,
        },
      },
      responses: { 201: json("Jugador", PlayerDetailResponseSchema), ...errors },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const player = await playerOr404(tenant, id);
      await requireAssess(c, tenant, id);
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId: id,
        kind: "note",
        happenedOn: body.happenedOn,
        details: { text: body.text },
        actorUserId: actorId(c),
      });
      await audit(c, tenant, "player.note_added", playerDisplayName(player));
      return c.json(await detail(c, tenant, player), 201);
    },
  );

  // --- Foto ---

  /**
   * Foto del jugador. Cuerpo binario; fuera de la documentación OpenAPI por no ser JSON.
   * La ve el personal del club (`org.players.read`) y la propia familia del jugador.
   */
  app.get("/api/org/players/:id/photo", async (c) => {
    const tenant = scopeOf(c);
    const id = c.req.param("id");
    if (!z.string().uuid().safeParse(id).success) throw notFound();
    const actor = c.get("actor");
    if (!actor.permissions.has("org.players.read")) {
      if (!actor.permissions.has("org.family.read")) throw forbidden();
      if (!(await data.players.isGuardianOf(tenant.scope, actorId(c), id))) throw forbidden();
    }
    const photo = await data.playerProfile.readPhoto(tenant.scope, id);
    if (!photo) throw notFound("Este jugador no tiene foto.");
    const etag = `"${photo.key.split("/").at(-1) ?? ""}"`;
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.body(photo.body, 200, {
      "content-type": photo.contentType,
      "cache-control": "private, max-age=86400",
      etag,
    });
  });

  /** La familia ve la ficha reducida tras cambiar la foto; el personal, la completa. */
  async function photoResponse(c: Ctx, tenant: Tenant, player: PlayerRow) {
    if (c.get("actor").permissions.has("org.players.read")) return detail(c, tenant, player);
    return { player: playerDto(player, tenant.organization.slug) };
  }

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/org/players/{id}/photo",
      tags: ["Jugadores"],
      summary: `Sube la foto del jugador (cuerpo binario, ${PLAYER_PHOTO_CONTENT_TYPES.join(", ")}, máximo ${PLAYER_PHOTO_MAX_BYTES} bytes). Quien escribe jugadores, su cuerpo técnico o su familia`,
      security: [{ sessionCookie: [] }],
      request: { params: idParam, body: { content: photoBody, required: true } },
      responses: {
        200: json("Jugador", z.union([PlayerDetailResponseSchema, PlayerResponseSchema])),
        413: error("Demasiado grande"),
        415: error("Formato no admitido"),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      await requirePhotoWrite(c, tenant, id);
      const player = await playerOr404(tenant, id);
      const declared =
        (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!isLogoContentType(declared)) throw unsupportedMediaType();
      const length = Number(c.req.header("content-length") ?? "0");
      if (length > PLAYER_PHOTO_MAX_BYTES) throw payloadTooLarge();
      const body = await c.req.arrayBuffer();
      if (body.byteLength === 0) throw badRequest("El fichero está vacío.");
      if (body.byteLength > PLAYER_PHOTO_MAX_BYTES) throw payloadTooLarge();
      if (sniffImageType(new Uint8Array(body)) !== declared)
        throw unsupportedMediaType("El contenido no coincide con el formato declarado.");
      const key = await data.playerProfile.uploadPhoto(tenant.scope, id, body, declared, {
        cleanup: c.env?.context?.deploy?.context === "production",
      });
      if (!key) throw notFound("Ese jugador no existe.");
      await data.playerProfile.recordEvent(tenant.scope, {
        playerId: id,
        kind: "photo_updated",
        actorUserId: actorId(c),
      });
      await audit(c, tenant, "player.photo_updated", playerDisplayName(player));
      return c.json(await photoResponse(c, tenant, { ...player, photoBlobKey: key }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/org/players/{id}/photo",
      tags: ["Jugadores"],
      summary: "Quita la foto del jugador",
      security: [{ sessionCookie: [] }],
      request: { params: idParam },
      responses: {
        200: json("Jugador", z.union([PlayerDetailResponseSchema, PlayerResponseSchema])),
        ...errors,
      },
    }),
    async (c) => {
      const tenant = scopeOf(c);
      const { id } = c.req.valid("param");
      await requirePhotoWrite(c, tenant, id);
      const player = await playerOr404(tenant, id);
      const removed = await data.playerProfile.removePhoto(tenant.scope, id, {
        cleanup: c.env?.context?.deploy?.context === "production",
      });
      if (removed) await audit(c, tenant, "player.photo_removed", playerDisplayName(player));
      return c.json(await photoResponse(c, tenant, { ...player, photoBlobKey: null }), 200);
    },
  );

  return app;
}
